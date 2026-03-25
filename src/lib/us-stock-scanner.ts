// 미장 실시간 추천 엔진 — KIS 해외주식 API + 기술 지표 분석
import { getKisOverseasDailyPrices } from './kis-api'
import type { TradingMode } from './kis-api'
import type { DailyPrice } from '@/types/kis'
import {
  calcRSI, calcMACD, calcBollingerBands, calcSMA, calcATR,
} from './indicators'

// ═══════════════════════════════════════════════════════
// US 워치리스트
// ═══════════════════════════════════════════════════════

const US_WATCHLIST = [
  // 빅테크
  { symbol: 'AAPL', name: 'Apple', exchange: 'NAS' },
  { symbol: 'MSFT', name: 'Microsoft', exchange: 'NAS' },
  { symbol: 'GOOG', name: 'Alphabet', exchange: 'NAS' },
  { symbol: 'AMZN', name: 'Amazon', exchange: 'NAS' },
  { symbol: 'META', name: 'Meta', exchange: 'NAS' },
  { symbol: 'NVDA', name: 'NVIDIA', exchange: 'NAS' },
  { symbol: 'TSLA', name: 'Tesla', exchange: 'NAS' },
  // 반도체
  { symbol: 'AMD', name: 'AMD', exchange: 'NAS' },
  { symbol: 'INTC', name: 'Intel', exchange: 'NAS' },
  { symbol: 'QCOM', name: 'Qualcomm', exchange: 'NAS' },
  { symbol: 'MU', name: 'Micron', exchange: 'NAS' },
  { symbol: 'AVGO', name: 'Broadcom', exchange: 'NAS' },
  { symbol: 'MRVL', name: 'Marvell', exchange: 'NAS' },
  // 소프트웨어
  { symbol: 'CRM', name: 'Salesforce', exchange: 'NYS' },
  { symbol: 'ADBE', name: 'Adobe', exchange: 'NAS' },
  { symbol: 'ORCL', name: 'Oracle', exchange: 'NYS' },
  { symbol: 'NOW', name: 'ServiceNow', exchange: 'NYS' },
  { symbol: 'SNOW', name: 'Snowflake', exchange: 'NYS' },
  // 핀테크
  { symbol: 'SQ', name: 'Block', exchange: 'NYS' },
  { symbol: 'PYPL', name: 'PayPal', exchange: 'NAS' },
  { symbol: 'COIN', name: 'Coinbase', exchange: 'NAS' },
  { symbol: 'SOFI', name: 'SoFi', exchange: 'NAS' },
  // 바이오
  { symbol: 'MRNA', name: 'Moderna', exchange: 'NAS' },
  { symbol: 'PFE', name: 'Pfizer', exchange: 'NYS' },
  { symbol: 'JNJ', name: 'J&J', exchange: 'NYS' },
  { symbol: 'ABBV', name: 'AbbVie', exchange: 'NYS' },
  { symbol: 'LLY', name: 'Eli Lilly', exchange: 'NYS' },
  // 소비재
  { symbol: 'NKE', name: 'Nike', exchange: 'NYS' },
  { symbol: 'SBUX', name: 'Starbucks', exchange: 'NAS' },
  { symbol: 'MCD', name: "McDonald's", exchange: 'NYS' },
  { symbol: 'DIS', name: 'Disney', exchange: 'NYS' },
  { symbol: 'NFLX', name: 'Netflix', exchange: 'NAS' },
  // 에너지
  { symbol: 'XOM', name: 'ExxonMobil', exchange: 'NYS' },
  { symbol: 'CVX', name: 'Chevron', exchange: 'NYS' },
]

// ═══════════════════════════════════════════════════════
// 미장 시간 판별
// ═══════════════════════════════════════════════════════

/** 한국시간 기준 미국 장 열림 여부 */
export const isUSMarketOpen = (): boolean => {
  const now = new Date()
  const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  const month = kst.getMonth() + 1
  const hour = kst.getHours()
  const min = kst.getMinutes()
  const time = hour * 60 + min

  // 서머타임 (3월~11월): 22:30 ~ 05:00 (다음날)
  // 비서머타임 (11월~3월): 23:30 ~ 06:00 (다음날)
  const isSummer = month >= 3 && month <= 10
  const openTime = isSummer ? 22 * 60 + 30 : 23 * 60 + 30
  const closeTime = isSummer ? 5 * 60 : 6 * 60

  // 자정 넘어가는 케이스
  if (time >= openTime) return true      // 22:30~ 또는 23:30~
  if (time <= closeTime) return true      // ~05:00 또는 ~06:00
  return false
}

// ═══════════════════════════════════════════════════════
// 타입
// ═══════════════════════════════════════════════════════

export interface UsRecommendation {
  symbol: string
  name: string
  exchange: string
  price: number         // USD
  priceKrw: number      // KRW 환산
  change: number        // 등락률 %
  score: number         // -100 ~ +100
  signal: 'BUY' | 'SELL' | 'HOLD'
  reasons: string[]
  timestamp: string     // ISO string
}

// ═══════════════════════════════════════════════════════
// 환율 캐시
// ═══════════════════════════════════════════════════════

let cachedUsdKrw = 1450
let usdKrwFetchedAt = 0
const USD_KRW_CACHE_TTL = 60 * 60 * 1000 // 1시간

const getUsdKrw = async (): Promise<number> => {
  const now = Date.now()
  if (now - usdKrwFetchedAt < USD_KRW_CACHE_TTL) return cachedUsdKrw
  try {
    const res = await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=KRW')
    if (res.ok) {
      const data = await res.json()
      cachedUsdKrw = data.rates?.KRW ?? 1450
      usdKrwFetchedAt = now
    }
  } catch { /* 실패 시 캐시된 값 사용 */ }
  return cachedUsdKrw
}

// ═══════════════════════════════════════════════════════
// 종목 분석
// ═══════════════════════════════════════════════════════

const logTime = () => {
  const now = new Date()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const h = String(now.getHours()).padStart(2, '0')
  const min = String(now.getMinutes()).padStart(2, '0')
  return `${m}/${d} ${h}:${min}`
}

const analyzeUSStock = (
  symbol: string, name: string, exchange: string,
  data: DailyPrice[], usdKrw: number
): UsRecommendation | null => {
  if (data.length < 20) return null

  const closes = data.map(d => d.close)
  const volumes = data.map(d => d.volume)
  const currentPrice = closes[closes.length - 1] ?? 0
  const prevPrice = closes[closes.length - 2] ?? currentPrice
  const change = prevPrice > 0 ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0

  // 지표 계산
  const rsiArr = calcRSI(closes, 14)
  const rsi = rsiArr[rsiArr.length - 1] ?? 50

  const { histogram } = calcMACD(closes, 12, 26, 9)
  const macdHist = histogram[histogram.length - 1] ?? 0
  const macdPrevHist = histogram[histogram.length - 2] ?? 0

  const bb = calcBollingerBands(closes, 20, 2)
  const upper = bb.upper[bb.upper.length - 1] ?? 0
  const lower = bb.lower[bb.lower.length - 1] ?? 0
  const bbPos = upper !== lower ? (currentPrice - lower) / (upper - lower) : 0.5

  const sma5 = calcSMA(closes, 5)
  const sma20 = calcSMA(closes, 20)
  const sma50 = calcSMA(closes, 50)
  const latestSma5 = sma5[sma5.length - 1] ?? 0
  const latestSma20 = sma20[sma20.length - 1] ?? 0
  const latestSma50 = sma50[sma50.length - 1] ?? 0

  const atrArr = calcATR(data, 14)
  const atr = atrArr[atrArr.length - 1] ?? 0
  const atrPercent = currentPrice > 0 ? (atr / currentPrice) * 100 : 2

  // 거래량
  const latestVol = volumes[volumes.length - 1] ?? 0
  const avgVol = volumes.slice(-20, -1).reduce((a, b) => a + b, 0) / Math.max(volumes.slice(-20, -1).length, 1)
  const volSurge = avgVol > 0 ? latestVol / avgVol : 1

  // 스코어링
  let score = 0
  const reasons: string[] = []

  // RSI
  if (rsi < 25) { score += 28; reasons.push(`RSI ${rsi.toFixed(0)} 극과매도`) }
  else if (rsi < 30) { score += 20; reasons.push(`RSI ${rsi.toFixed(0)} 과매도`) }
  else if (rsi < 40) { score += 10 }
  else if (rsi > 80) { score -= 25; reasons.push(`RSI ${rsi.toFixed(0)} 극과매수`) }
  else if (rsi > 70) { score -= 15; reasons.push(`RSI ${rsi.toFixed(0)} 과매수`) }

  // MACD
  if (macdHist > 0 && macdPrevHist <= 0) { score += 20; reasons.push('MACD 골든크로스') }
  else if (macdHist < 0 && macdPrevHist >= 0) { score -= 18; reasons.push('MACD 데드크로스') }
  else if (macdHist > 0 && macdHist > macdPrevHist) { score += 8 }
  else if (macdHist < 0 && macdHist < macdPrevHist) { score -= 8 }

  // 볼린저밴드
  if (bbPos < 0.1) { score += 15; reasons.push('BB 하단 접근') }
  else if (bbPos < 0.25) { score += 8 }
  else if (bbPos > 0.95) { score -= 12; reasons.push('BB 상단 돌파') }
  else if (bbPos > 0.85) { score -= 5 }

  // 이동평균 정렬
  if (latestSma5 > latestSma20 && latestSma20 > latestSma50) {
    score += 15; reasons.push('이평선 정배열(5>20>50)')
  } else if (latestSma5 < latestSma20 && latestSma20 < latestSma50) {
    score -= 12; reasons.push('이평선 역배열')
  }

  // SMA 크로스
  const prevSma5 = sma5[sma5.length - 2] ?? 0
  const prevSma20 = sma20[sma20.length - 2] ?? 0
  if (prevSma5 <= prevSma20 && latestSma5 > latestSma20) {
    score += 12; reasons.push('SMA 5/20 골든크로스')
  } else if (prevSma5 >= prevSma20 && latestSma5 < latestSma20) {
    score -= 10; reasons.push('SMA 5/20 데드크로스')
  }

  // 거래량
  if (volSurge >= 3 && change > 0) { score += 15; reasons.push(`거래량 ${volSurge.toFixed(1)}배 급증`) }
  else if (volSurge >= 2 && change > 0) { score += 10; reasons.push(`거래량 ${volSurge.toFixed(1)}배`) }
  else if (volSurge >= 1.5 && change > 0) { score += 5 }

  // 급락 반등 기대
  if (change < -3 && rsi < 40) { score += 12; reasons.push(`${change.toFixed(1)}% 급락 반등 기대`) }

  // 시그널
  let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD'
  if (score >= 30) signal = 'BUY'
  else if (score <= -25) signal = 'SELL'

  return {
    symbol, name, exchange,
    price: currentPrice,
    priceKrw: Math.round(currentPrice * usdKrw),
    change: Math.round(change * 100) / 100,
    score, signal, reasons,
    timestamp: new Date().toISOString(),
  }
}

// ═══════════════════════════════════════════════════════
// 스캔 실행
// ═══════════════════════════════════════════════════════

export const scanUSStocks = async (mode?: TradingMode): Promise<UsRecommendation[]> => {
  console.log(`[미장 ${logTime()}] 스캔 시작 — ${US_WATCHLIST.length}종목`)
  const usdKrw = await getUsdKrw()
  const results: UsRecommendation[] = []
  let failCount = 0

  const batchSize = 5
  for (let i = 0; i < US_WATCHLIST.length; i += batchSize) {
    const batch = US_WATCHLIST.slice(i, i + batchSize)
    const batchResults = await Promise.allSettled(
      batch.map(async (stock) => {
        const data = await getKisOverseasDailyPrices(stock.symbol, stock.exchange, 60, mode)
        return analyzeUSStock(stock.symbol, stock.name, stock.exchange, data, usdKrw)
      })
    )
    for (const r of batchResults) {
      if (r.status === 'fulfilled' && r.value) {
        results.push(r.value)
      } else {
        failCount++
      }
    }
    if (i + batchSize < US_WATCHLIST.length) {
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }

  const sorted = results.sort((a, b) => b.score - a.score)
  const buyCount = sorted.filter(s => s.signal === 'BUY').length
  const sellCount = sorted.filter(s => s.signal === 'SELL').length
  const top = sorted[0]
  console.log(`[미장 ${logTime()}] 스캔 완료: ${results.length}종목 / BUY ${buyCount} SELL ${sellCount} / 최고 ${top?.score ?? 0}점(${top?.symbol ?? '-'}) / 환율 $1=${usdKrw.toLocaleString()}원`)

  if (failCount > 0) {
    console.log(`[미장 ${logTime()}] ${failCount}종목 분석 실패`)
  }

  // BUY 시그널 강조 로그
  for (const r of sorted.filter(s => s.signal === 'BUY')) {
    console.log(`[미장 ${logTime()}] ** BUY ${r.symbol} $${r.price.toFixed(2)} (${r.priceKrw.toLocaleString()}원) [${r.score}점] ${r.reasons.join(' + ')}`)
  }

  return sorted
}

// ═══════════════════════════════════════════════════════
// 상태 관리
// ═══════════════════════════════════════════════════════

let recommendationLogs: UsRecommendation[] = []
let lastScanAt: string | null = null
let isRunning = false
let intervalId: ReturnType<typeof setInterval> | null = null
let currentMode: TradingMode | undefined

const runScan = async () => {
  try {
    const results = await scanUSStocks(currentMode)
    // BUY/SELL만 로그에 추가 (HOLD는 노이즈)
    const significant = results.filter(r => r.signal !== 'HOLD')

    // ★ 중복 제거: 같은 종목은 시그널이 바뀌었을 때만 새로 추가, 아니면 덮어쓰기
    for (const rec of significant) {
      const existIdx = recommendationLogs.findIndex(r => r.symbol === rec.symbol)
      if (existIdx !== -1) {
        const existing = recommendationLogs[existIdx]
        if (existing.signal === rec.signal) {
          // 시그널 동일 → 가격/점수만 업데이트 (중복 카드 방지)
          recommendationLogs[existIdx] = rec
        } else {
          // 시그널 변경 → 기존 제거 + 최신을 맨 앞에 추가
          recommendationLogs.splice(existIdx, 1)
          recommendationLogs.unshift(rec)
        }
      } else {
        // 새 종목 → 맨 앞에 추가
        recommendationLogs.unshift(rec)
      }
    }

    // 최대 200건 유지
    if (recommendationLogs.length > 200) {
      recommendationLogs = recommendationLogs.slice(0, 200)
    }
    lastScanAt = new Date().toISOString()
  } catch (err) {
    console.log(`[미장 ${logTime()}] 스캔 실패: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export const startUSScanner = (mode?: TradingMode) => {
  if (typeof window !== 'undefined') return
  if (isRunning) {
    console.log(`[미장 ${logTime()}] 이미 실행 중`)
    return
  }
  currentMode = mode
  isRunning = true
  console.log(`[미장 ${logTime()}] 스캐너 시작 (${mode ?? 'real'} 모드, 5분 간격)`)

  // 즉시 1회 실행
  runScan()
  // 5분 간격
  intervalId = setInterval(runScan, 5 * 60 * 1000)
}

export const stopUSScanner = () => {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
  isRunning = false
  console.log(`[미장 ${logTime()}] 스캐너 중지`)
}

export const getUSRecommendations = () => ({
  isRunning,
  recommendations: recommendationLogs,
  lastScanAt,
})
