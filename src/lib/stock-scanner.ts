// 자율 종목 스캐너 — KIS 거래량순위 + AI추천 + 분봉/일봉 지표 분석
import { getKisMinutePrices, getKisVolumeRank, getKisDailyPrices, aggregateMinuteBars } from './kis-api'
import type { TradingMode } from './kis-api'
import {
  calcRSI, calcMACD, calcBollingerBands,
  calcVWAP, calcVolumeSurge, calcShortMomentum,
  detectPullback, calcMinuteATR, calcBuySellPressure,
  calcSMA, calcATR,
  getRSISignal, getMACDSignal, getMASignal, getVolumeSignal,
} from './indicators'
import type { MinutePrice, DailyPrice } from '@/types/kis'

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

  // 단기 지표
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

  let score = 0
  const reasons: string[] = []

  // RSI(7)
  if (rsi < 25) { score += 30; reasons.push(`RSI(7) ${rsi.toFixed(0)} 극과매도`) }
  else if (rsi < 35) { score += 18; reasons.push(`RSI(7) ${rsi.toFixed(0)} 과매도`) }
  else if (rsi < 45) { score += 8 }
  else if (rsi > 80) { score -= 25; reasons.push(`RSI(7) ${rsi.toFixed(0)} 극과매수`) }
  else if (rsi > 70) { score -= 15; reasons.push(`RSI(7) ${rsi.toFixed(0)} 과매수`) }

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

  // 체결강도
  if (buySellRatio > 2) { score += 10; reasons.push(`체결강도 ${buySellRatio.toFixed(1)}`) }
  else if (buySellRatio > 1.5) { score += 5 }
  else if (buySellRatio < 0.5) { score -= 10; reasons.push(`체결강도 ${buySellRatio.toFixed(1)} 매도세`) }

  // 이평선 크로스
  if (prev3 <= prev7 && latest3 > latest7) { score += 12; reasons.push('단기이평 골든(3/7)') }
  else if (prev3 >= prev7 && latest3 < latest7) { score -= 10; reasons.push('단기이평 데드(3/7)') }

  // 익절/손절
  let takeProfitPercent = Math.max(0.5, Math.min(4, atrPercent * 3))
  let stopLossPercent = Math.max(0.3, Math.min(2.5, atrPercent * 2))
  if (score >= 50) { takeProfitPercent *= 1.3 }
  else if (score < 30) { takeProfitPercent *= 0.7; stopLossPercent *= 0.8 }
  if (volumeSurge > 3) { takeProfitPercent *= 1.2 }
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
    atr, atrPercent, takeProfitPercent, stopLossPercent,
    score, signal, reasons, source: 'minute',
  }
}

// ════════════════════════════════════════════════════
// 일봉 폴백 분석 (장외시간 또는 분봉 실패 시)
// ════════════════════════════════════════════════════

/** 일봉 기반 분석 (분봉 실패 시 폴백) */
const analyzeWithDailyBars = async (
  code: string, name: string, price: number, change: number, mode?: TradingMode
): Promise<ScanResult | null> => {
  const data = await getKisDailyPrices(code, 60, mode)
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

  // 익절/손절 (일봉 기반 — 좀 더 넓게)
  let takeProfitPercent = Math.max(1, Math.min(6, atrPercent * 1.5))
  let stopLossPercent = Math.max(1, Math.min(4, atrPercent * 1))
  if (score >= 50) { takeProfitPercent *= 1.3 }
  else if (score < 30) { takeProfitPercent *= 0.7; stopLossPercent *= 0.8 }
  if (volumeSurge > 2) { takeProfitPercent *= 1.2 }
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
    atr, atrPercent, takeProfitPercent, stopLossPercent,
    score, signal, reasons, source: 'daily',
  }
}

// ════════════════════════════════════════════════════
// 통합 분석 — 분봉 우선, 실패 시 일봉 폴백
// ════════════════════════════════════════════════════

/** 개별 종목 분석 — 분봉 시도 → 실패 시 일봉 폴백 */
const analyzeStock = async (
  code: string, name: string, price: number, change: number, mode?: TradingMode
): Promise<ScanResult | null> => {
  try {
    // 1차: 분봉 분석 시도
    const minuteResult = await analyzeWithMinuteBars(code, name, price, change, mode)
    if (minuteResult) return minuteResult
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

/** AI 추천 종목 리스트 — 주요 대형주/중형주/테마주 */
const AI_WATCH_LIST = [
  // 대형주
  { code: '005930', name: '삼성전자' },
  { code: '000660', name: 'SK하이닉스' },
  { code: '373220', name: 'LG에너지솔루션' },
  { code: '035420', name: 'NAVER' },
  { code: '035720', name: '카카오' },
  { code: '051910', name: 'LG화학' },
  { code: '006400', name: '삼성SDI' },
  { code: '068270', name: '셀트리온' },
  { code: '005380', name: '현대차' },
  { code: '000270', name: '기아' },
  { code: '207940', name: '삼성바이오로직스' },
  { code: '055550', name: '신한지주' },
  { code: '105560', name: 'KB금융' },
  // 성장주/테마
  { code: '247540', name: '에코프로비엠' },
  { code: '086520', name: '에코프로' },
  { code: '196170', name: '알테오젠' },
  { code: '328130', name: '루닛' },
  { code: '259960', name: '크래프톤' },
  { code: '352820', name: '하이브' },
  { code: '263750', name: '펄어비스' },
  // 바이오
  { code: '009420', name: '한올바이오파마' },
  { code: '214150', name: '클래시스' },
  { code: '145020', name: '휴젤' },
  { code: '950160', name: '코오롱티슈진' },
  // 반도체/IT
  { code: '042700', name: '한미반도체' },
  { code: '089030', name: '테크윙' },
  { code: '036570', name: '엔씨소프트' },
  { code: '112040', name: '위메이드' },
  { code: '293490', name: '카카오게임즈' },
  // 추가 중형주
  { code: '003490', name: '대한항공' },
  { code: '010130', name: '고려아연' },
  { code: '012330', name: '현대모비스' },
  { code: '066570', name: 'LG전자' },
  { code: '003670', name: '포스코퓨처엠' },
  { code: '028260', name: '삼성물산' },
]

/** AI 추천 — 일봉 기술분석 BUY인 종목만 반환 */
const getAIRecommendations = async (
  mode?: TradingMode,
  excludeCodes?: Set<string>
): Promise<{ code: string; name: string; price: number; change: number; aiScore: number }[]> => {
  const targets = AI_WATCH_LIST.filter(s => !excludeCodes?.has(s.code))
  if (targets.length === 0) return []

  const results: { code: string; name: string; price: number; change: number; aiScore: number }[] = []

  for (let i = 0; i < targets.length; i += 3) {
    const batch = targets.slice(i, i + 3)
    const batchResults = await Promise.allSettled(
      batch.map(async (stock) => {
        const data = await getKisDailyPrices(stock.code, 60, mode)
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

        const currentPrice = data[data.length - 1]?.close ?? 0
        const prevPrice = data[data.length - 2]?.close ?? 0
        const change = prevPrice > 0 ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0

        return { code: stock.code, name: stock.name, price: currentPrice, change, aiScore: Math.round(score * 100) }
      })
    )

    for (const r of batchResults) {
      if (r.status === 'fulfilled' && r.value) results.push(r.value)
    }
    if (i + 3 < targets.length) await new Promise(resolve => setTimeout(resolve, 300))
  }

  return results.sort((a, b) => b.aiScore - a.aiScore)
}

// ════════════════════════════════════════════════════
// 메인 스캔 — 거래량순위 + AI추천 합산
// ════════════════════════════════════════════════════

/** 시장 전체 스캔 — KIS 거래량순위 + AI추천 + 분봉/일봉 분석 */
export const scanMarket = async (mode?: TradingMode): Promise<ScanResult[]> => {
  // 1. KIS 거래량 순위 — ETF/레버리지/인버스 제외, 가격 500원 이상
  let trending: { code: string; name: string; price: number; change: number }[]
  try {
    const rank = await getKisVolumeRank(mode)
    trending = rank
      .filter(r => r.price >= 500 && !isETF(r.name))
      .map(r => ({ code: r.code, name: r.name, price: r.price, change: r.change }))
    console.log(`[스캐너] KIS 거래량순위 ${rank.length}종목 중 ${trending.length}종목 대상 (ETF/레버리지/인버스 제외)`)
  } catch (err) {
    console.log(`[스캐너] KIS 거래량순위 조회 실패: ${err instanceof Error ? err.message : String(err)}`)
    trending = []
  }

  // 2. AI 추천 종목 합류 (거래량순위에 없는 종목 중 BUY 신호)
  const rankCodes = new Set(trending.map(t => t.code))
  let aiCount = 0
  try {
    const aiPicks = await getAIRecommendations(mode, rankCodes)
    for (const pick of aiPicks.slice(0, 10)) { // 최대 10종목 추가
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

  // 3. 병렬 분석 (분봉 우선 → 일봉 폴백, 3개씩 배치)
  const results: ScanResult[] = []
  let failCount = 0
  let minuteCount = 0
  let dailyCount = 0
  const batchSize = 3

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
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
  }

  if (failCount > 0) {
    console.log(`[스캐너] ${failCount}/${trending.length}종목 분석 실패`)
  }

  const sorted = results.sort((a, b) => b.score - a.score)
  const buyCount = sorted.filter(s => s.signal === 'BUY').length
  const topStock = sorted[0]
  console.log(`[스캐너] 분석 완료: ${results.length}종목(분봉${minuteCount}+일봉${dailyCount}) / BUY ${buyCount}개 / 최고 ${topStock?.score ?? 0}점(${topStock?.name ?? '-'})`)
  return sorted
}
