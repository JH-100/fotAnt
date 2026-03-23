// 자율 종목 스캐너 — KIS 거래량순위 + AI추천 + 분봉/일봉 지표 분석
// ═══ 성능 최적화: 일봉/수급/분봉 캐싱 + 배치 확대 + 사전필터 + 병렬호출 ═══
import { getKisMinutePrices, getKisVolumeRank, getKisDailyPrices, aggregateMinuteBars, getKisInvestorTrading } from './kis-api'
import type { TradingMode } from './kis-api'
import {
  calcRSI, calcMACD, calcBollingerBands,
  calcVWAP, calcVolumeSurge, calcShortMomentum,
  detectPullback, calcMinuteATR, calcBuySellPressure,
  calcSMA, calcATR,
  calcWilliamsR, calcKeltnerChannel, detectSqueeze,
  calcVolumeProfile, calcSpreadCost,
  detectPricePattern, calcMultiTimeframeAlignment,
  getRSISignal, getMACDSignal, getMASignal, getVolumeSignal,
} from './indicators'
import type { MinutePrice, DailyPrice } from '@/types/kis'

// ═══════════════════════════════════════════════════════
// 캐시 레이어 — API 호출 최소화
// ═══════════════════════════════════════════════════════

/** 일봉 캐시: 장중에 안 바뀌므로 당일 재사용 */
const dailyCache = new Map<string, { data: DailyPrice[]; fetchedDate: string }>()

const getCachedDailyPrices = async (code: string, days: number, mode?: TradingMode): Promise<DailyPrice[]> => {
  const today = new Date().toISOString().slice(0, 10)
  const key = `${code}-${days}`
  const cached = dailyCache.get(key)
  if (cached && cached.fetchedDate === today) return cached.data
  const data = await getKisDailyPrices(code, days, mode)
  dailyCache.set(key, { data, fetchedDate: today })
  return data
}

/** 투자자 매매동향 캐시: 10분 TTL */
const investorCache = new Map<string, { data: { foreignNetBuy: number; institutionNetBuy: number }; fetchedAt: number }>()
const INVESTOR_CACHE_TTL = 10 * 60 * 1000 // 10분

const getCachedInvestorTrading = async (code: string, mode?: TradingMode) => {
  const now = Date.now()
  const cached = investorCache.get(code)
  if (cached && (now - cached.fetchedAt) < INVESTOR_CACHE_TTL) return cached.data
  const investor = await getKisInvestorTrading(code, mode)
  const data = { foreignNetBuy: investor.foreignNetBuy, institutionNetBuy: investor.institutionNetBuy }
  investorCache.set(code, { data, fetchedAt: now })
  return data
}

/** 분봉 분석 결과 캐시: 3분 TTL (사이클 간 중복 방지) */
const minuteResultCache = new Map<string, { result: ScanResult; fetchedAt: number }>()
const MINUTE_CACHE_TTL = 3 * 60 * 1000 // 3분

// ─── 커스텀 워치리스트 파일 저장 (서버 전용, 동적 require) ───
const getWatchlistPath = () => {
  if (typeof window !== 'undefined') return ''
  const path = require('path') as typeof import('path')
  return path.join(process.cwd(), '.custom-watchlist.json')
}

const loadCustomWatchList = (): { code: string; name: string }[] => {
  if (typeof window !== 'undefined') return []
  try {
    const fs = require('fs') as typeof import('fs')
    const raw = fs.readFileSync(getWatchlistPath(), 'utf-8')
    return JSON.parse(raw) ?? []
  } catch { return [] }
}

const saveCustomWatchList = (list: { code: string; name: string }[]) => {
  if (typeof window !== 'undefined') return
  try {
    const fs = require('fs') as typeof import('fs')
    fs.writeFileSync(getWatchlistPath(), JSON.stringify(list), 'utf-8')
  } catch (err) {
    console.log(`[스캐너] 워치리스트 저장 실패: ${err}`)
  }
}

export interface ScanResult {
  code: string
  name: string
  price: number
  change: number           // 등락률 %
  volume: number
  volumeSurge: number      // 거래량 급등 배수
  rsi: number              // RSI
  macdHist: number
  macdPrevHist: number
  bbPosition: number       // 볼린저밴드 위치 (0~1)
  vwap: number             // VWAP (분봉일 때만 유효)
  vwapDiff: number         // VWAP 괴리율 %
  buySellRatio: number     // 매수/매도 압력 비율
  momentum: number         // 단기 모멘텀 %
  atr: number              // ATR (원)
  atrPercent: number       // ATR% (가격 대비)
  williamsR: number        // Williams %R (-100 ~ 0)
  squeeze: boolean         // Volatility Squeeze 상태
  squeezeRelease: 'up' | 'down' | 'neutral' // 스퀴즈 해소 방향
  vpPosition: number       // Volume Profile 위치 (-1: 저평가, +1: 고평가)
  spreadCost: number       // 호가 스프레드 비용 (%)
  pattern: string          // 가격 패턴 (double-bottom, bull-flag 등)
  mtfDirection: 'bullish' | 'bearish' | 'mixed' // 멀티 타임프레임 방향
  foreignNetBuy: number    // 외국인 순매수
  institutionNetBuy: number // 기관 순매수
  takeProfitPercent: number
  stopLossPercent: number
  score: number            // 종합 점수 (-100 ~ +100)
  signal: 'BUY' | 'SELL' | 'HOLD'
  reasons: string[]
  source: 'minute' | 'daily' // 어떤 데이터로 분석했는지
}

// ETF / 레버리지 / 인버스 필터 (파생상품 ETF 거래신청 필요 → 스캔/매수 차단)
const ETF_PREFIXES = ['KODEX', 'TIGER', 'KOSEF', 'KBSTAR', 'ARIRANG', 'SOL', 'ACE', 'HANARO']
const isETF = (name: string): boolean =>
  ETF_PREFIXES.some(p => name.startsWith(p)) || name.includes('레버리지') || name.includes('인버스')

// ════════════════════════════════════════════════════
// 분봉 분석 (장중 우선)
// ════════════════════════════════════════════════════

/** 분봉 기반 분석 */
const analyzeWithMinuteBars = async (
  code: string, name: string, price: number, change: number, mode?: TradingMode
): Promise<ScanResult | null> => {
  const rawBars = await getKisMinutePrices(code, mode)
  if (rawBars.length < 20) return null

  const bars5 = aggregateMinuteBars(rawBars, 5)
  if (bars5.length < 10) return null

  const sorted1 = [...rawBars].sort((a, b) => a.time.localeCompare(b.time))
  const sorted5 = [...bars5].sort((a, b) => a.time.localeCompare(b.time))
  const closes5 = sorted5.map(b => b.close)

  // ─── 기본 지표 ───
  const rsiArr = calcRSI(closes5, 7)
  const rsi = rsiArr[rsiArr.length - 1] ?? 50

  const { histogram } = calcMACD(closes5, 6, 13, 5)
  const macdHist = histogram[histogram.length - 1] ?? 0
  const macdPrevHist = histogram[histogram.length - 2] ?? 0

  const bb = calcBollingerBands(closes5, 10, 1.5)
  const upper = bb.upper[bb.upper.length - 1] ?? 0
  const lower = bb.lower[bb.lower.length - 1] ?? 0
  const bbPosition = upper !== lower ? (price - lower) / (upper - lower) : 0.5

  const vwap = calcVWAP(sorted1)
  const vwapDiff = vwap > 0 ? ((price - vwap) / vwap) * 100 : 0
  const volumeSurge = calcVolumeSurge(sorted1, 3, 20)
  const buySellRatio = calcBuySellPressure(sorted1, 15)
  const momentum = calcShortMomentum(sorted5, 6)
  const pullback = detectPullback(sorted5, 10, 3)
  const atr = calcMinuteATR(sorted5, 10)
  const atrPercent = price > 0 ? (atr / price) * 100 : 1

  const sma3 = calcSMA(closes5, 3)
  const sma7 = calcSMA(closes5, 7)
  const latest3 = sma3[sma3.length - 1] ?? 0
  const latest7 = sma7[sma7.length - 1] ?? 0
  const prev3 = sma3[sma3.length - 2] ?? 0
  const prev7 = sma7[sma7.length - 2] ?? 0

  // ─── 고급 지표 (신규) ───
  const williamsR = calcWilliamsR(sorted5, 14)
  const squeeze = detectSqueeze(sorted5, 10, 1.5, 20, 2)
  const vp = calcVolumeProfile(sorted1, 20)
  const spreadCost = calcSpreadCost(price)

  let score = 0
  const reasons: string[] = []

  // ★ 저가주 필터: 스프레드 비용이 0.5% 이상이면 스캘핑 비효율 → 감점
  if (spreadCost >= 0.5) {
    score -= 15
    reasons.push(`스프레드 ${spreadCost.toFixed(2)}% 과다`)
  } else if (spreadCost >= 0.3) {
    score -= 5
  }

  // RSI(7)
  if (rsi < 25) { score += 30; reasons.push(`RSI(7) ${rsi.toFixed(0)} 극과매도`) }
  else if (rsi < 35) { score += 18; reasons.push(`RSI(7) ${rsi.toFixed(0)} 과매도`) }
  else if (rsi < 45) { score += 8 }
  else if (rsi > 80) { score -= 25; reasons.push(`RSI(7) ${rsi.toFixed(0)} 극과매수`) }
  else if (rsi > 70) { score -= 15; reasons.push(`RSI(7) ${rsi.toFixed(0)} 과매수`) }

  // ★ Williams %R — RSI와 상호보완 (더 빠른 반응)
  if (williamsR < -85 && rsi < 40) { score += 12; reasons.push(`W%R ${williamsR.toFixed(0)} 극과매도`) }
  else if (williamsR < -80) { score += 6 }
  else if (williamsR > -15 && rsi > 65) { score -= 10; reasons.push(`W%R ${williamsR.toFixed(0)} 극과매수`) }
  else if (williamsR > -20) { score -= 5 }

  // 거래량 급등
  if (volumeSurge >= 4 && buySellRatio > 1.2) { score += 30; reasons.push(`거래량 ${volumeSurge.toFixed(1)}배 폭증+매수세`) }
  else if (volumeSurge >= 3 && buySellRatio > 1) { score += 22; reasons.push(`거래량 ${volumeSurge.toFixed(1)}배 급증`) }
  else if (volumeSurge >= 2) { score += 14; reasons.push(`거래량 ${volumeSurge.toFixed(1)}배`) }
  else if (volumeSurge >= 1.5 && change > 0) { score += 7 }

  // VWAP
  if (vwapDiff < -1 && momentum > 0) { score += 20; reasons.push(`VWAP -${Math.abs(vwapDiff).toFixed(1)}%에서 반등`) }
  else if (vwapDiff < -0.5 && buySellRatio > 1.3) { score += 12; reasons.push('VWAP 하단+매수세') }
  else if (vwapDiff > 2) { score -= 12; reasons.push(`VWAP +${vwapDiff.toFixed(1)}% 과열`) }
  else if (vwapDiff > 1 && volumeSurge < 1.5) { score -= 5 }

  // 단기 MACD
  if (macdHist > 0 && macdPrevHist <= 0) { score += 20; reasons.push('단기MACD 골든크로스') }
  else if (macdHist < 0 && macdPrevHist >= 0) { score -= 18; reasons.push('단기MACD 데드크로스') }
  else if (macdHist > 0 && macdHist > macdPrevHist) { score += 8 }
  else if (macdHist < 0 && macdHist < macdPrevHist) { score -= 8 }

  // 눌림목
  if (pullback.isPullback) { score += 20; reasons.push(`눌림목 (${pullback.surgePercent.toFixed(1)}%↑ 후 ${pullback.pullbackPercent.toFixed(1)}% 조정)`) }

  // BB
  if (bbPosition < 0.1) { score += 15; reasons.push('BB 하단 접근') }
  else if (bbPosition < 0.25) { score += 8 }
  else if (bbPosition > 0.95) { score -= 12; reasons.push('BB 상단 돌파') }

  // ★ Volatility Squeeze — BB가 Keltner 안으로 수렴 후 방향 돌파
  if (squeeze.squeezeReleased && squeeze.direction === 'up') {
    score += 18; reasons.push('스퀴즈 상방돌파')
  } else if (squeeze.squeezeReleased && squeeze.direction === 'down') {
    score -= 15; reasons.push('스퀴즈 하방돌파')
  } else if (squeeze.isSqueeze) {
    // 스퀴즈 중: 방향 결정 전 → 대기 신호
    score += 3; reasons.push('변동성 압축(스퀴즈)')
  }

  // ★ Volume Profile — 가격대별 거래량 분포
  if (vp.position < -0.5 && momentum > 0) {
    score += 10; reasons.push('VP 저평가구간 반등')
  } else if (vp.position > 0.7 && volumeSurge < 1.5) {
    score -= 8; reasons.push('VP 고평가구간')
  }

  // 체결강도
  if (buySellRatio > 2) { score += 10; reasons.push(`체결강도 ${buySellRatio.toFixed(1)}`) }
  else if (buySellRatio > 1.5) { score += 5 }
  else if (buySellRatio < 0.5) { score -= 10; reasons.push(`체결강도 ${buySellRatio.toFixed(1)} 매도세`) }

  // 이평선 크로스
  if (prev3 <= prev7 && latest3 > latest7) { score += 12; reasons.push('단기이평 골든(3/7)') }
  else if (prev3 >= prev7 && latest3 < latest7) { score -= 10; reasons.push('단기이평 데드(3/7)') }

  // ★ 가격 패턴 인식 (쌍바닥, 불플래그, 역헤숄)
  const pattern = detectPricePattern(sorted5)
  if (pattern.pattern === 'double-bottom') {
    score += Math.round(15 * pattern.confidence); reasons.push(`패턴: ${pattern.description}`)
  } else if (pattern.pattern === 'bull-flag') {
    score += Math.round(12 * pattern.confidence); reasons.push(`패턴: ${pattern.description}`)
  } else if (pattern.pattern === 'inv-head-shoulder') {
    score += Math.round(18 * pattern.confidence); reasons.push(`패턴: ${pattern.description}`)
  }

  // ★ 멀티 타임프레임 + 수급: 일봉과 수급을 병렬로 조회 (캐시 활용)
  let dailyCloses: number[] = []
  let foreignNet = 0, instNet = 0
  const [dailyResult, investorResult] = await Promise.allSettled([
    getCachedDailyPrices(code, 10, mode),
    getCachedInvestorTrading(code, mode),
  ])
  if (dailyResult.status === 'fulfilled') {
    dailyCloses = dailyResult.value.map(d => d.close)
  }
  if (investorResult.status === 'fulfilled') {
    foreignNet = investorResult.value.foreignNetBuy
    instNet = investorResult.value.institutionNetBuy
  }

  const mtf = calcMultiTimeframeAlignment(sorted1, sorted5, dailyCloses)
  if (mtf.aligned && mtf.direction === 'bullish') {
    score += 12; reasons.push('멀티TF 상승정렬')
  } else if (mtf.aligned && mtf.direction === 'bearish') {
    score -= 10; reasons.push('멀티TF 하락정렬')
  }

  // ★ 외국인/기관 수급 (캐시에서 조회됨)
  if (foreignNet > 0 && instNet > 0) {
    score += 15; reasons.push(`외국인+기관 동반매수`)
  } else if (foreignNet > 0) {
    score += 8; reasons.push(`외국인 순매수`)
  } else if (instNet > 0) {
    score += 6; reasons.push(`기관 순매수`)
  } else if (foreignNet < 0 && instNet < 0) {
    score -= 10; reasons.push(`외국인+기관 동반매도`)
  }

  // 익절/손절 — 손절 타이트 + 익절 넓게 (최소 2배)
  let stopLossPercent = Math.max(0.8, Math.min(1.5, atrPercent * 1.5))  // 손절: 0.8~1.5% (칼손절)
  let takeProfitPercent = Math.max(stopLossPercent * 2, Math.min(6, atrPercent * 3))  // 익절: 손절의 최소 2배
  takeProfitPercent = Math.max(takeProfitPercent, spreadCost * 3, 2.0)  // 최소 2%
  if (score >= 50) { takeProfitPercent *= 1.3 }
  if (volumeSurge > 3) { takeProfitPercent *= 1.2 }
  takeProfitPercent = Math.max(takeProfitPercent, stopLossPercent * 2)  // 최종 보장: 손절의 2배
  takeProfitPercent = Math.round(takeProfitPercent * 10) / 10
  stopLossPercent = Math.round(stopLossPercent * 10) / 10

  let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD'
  if (score >= 25) signal = 'BUY'
  else if (score <= -20) signal = 'SELL'

  return {
    code, name, price, change,
    volume: sorted1[sorted1.length - 1]?.cumVolume ?? 0,
    volumeSurge, rsi, macdHist, macdPrevHist, bbPosition,
    vwap, vwapDiff, buySellRatio, momentum,
    atr, atrPercent,
    williamsR, squeeze: squeeze.isSqueeze,
    squeezeRelease: squeeze.squeezeReleased ? squeeze.direction : 'neutral',
    vpPosition: vp.position, spreadCost,
    pattern: pattern.pattern, mtfDirection: mtf.direction,
    foreignNetBuy: foreignNet, institutionNetBuy: instNet,
    takeProfitPercent, stopLossPercent,
    score, signal, reasons, source: 'minute',
  }
}

// ════════════════════════════════════════════════════
// 일봉 폴백 분석 (장외시간 또는 분봉 실패 시)
// ════════════════════════════════════════════════════

/** 일봉 기반 분석 (분봉 실패 시 폴백) — 캐시 활용 */
const analyzeWithDailyBars = async (
  code: string, name: string, price: number, change: number, mode?: TradingMode
): Promise<ScanResult | null> => {
  const data = await getCachedDailyPrices(code, 60, mode)
  if (data.length < 20) return null

  const closes = data.map(d => d.close)
  const volumes = data.map(d => d.volume)

  // RSI(9) — 일봉이지만 좀 더 짧은 기간
  const rsiArr = calcRSI(closes, 9)
  const rsi = rsiArr[rsiArr.length - 1] ?? 50

  // MACD(8,17,6) — 중단기 파라미터
  const { histogram } = calcMACD(closes, 8, 17, 6)
  const macdHist = histogram[histogram.length - 1] ?? 0
  const macdPrevHist = histogram[histogram.length - 2] ?? 0

  // 볼린저밴드(15, 2)
  const bb = calcBollingerBands(closes, 15, 2)
  const upper = bb.upper[bb.upper.length - 1] ?? 0
  const lower = bb.lower[bb.lower.length - 1] ?? 0
  const bbPosition = upper !== lower ? (price - lower) / (upper - lower) : 0.5

  // 거래량
  const latestVol = volumes[volumes.length - 1] ?? 0
  const avgVol = volumes.slice(-15, -1).reduce((a, b) => a + b, 0) / Math.max(volumes.slice(-15, -1).length, 1)
  const volumeSurge = avgVol > 0 ? latestVol / avgVol : 1

  // SMA(3/7) 일봉
  const sma3 = calcSMA(closes, 3)
  const sma7 = calcSMA(closes, 7)
  const latest3 = sma3[sma3.length - 1] ?? 0
  const latest7 = sma7[sma7.length - 1] ?? 0
  const prev3 = sma3[sma3.length - 2] ?? 0
  const prev7 = sma7[sma7.length - 2] ?? 0

  // ATR
  const atrArr = calcATR(data, 10)
  const atr = atrArr[atrArr.length - 1] ?? 0
  const atrPercent = price > 0 ? (atr / price) * 100 : 2

  // 단기 모멘텀 (3일 변화)
  const close3ago = closes[closes.length - 4] ?? price
  const momentum = close3ago > 0 ? ((price - close3ago) / close3ago) * 100 : 0

  let score = 0
  const reasons: string[] = []

  // RSI(9)
  if (rsi < 25) { score += 28; reasons.push(`RSI(9) ${rsi.toFixed(0)} 극과매도`) }
  else if (rsi < 35) { score += 16; reasons.push(`RSI(9) ${rsi.toFixed(0)} 과매도`) }
  else if (rsi < 45) { score += 6 }
  else if (rsi > 80) { score -= 22; reasons.push(`RSI(9) ${rsi.toFixed(0)} 극과매수`) }
  else if (rsi > 70) { score -= 12 }

  // 거래량
  if (volumeSurge >= 3 && change > 0) { score += 25; reasons.push(`거래량 ${volumeSurge.toFixed(1)}배 급증`) }
  else if (volumeSurge >= 2 && change > 0) { score += 15; reasons.push(`거래량 ${volumeSurge.toFixed(1)}배`) }
  else if (volumeSurge >= 1.5 && change > 0) { score += 8 }

  // MACD
  if (macdHist > 0 && macdPrevHist <= 0) { score += 20; reasons.push('MACD 골든크로스') }
  else if (macdHist < 0 && macdPrevHist >= 0) { score -= 18; reasons.push('MACD 데드크로스') }
  else if (macdHist > 0 && macdHist > macdPrevHist) { score += 8 }

  // BB
  if (bbPosition < 0.1) { score += 15; reasons.push('BB 하단 접근') }
  else if (bbPosition < 0.25) { score += 8 }
  else if (bbPosition > 0.95) { score -= 12 }

  // 이평선
  if (prev3 <= prev7 && latest3 > latest7) { score += 12; reasons.push('이평선 골든(3/7)') }
  else if (prev3 >= prev7 && latest3 < latest7) { score -= 10 }

  // 급락 반등
  if (change < -3 && rsi < 40) { score += 15; reasons.push(`${change.toFixed(1)}% 급락 반등 기대`) }

  // 익절/손절 (일봉 기반) — 손절 타이트 + 익절 넓게 (최소 2배)
  let stopLossPercent = Math.max(1, Math.min(1.5, atrPercent * 1))  // 손절: 1~1.5%
  let takeProfitPercent = Math.max(stopLossPercent * 2, Math.min(6, atrPercent * 2))  // 익절: 손절의 최소 2배
  takeProfitPercent = Math.max(takeProfitPercent, 2.5)  // 최소 2.5%
  if (score >= 50) { takeProfitPercent *= 1.3 }
  if (volumeSurge > 2) { takeProfitPercent *= 1.2 }
  takeProfitPercent = Math.max(takeProfitPercent, stopLossPercent * 2)
  takeProfitPercent = Math.round(takeProfitPercent * 10) / 10
  stopLossPercent = Math.round(stopLossPercent * 10) / 10

  let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD'
  if (score >= 25) signal = 'BUY'
  else if (score <= -20) signal = 'SELL'

  return {
    code, name, price, change,
    volume: latestVol, volumeSurge,
    rsi, macdHist, macdPrevHist, bbPosition,
    vwap: 0, vwapDiff: 0, buySellRatio: 1, momentum,
    atr, atrPercent,
    williamsR: -50, squeeze: false, squeezeRelease: 'neutral' as const,
    vpPosition: 0, spreadCost: calcSpreadCost(price),
    pattern: 'none', mtfDirection: 'mixed' as const,
    foreignNetBuy: 0, institutionNetBuy: 0,
    takeProfitPercent, stopLossPercent,
    score, signal, reasons, source: 'daily',
  }
}

// ════════════════════════════════════════════════════
// 통합 분석 — 분봉 우선, 실패 시 일봉 폴백
// ════════════════════════════════════════════════════

/** 개별 종목 분석 — 캐시 확인 → 분봉 시도 → 일봉 폴백 */
const analyzeStock = async (
  code: string, name: string, price: number, change: number, mode?: TradingMode
): Promise<ScanResult | null> => {
  // 캐시 확인: 3분 내 분석된 결과가 있으면 재사용
  const now = Date.now()
  const cached = minuteResultCache.get(code)
  if (cached && (now - cached.fetchedAt) < MINUTE_CACHE_TTL) {
    return cached.result
  }

  try {
    // 1차: 분봉 분석 시도
    const minuteResult = await analyzeWithMinuteBars(code, name, price, change, mode)
    if (minuteResult) {
      minuteResultCache.set(code, { result: minuteResult, fetchedAt: now })
      return minuteResult
    }
  } catch { /* 분봉 실패 → 일봉 시도 */ }

  try {
    // 2차: 일봉 폴백
    return await analyzeWithDailyBars(code, name, price, change, mode)
  } catch {
    return null
  }
}

// ════════════════════════════════════════════════════
// AI 추천 (일봉 기술분석) — 거래량순위 밖 종목 발굴
// ════════════════════════════════════════════════════

/** AI 워치리스트 — 종목검색 마스터와 동기화된 전체 목록 (ETF 제외) */
const STOCK_MASTER: { code: string; name: string }[] = [
  // ─── 시가총액 상위 40 ───
  { code: '005930', name: '삼성전자' },
  { code: '000660', name: 'SK하이닉스' },
  { code: '373220', name: 'LG에너지솔루션' },
  { code: '207940', name: '삼성바이오로직스' },
  { code: '005380', name: '현대차' },
  { code: '000270', name: '기아' },
  { code: '068270', name: '셀트리온' },
  { code: '035420', name: 'NAVER' },
  { code: '035720', name: '카카오' },
  { code: '051910', name: 'LG화학' },
  { code: '006400', name: '삼성SDI' },
  { code: '003670', name: '포스코퓨처엠' },
  { code: '028260', name: '삼성물산' },
  { code: '055550', name: '신한지주' },
  { code: '105560', name: 'KB금융' },
  { code: '012330', name: '현대모비스' },
  { code: '066570', name: 'LG전자' },
  { code: '003550', name: 'LG' },
  { code: '034730', name: 'SK' },
  { code: '096770', name: 'SK이노베이션' },
  { code: '032830', name: '삼성생명' },
  { code: '030200', name: 'KT' },
  { code: '086790', name: '하나금융지주' },
  { code: '017670', name: 'SK텔레콤' },
  { code: '316140', name: '우리금융지주' },
  { code: '009150', name: '삼성전기' },
  { code: '034020', name: '두산에너빌리티' },
  { code: '018260', name: '삼성에스디에스' },
  { code: '011200', name: 'HMM' },
  { code: '009540', name: 'HD한국조선해양' },
  { code: '010950', name: 'S-Oil' },
  { code: '000810', name: '삼성화재' },
  { code: '033780', name: 'KT&G' },
  { code: '259960', name: '크래프톤' },
  { code: '352820', name: '하이브' },
  { code: '196170', name: '알테오젠' },
  { code: '329180', name: 'HD현대중공업' },
  { code: '267260', name: 'HD현대' },
  { code: '005490', name: 'POSCO홀딩스' },
  { code: '138040', name: '메리츠금융지주' },
  // ─── 성장주/테마 ───
  { code: '247540', name: '에코프로비엠' },
  { code: '086520', name: '에코프로' },
  { code: '328130', name: '루닛' },
  { code: '263750', name: '펄어비스' },
  { code: '293490', name: '카카오게임즈' },
  { code: '112040', name: '위메이드' },
  { code: '036570', name: '엔씨소프트' },
  { code: '251270', name: '넷마블' },
  { code: '323410', name: '카카오뱅크' },
  { code: '377300', name: '카카오페이' },
  // ─── 바이오/헬스케어 ───
  { code: '009420', name: '한올바이오파마' },
  { code: '214150', name: '클래시스' },
  { code: '145020', name: '휴젤' },
  { code: '950160', name: '코오롱티슈진' },
  { code: '000100', name: '유한양행' },
  { code: '326030', name: 'SK바이오팜' },
  { code: '302440', name: 'SK바이오사이언스' },
  // ─── 반도체/IT ───
  { code: '042700', name: '한미반도체' },
  { code: '089030', name: '테크윙' },
  { code: '403870', name: 'HPSP' },
  { code: '058470', name: '리노공업' },
  { code: '039030', name: '이오테크닉스' },
  { code: '005290', name: '동진쎄미켐' },
  { code: '064760', name: '티씨케이' },
  { code: '357780', name: '솔브레인' },
  // ─── 방산/항공/조선 ───
  { code: '012450', name: '한화에어로스페이스' },
  { code: '047810', name: '한국항공우주' },
  { code: '272210', name: '한화시스템' },
  { code: '010140', name: '삼성중공업' },
  { code: '003490', name: '대한항공' },
  { code: '180640', name: '한진칼' },
  // ─── 소재/에너지 ───
  { code: '010130', name: '고려아연' },
  { code: '004020', name: '현대제철' },
  { code: '009830', name: '한화솔루션' },
  { code: '011790', name: 'SKC' },
  { code: '047050', name: '포스코인터내셔널' },
  { code: '298050', name: '효성첨단소재' },
  // ─── 유통/소비재 ───
  { code: '090430', name: '아모레퍼시픽' },
  { code: '004170', name: '신세계' },
  { code: '139480', name: '이마트' },
  { code: '271560', name: '오리온' },
  { code: '097950', name: 'CJ제일제당' },
  { code: '021240', name: '코웨이' },
  // ─── 인프라/유틸리티 ───
  { code: '015760', name: '한국전력' },
  { code: '036460', name: '한국가스공사' },
  { code: '024110', name: '기업은행' },
  { code: '086280', name: '현대글로비스' },
  { code: '161390', name: '한국타이어앤테크놀로지' },
  { code: '088980', name: '맥쿼리인프라' },
  { code: '402340', name: 'SK스퀘어' },
  { code: '241560', name: '두산밥캣' },
  { code: '000720', name: '현대건설' },
  { code: '041510', name: 'SM' },
]

// 사용자가 추가한 커스텀 워치리스트 (파일 저장으로 재시작 시 유지)
const customWatchList: { code: string; name: string }[] = loadCustomWatchList()

/** 커스텀 워치리스트에 종목 추가 (외부에서 호출) */
export const addToWatchList = (code: string, name: string) => {
  if (customWatchList.find(s => s.code === code)) return
  if (STOCK_MASTER.find(s => s.code === code)) return
  if (isETF(name)) return
  customWatchList.push({ code, name })
  saveCustomWatchList(customWatchList)
  console.log(`[스캐너] 워치리스트 추가: ${name}(${code}) — 총 ${STOCK_MASTER.length + customWatchList.length}종목`)
}

/** 커스텀 워치리스트 제거 */
export const removeFromWatchList = (code: string) => {
  const idx = customWatchList.findIndex(s => s.code === code)
  if (idx !== -1) {
    customWatchList.splice(idx, 1)
    saveCustomWatchList(customWatchList)
  }
}

/** 현재 전체 워치리스트 조회 */
export const getWatchList = () => [...STOCK_MASTER, ...customWatchList]

/** AI 워치리스트 = STOCK_MASTER + 커스텀 (ETF 제외) */
const getAIWatchList = (): { code: string; name: string }[] => {
  return [...STOCK_MASTER, ...customWatchList].filter(s => !isETF(s.name))
}

/** AI 추천 — 일봉 기술분석 BUY인 종목만 반환
 *  STOCK_MASTER + 커스텀 워치리스트 전체를 분석 (배치 5개씩, API 부담 분산)
 */
const getAIRecommendations = async (
  mode?: TradingMode,
  excludeCodes?: Set<string>
): Promise<{ code: string; name: string; price: number; change: number; aiScore: number }[]> => {
  const targets = getAIWatchList().filter(s => !excludeCodes?.has(s.code))
  if (targets.length === 0) return []

  console.log(`[AI추천] 워치리스트 ${targets.length}종목 분석 시작`)
  const results: { code: string; name: string; price: number; change: number; aiScore: number }[] = []

  // 8개씩 병렬 분석 (일봉 캐시 활용으로 API 부담 감소)
  const batchSize = 8
  for (let i = 0; i < targets.length; i += batchSize) {
    const batch = targets.slice(i, i + batchSize)
    const batchResults = await Promise.allSettled(
      batch.map(async (stock) => {
        const data = await getCachedDailyPrices(stock.code, 60, mode)
        if (data.length < 20) return null

        const signals = [getRSISignal(data), getMACDSignal(data), getMASignal(data), getVolumeSignal(data)]
        const weights: Record<string, number> = { RSI: 0.25, MACD: 0.3, MA: 0.25, Volume: 0.2 }
        let score = 0
        for (const sig of signals) {
          const w = weights[sig.indicator] ?? 0.25
          const base = sig.signal === 'BUY' ? 1 : sig.signal === 'SELL' ? -1 : 0
          score += base * sig.strength * w
        }

        if (score <= 0.1) return null // BUY 신호만

        // data는 과거→최신순 (kis-api에서 .reverse() 적용됨)
        const currentPrice = data[data.length - 1]?.close ?? 0
        const prevPrice = data[data.length - 2]?.close ?? 0
        const change = prevPrice > 0 ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0

        return { code: stock.code, name: stock.name, price: currentPrice, change, aiScore: Math.round(score * 100) }
      })
    )

    for (const r of batchResults) {
      if (r.status === 'fulfilled' && r.value) results.push(r.value)
    }
    if (i + batchSize < targets.length) await new Promise(resolve => setTimeout(resolve, 150))
  }

  return results.sort((a, b) => b.aiScore - a.aiScore)
}

// ════════════════════════════════════════════════════
// 메인 스캔 — 거래량순위 + AI추천 합산
// ════════════════════════════════════════════════════

/** 시장 전체 스캔 — KIS 거래량순위 + AI추천 + 분봉/일봉 분석 */
export const scanMarket = async (mode?: TradingMode): Promise<ScanResult[]> => {
  // 1. KIS 거래량 순위 — ETF 제외 + 사전 필터링 (급락/과열/저유동성 제외)
  let trending: { code: string; name: string; price: number; change: number }[]
  try {
    const rank = await getKisVolumeRank(mode)
    const filtered = rank.filter(r => r.price >= 500 && !isETF(r.name))
    // ★ 사전 필터링: 분봉 분석 전에 명확한 비대상 제거 → API 절약
    trending = filtered
      .filter(r => {
        if (r.change < -5) return false  // 급락주 제외 (하락 추세)
        if (r.change > 15) return false  // 과열주 제외 (추격매수 위험)
        return true
      })
      .map(r => ({ code: r.code, name: r.name, price: r.price, change: r.change }))
    const excluded = filtered.length - trending.length
    console.log(`[스캐너] KIS 거래량순위 ${rank.length}종목 중 ${trending.length}종목 대상 (ETF제외${filtered.length}, 필터${excluded}제외)`)
  } catch (err) {
    console.log(`[스캐너] KIS 거래량순위 조회 실패: ${err instanceof Error ? err.message : String(err)}`)
    trending = []
  }

  // 2. AI 추천 종목 합류 (거래량순위에 없는 종목 중 BUY 신호)
  const rankCodes = new Set(trending.map(t => t.code))
  let aiCount = 0
  try {
    const aiPicks = await getAIRecommendations(mode, rankCodes)
    for (const pick of aiPicks.slice(0, 20)) { // 최대 20종목 추가 (워치리스트 확대)
      trending.push({ code: pick.code, name: pick.name, price: pick.price, change: pick.change })
      aiCount++
    }
    if (aiCount > 0) {
      console.log(`[스캐너] AI추천 ${aiPicks.length}종목 중 ${aiCount}종목 추가 (${aiPicks.slice(0, 5).map(p => `${p.name}(${p.aiScore}점)`).join(', ')})`)
    }
  } catch (err) {
    console.log(`[스캐너] AI추천 조회 실패 (무시): ${err instanceof Error ? err.message : String(err)}`)
  }

  if (trending.length === 0) {
    console.log('[스캐너] 분석 대상 0종목 — 스캔 종료')
    return []
  }

  console.log(`[스캐너] 총 ${trending.length}종목 분석 시작 (거래량${trending.length - aiCount} + AI${aiCount})`)

  // 3. 병렬 분석 (분봉 우선 → 일봉 폴백, 5개씩 배치 + 캐시 활용)
  const results: ScanResult[] = []
  let failCount = 0
  let minuteCount = 0
  let dailyCount = 0
  const batchSize = 5
  const scanStart = Date.now()

  for (let i = 0; i < trending.length; i += batchSize) {
    const batch = trending.slice(i, i + batchSize)
    const batchResults = await Promise.allSettled(
      batch.map((s) => analyzeStock(s.code, s.name, s.price, s.change, mode))
    )
    for (const r of batchResults) {
      if (r.status === 'fulfilled' && r.value) {
        results.push(r.value)
        if (r.value.source === 'minute') minuteCount++
        else dailyCount++
      } else {
        failCount++
      }
    }
    if (i + batchSize < trending.length) {
      await new Promise((resolve) => setTimeout(resolve, 150))
    }
  }
  const scanElapsed = ((Date.now() - scanStart) / 1000).toFixed(1)

  if (failCount > 0) {
    console.log(`[스캐너] ${failCount}/${trending.length}종목 분석 실패`)
  }

  const sorted = results.sort((a, b) => b.score - a.score)
  const buyCount = sorted.filter(s => s.signal === 'BUY').length
  const topStock = sorted[0]
  const cacheStats = `일봉캐시${dailyCache.size}건 수급캐시${investorCache.size}건 분봉캐시${minuteResultCache.size}건`
  console.log(`[스캐너] 분석 완료 ${scanElapsed}초: ${results.length}종목(분봉${minuteCount}+일봉${dailyCount}) / BUY ${buyCount}개 / 최고 ${topStock?.score ?? 0}점(${topStock?.name ?? '-'}) [${cacheStats}]`)
  return sorted
}
