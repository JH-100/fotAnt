// 기술적 지표 라이브러리 — 스캘핑 단기 지표 + 기존 지표
import type { DailyPrice, MinutePrice, TechnicalSignal } from '@/types/kis'

// ════════════════════════════════════════════════════
// 기본 계산 함수 (분봉/일봉 공용)
// ════════════════════════════════════════════════════

/** SMA (단순이동평균) */
export const calcSMA = (prices: number[], period: number): number[] => {
  const result: number[] = []
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      result.push(NaN)
    } else {
      const slice = prices.slice(i - period + 1, i + 1)
      result.push(slice.reduce((a, b) => a + b, 0) / period)
    }
  }
  return result
}

/** EMA (지수이동평균) */
export const calcEMA = (prices: number[], period: number): number[] => {
  const k = 2 / (period + 1)
  const result: number[] = [prices[0] ?? 0]
  for (let i = 1; i < prices.length; i++) {
    const prev = result[i - 1] ?? 0
    result.push((prices[i] ?? 0) * k + prev * (1 - k))
  }
  return result
}

/** RSI (상대강도지수) — period 조절 가능 */
export const calcRSI = (prices: number[], period: number = 14): number[] => {
  const result: number[] = []
  const changes: number[] = []

  for (let i = 1; i < prices.length; i++) {
    changes.push((prices[i] ?? 0) - (prices[i - 1] ?? 0))
  }

  result.push(NaN)
  if (changes.length < period) return result

  let avgGain = 0
  let avgLoss = 0
  for (let i = 0; i < period; i++) {
    const change = changes[i] ?? 0
    if (change > 0) avgGain += change
    else avgLoss += Math.abs(change)
  }
  avgGain /= period
  avgLoss /= period

  for (let i = 1; i < period; i++) result.push(NaN)

  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
  result.push(100 - 100 / (1 + rs))

  for (let i = period; i < changes.length; i++) {
    const change = changes[i] ?? 0
    avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period
    avgLoss = (avgLoss * (period - 1) + (change < 0 ? Math.abs(change) : 0)) / period
    const smoothRs = avgLoss === 0 ? 100 : avgGain / avgLoss
    result.push(100 - 100 / (1 + smoothRs))
  }

  return result
}

/** MACD — 단기용 파라미터 변경 가능 */
export const calcMACD = (
  prices: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { macd: number[]; signal: number[]; histogram: number[] } => {
  const fastEMA = calcEMA(prices, fastPeriod)
  const slowEMA = calcEMA(prices, slowPeriod)

  const macd = fastEMA.map((f, i) => f - (slowEMA[i] ?? 0))
  const signal = calcEMA(macd, signalPeriod)
  const histogram = macd.map((m, i) => m - (signal[i] ?? 0))

  return { macd, signal, histogram }
}

/** 볼린저밴드 */
export const calcBollingerBands = (
  prices: number[],
  period: number = 20,
  multiplier: number = 2
): { upper: number[]; middle: number[]; lower: number[] } => {
  const middle = calcSMA(prices, period)
  const upper: number[] = []
  const lower: number[] = []

  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      upper.push(NaN)
      lower.push(NaN)
    } else {
      const slice = prices.slice(i - period + 1, i + 1)
      const mean = middle[i] ?? 0
      const variance = slice.reduce((sum, p) => sum + (p - mean) ** 2, 0) / period
      const std = Math.sqrt(variance)
      upper.push(mean + multiplier * std)
      lower.push(mean - multiplier * std)
    }
  }

  return { upper, middle, lower }
}

/** ATR (평균진폭) — 일봉용 */
export const calcATR = (data: DailyPrice[], period: number = 14): number[] => {
  const result: number[] = [0]
  const trueRanges: number[] = []

  for (let i = 1; i < data.length; i++) {
    const high = data[i]?.high ?? 0
    const low = data[i]?.low ?? 0
    const prevClose = data[i - 1]?.close ?? 0
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    )
    trueRanges.push(tr)
  }

  if (trueRanges.length < period) return result
  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period
  for (let i = 0; i < period; i++) result.push(NaN)
  result.push(atr)

  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + (trueRanges[i] ?? 0)) / period
    result.push(atr)
  }

  return result
}

// ════════════════════════════════════════════════════
// 스캘핑 단기 지표 (분봉 기반)
// ════════════════════════════════════════════════════

/** VWAP (거래량가중평균가격) — 당일 분봉 기준 */
export const calcVWAP = (bars: MinutePrice[]): number => {
  let cumPV = 0  // 누적 (가격 × 거래량)
  let cumVol = 0 // 누적 거래량

  for (const bar of bars) {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3
    cumPV += typicalPrice * bar.volume
    cumVol += bar.volume
  }

  return cumVol > 0 ? cumPV / cumVol : 0
}

/** 거래량 급등 비율 — 최근 N봉 vs 이전 평균 */
export const calcVolumeSurge = (bars: MinutePrice[], recentBars: number = 3, avgBars: number = 20): number => {
  if (bars.length < recentBars + avgBars) return 1

  const sorted = [...bars].sort((a, b) => a.time.localeCompare(b.time))
  const recentSlice = sorted.slice(-recentBars)
  const avgSlice = sorted.slice(-(recentBars + avgBars), -recentBars)

  const recentAvgVol = recentSlice.reduce((s, b) => s + b.volume, 0) / recentBars
  const historicalAvgVol = avgSlice.reduce((s, b) => s + b.volume, 0) / Math.max(avgSlice.length, 1)

  return historicalAvgVol > 0 ? recentAvgVol / historicalAvgVol : 1
}

/** 단기 모멘텀 — 최근 N봉의 가격 변화율 % */
export const calcShortMomentum = (bars: MinutePrice[], lookback: number = 10): number => {
  if (bars.length < lookback + 1) return 0

  const sorted = [...bars].sort((a, b) => a.time.localeCompare(b.time))
  const current = sorted[sorted.length - 1]?.close ?? 0
  const past = sorted[sorted.length - 1 - lookback]?.close ?? 0

  return past > 0 ? ((current - past) / past) * 100 : 0
}

/** 눌림목 감지 — 급등 후 소폭 조정 패턴 */
export const detectPullback = (bars: MinutePrice[], surgeBars: number = 15, pullbackBars: number = 5): {
  isSurge: boolean    // 직전 구간에서 급등이 있었는지
  isPullback: boolean // 현재 눌림목(소폭 조정) 상태인지
  surgePercent: number
  pullbackPercent: number
} => {
  if (bars.length < surgeBars + pullbackBars) {
    return { isSurge: false, isPullback: false, surgePercent: 0, pullbackPercent: 0 }
  }

  const sorted = [...bars].sort((a, b) => a.time.localeCompare(b.time))
  const surgeSlice = sorted.slice(-(surgeBars + pullbackBars), -pullbackBars)
  const pullbackSlice = sorted.slice(-pullbackBars)

  const surgeStart = surgeSlice[0]?.close ?? 0
  const surgeEnd = surgeSlice[surgeSlice.length - 1]?.close ?? 0
  const surgePercent = surgeStart > 0 ? ((surgeEnd - surgeStart) / surgeStart) * 100 : 0

  const pullbackStart = pullbackSlice[0]?.close ?? 0
  const pullbackEnd = pullbackSlice[pullbackSlice.length - 1]?.close ?? 0
  const pullbackPercent = pullbackStart > 0 ? ((pullbackEnd - pullbackStart) / pullbackStart) * 100 : 0

  const isSurge = surgePercent > 1.5 // 1.5% 이상 상승이 있었으면 급등
  const isPullback = isSurge && pullbackPercent < 0 && pullbackPercent > -surgePercent * 0.5
  // 조정폭이 급등폭의 50% 미만이면 눌림목

  return { isSurge, isPullback, surgePercent, pullbackPercent }
}

/** 분봉 ATR (변동성) — 분봉 데이터용 */
export const calcMinuteATR = (bars: MinutePrice[], period: number = 10): number => {
  if (bars.length < period + 1) return 0

  const sorted = [...bars].sort((a, b) => a.time.localeCompare(b.time))
  const trueRanges: number[] = []

  for (let i = 1; i < sorted.length; i++) {
    const high = sorted[i]!.high
    const low = sorted[i]!.low
    const prevClose = sorted[i - 1]!.close
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose))
    trueRanges.push(tr)
  }

  // 최근 period 개 평균
  const recent = trueRanges.slice(-period)
  return recent.reduce((a, b) => a + b, 0) / recent.length
}

/** 매수/매도 압력 비율 — 상승봉 거래량 vs 하락봉 거래량 */
export const calcBuySellPressure = (bars: MinutePrice[], lookback: number = 15): number => {
  if (bars.length < lookback) return 1

  const sorted = [...bars].sort((a, b) => a.time.localeCompare(b.time))
  const recent = sorted.slice(-lookback)

  let buyVol = 0
  let sellVol = 0

  for (const bar of recent) {
    if (bar.close >= bar.open) {
      buyVol += bar.volume
    } else {
      sellVol += bar.volume
    }
  }

  // 비율: 1 이상이면 매수세 우위, 1 미만이면 매도세 우위
  return sellVol > 0 ? buyVol / sellVol : (buyVol > 0 ? 3 : 1)
}

// ════════════════════════════════════════════════════
// 고급 지표 (Williams %R, Keltner Channel, Squeeze, Volume Profile)
// ════════════════════════════════════════════════════

/** Williams %R — RSI보다 반응이 빠른 과매수/과매도 오실레이터 (-100 ~ 0) */
export const calcWilliamsR = (bars: MinutePrice[], period: number = 14): number => {
  if (bars.length < period) return -50
  const sorted = [...bars].sort((a, b) => a.time.localeCompare(b.time))
  const recent = sorted.slice(-period)
  const highestHigh = Math.max(...recent.map(b => b.high))
  const lowestLow = Math.min(...recent.map(b => b.low))
  const currentClose = sorted[sorted.length - 1]!.close
  if (highestHigh === lowestLow) return -50
  return ((highestHigh - currentClose) / (highestHigh - lowestLow)) * -100
}

/** Keltner Channel — EMA ± ATR 배수 (볼린저밴드와 조합하여 Squeeze 감지) */
export const calcKeltnerChannel = (bars: MinutePrice[], emaPeriod: number = 20, atrMult: number = 2): {
  upper: number; middle: number; lower: number
} => {
  if (bars.length < emaPeriod + 1) return { upper: 0, middle: 0, lower: 0 }
  const sorted = [...bars].sort((a, b) => a.time.localeCompare(b.time))
  const closes = sorted.map(b => b.close)
  const ema = calcEMA(closes, emaPeriod)
  const middle = ema[ema.length - 1] ?? 0
  const atr = calcMinuteATR(sorted, emaPeriod)
  return {
    upper: middle + atrMult * atr,
    middle,
    lower: middle - atrMult * atr,
  }
}

/** Volatility Squeeze 감지 — BB가 KC 안에 들어가면 변동성 압축 → 폭발 직전 */
export const detectSqueeze = (bars: MinutePrice[], bbPeriod: number = 10, bbMult: number = 1.5, kcPeriod: number = 20, kcMult: number = 2): {
  isSqueeze: boolean    // 현재 스퀴즈 상태인가
  squeezeReleased: boolean // 스퀴즈 직후 해소된 상태인가 (돌파 신호)
  direction: 'up' | 'down' | 'neutral' // 해소 방향
} => {
  if (bars.length < kcPeriod + 5) return { isSqueeze: false, squeezeReleased: false, direction: 'neutral' }
  const sorted = [...bars].sort((a, b) => a.time.localeCompare(b.time))
  const closes = sorted.map(b => b.close)

  // 현재 BB & KC
  const bb = calcBollingerBands(closes, bbPeriod, bbMult)
  const bbUpper = bb.upper[bb.upper.length - 1] ?? 0
  const bbLower = bb.lower[bb.lower.length - 1] ?? 0
  const kc = calcKeltnerChannel(sorted, kcPeriod, kcMult)

  const isSqueeze = bbUpper < kc.upper && bbLower > kc.lower

  // 이전 봉의 BB & KC (스퀴즈 해소 감지)
  const prevBars = sorted.slice(0, -1)
  const prevCloses = prevBars.map(b => b.close)
  const prevBB = calcBollingerBands(prevCloses, bbPeriod, bbMult)
  const prevBBUpper = prevBB.upper[prevBB.upper.length - 1] ?? 0
  const prevBBLower = prevBB.lower[prevBB.lower.length - 1] ?? 0
  const prevKC = calcKeltnerChannel(prevBars, kcPeriod, kcMult)
  const wasSqueeze = prevBBUpper < prevKC.upper && prevBBLower > prevKC.lower

  const squeezeReleased = wasSqueeze && !isSqueeze
  const currentClose = closes[closes.length - 1] ?? 0
  const prevClose = closes[closes.length - 2] ?? 0
  const direction = squeezeReleased
    ? (currentClose > prevClose ? 'up' : currentClose < prevClose ? 'down' : 'neutral')
    : 'neutral'

  return { isSqueeze, squeezeReleased, direction }
}

/** Volume Profile — 가격대별 거래량 분포 (POC, VAH, VAL) */
export const calcVolumeProfile = (bars: MinutePrice[], bins: number = 20): {
  poc: number       // Point of Control: 최다 거래 가격대
  vah: number       // Value Area High (거래량 70% 구간 상단)
  val: number       // Value Area Low (거래량 70% 구간 하단)
  position: number  // 현재가의 VA 대비 위치 (-1: 저평가, 0: 적정, +1: 고평가)
} => {
  if (bars.length < 10) return { poc: 0, vah: 0, val: 0, position: 0 }
  const sorted = [...bars].sort((a, b) => a.time.localeCompare(b.time))
  const currentPrice = sorted[sorted.length - 1]!.close

  const allPrices = sorted.flatMap(b => [b.high, b.low, b.close])
  const minP = Math.min(...allPrices)
  const maxP = Math.max(...allPrices)
  if (maxP === minP) return { poc: currentPrice, vah: currentPrice, val: currentPrice, position: 0 }

  const binSize = (maxP - minP) / bins
  const volumeByBin: number[] = new Array(bins).fill(0)

  for (const bar of sorted) {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3
    const binIdx = Math.min(Math.floor((typicalPrice - minP) / binSize), bins - 1)
    volumeByBin[binIdx] += bar.volume
  }

  // POC: 최대 거래량 bin
  let maxVol = 0, pocIdx = 0
  for (let i = 0; i < bins; i++) {
    if (volumeByBin[i]! > maxVol) { maxVol = volumeByBin[i]!; pocIdx = i }
  }
  const poc = minP + (pocIdx + 0.5) * binSize

  // Value Area: POC에서 양쪽으로 확장하여 전체 거래량 70% 구간
  const totalVol = volumeByBin.reduce((a, b) => a + b, 0)
  const targetVol = totalVol * 0.70
  let vaLow = pocIdx, vaHigh = pocIdx
  let vaVol = volumeByBin[pocIdx]!

  while (vaVol < targetVol && (vaLow > 0 || vaHigh < bins - 1)) {
    const leftVol = vaLow > 0 ? volumeByBin[vaLow - 1]! : 0
    const rightVol = vaHigh < bins - 1 ? volumeByBin[vaHigh + 1]! : 0
    if (leftVol >= rightVol && vaLow > 0) { vaLow--; vaVol += leftVol }
    else if (vaHigh < bins - 1) { vaHigh++; vaVol += rightVol }
    else { vaLow--; vaVol += leftVol }
  }

  const val = minP + vaLow * binSize
  const vah = minP + (vaHigh + 1) * binSize
  const position = vah !== val
    ? currentPrice < val ? -1 : currentPrice > vah ? 1 : ((currentPrice - val) / (vah - val)) * 2 - 1
    : 0

  return { poc, vah, val, position }
}

/** KRX 호가 단위 계산 — 가격대별 최소 호가 단위 */
export const getTickSize = (price: number): number => {
  if (price < 2000) return 1
  if (price < 5000) return 5
  if (price < 20000) return 10
  if (price < 50000) return 50
  if (price < 200000) return 100
  if (price < 500000) return 500
  return 1000
}

/** 스프레드 비용 비율 — 호가 단위 / 가격 × 100 (%) */
export const calcSpreadCost = (price: number): number => {
  return (getTickSize(price) / price) * 100
}

// ════════════════════════════════════════════════════
// 가격 패턴 인식 (쌍바닥, 역헤드앤숄더, 깃발)
// ════════════════════════════════════════════════════

export type PatternType = 'double-bottom' | 'inv-head-shoulder' | 'bull-flag' | 'none'

/** 가격 패턴 감지 — 분봉/일봉 공용 */
export const detectPricePattern = (bars: MinutePrice[]): {
  pattern: PatternType
  confidence: number  // 0~1
  description: string
} => {
  if (bars.length < 20) return { pattern: 'none', confidence: 0, description: '' }
  const sorted = [...bars].sort((a, b) => a.time.localeCompare(b.time))
  const closes = sorted.map(b => b.close)
  const n = closes.length

  // 1) 쌍바닥 (Double Bottom) — W자 패턴
  // 조건: 두 개의 근접한 저점(±1%) + 사이에 중간 고점
  const recentCloses = closes.slice(-20)
  const minPrice = Math.min(...recentCloses)
  const maxPrice = Math.max(...recentCloses)
  const range = maxPrice - minPrice
  if (range > 0) {
    const threshold = minPrice * 1.01  // 저점 ± 1%
    const lows: number[] = []
    for (let i = 1; i < recentCloses.length - 1; i++) {
      if (recentCloses[i]! <= threshold &&
          recentCloses[i]! <= recentCloses[i - 1]! &&
          recentCloses[i]! <= recentCloses[i + 1]!) {
        lows.push(i)
      }
    }
    if (lows.length >= 2) {
      const [first, second] = [lows[0]!, lows[lows.length - 1]!]
      const gap = second - first
      if (gap >= 4 && gap <= 15) {
        const middleMax = Math.max(...recentCloses.slice(first, second + 1))
        const necklineBreak = recentCloses[recentCloses.length - 1]! > middleMax * 0.99
        const lowDiff = Math.abs(recentCloses[first]! - recentCloses[second]!) / recentCloses[first]!
        if (lowDiff < 0.02 && necklineBreak) {
          return { pattern: 'double-bottom', confidence: 0.7 + (necklineBreak ? 0.15 : 0), description: `쌍바닥(W) — 저점 ${gap}봉 간격` }
        }
      }
    }
  }

  // 2) 불 플래그 (Bull Flag) — 급등 후 좁은 횡보/미세 조정
  if (n >= 15) {
    const flagPole = closes.slice(-15, -5)
    const flag = closes.slice(-5)
    const poleStart = flagPole[0] ?? 0
    const poleEnd = flagPole[flagPole.length - 1] ?? 0
    const poleGain = poleStart > 0 ? ((poleEnd - poleStart) / poleStart) * 100 : 0
    const flagHigh = Math.max(...flag)
    const flagLow = Math.min(...flag)
    const flagRange = flagHigh > 0 ? ((flagHigh - flagLow) / flagHigh) * 100 : 0

    if (poleGain > 2 && flagRange < poleGain * 0.4) {
      const breakout = closes[n - 1]! > flagHigh
      return {
        pattern: 'bull-flag',
        confidence: breakout ? 0.75 : 0.55,
        description: `불플래그 — 기둥 +${poleGain.toFixed(1)}%, 깃발 ${flagRange.toFixed(1)}%${breakout ? ' 돌파' : ''}`,
      }
    }
  }

  // 3) 역헤드앤숄더 (Inverse H&S) — 3개 저점 중 가운데가 가장 낮음
  if (n >= 20) {
    const segment = closes.slice(-20)
    // 5구간으로 나눠서 저점 찾기
    const segSize = Math.floor(segment.length / 3)
    const leftMin = Math.min(...segment.slice(0, segSize))
    const headMin = Math.min(...segment.slice(segSize, segSize * 2))
    const rightMin = Math.min(...segment.slice(segSize * 2))

    if (headMin < leftMin && headMin < rightMin) {
      const leftDiff = Math.abs(leftMin - rightMin) / leftMin
      if (leftDiff < 0.03) {  // 좌우 어깨 대칭 (±3%)
        const neckline = Math.max(leftMin, rightMin) * 1.01
        const breakout = closes[n - 1]! > neckline
        return {
          pattern: 'inv-head-shoulder',
          confidence: breakout ? 0.8 : 0.5,
          description: `역헤숄 — 머리 ${headMin}, 어깨 ${leftMin}/${rightMin}${breakout ? ' 넥라인 돌파' : ''}`,
        }
      }
    }
  }

  return { pattern: 'none', confidence: 0, description: '' }
}

/** 멀티 타임프레임 정렬도 — 1분봉/5분봉/일봉 방향이 일치하는지 확인 */
export const calcMultiTimeframeAlignment = (
  bars1m: MinutePrice[],
  bars5m: MinutePrice[],
  dailyCloses: number[]
): {
  aligned: boolean      // 3개 타임프레임 모두 같은 방향인가
  direction: 'bullish' | 'bearish' | 'mixed'
  score: number          // -3 ~ +3 (강한 하락 ~ 강한 상승)
} => {
  let score = 0

  // 1분봉 방향: 최근 5봉 추세
  if (bars1m.length >= 6) {
    const sorted = [...bars1m].sort((a, b) => a.time.localeCompare(b.time))
    const recent = sorted.slice(-5)
    const first = recent[0]!.close
    const last = recent[recent.length - 1]!.close
    score += last > first ? 1 : last < first ? -1 : 0
  }

  // 5분봉 방향: 최근 3봉 추세
  if (bars5m.length >= 4) {
    const sorted = [...bars5m].sort((a, b) => a.time.localeCompare(b.time))
    const recent = sorted.slice(-3)
    const first = recent[0]!.close
    const last = recent[recent.length - 1]!.close
    score += last > first ? 1 : last < first ? -1 : 0
  }

  // 일봉 방향: SMA(3) vs SMA(7)
  if (dailyCloses.length >= 7) {
    const sma3 = dailyCloses.slice(-3).reduce((a, b) => a + b, 0) / 3
    const sma7 = dailyCloses.slice(-7).reduce((a, b) => a + b, 0) / 7
    score += sma3 > sma7 ? 1 : sma3 < sma7 ? -1 : 0
  }

  const direction = score >= 2 ? 'bullish' : score <= -2 ? 'bearish' : 'mixed'
  return { aligned: Math.abs(score) >= 2, direction, score }
}

// ════════════════════════════════════════════════════
// 레거시 신호 분석 함수 (추천 엔진에서 사용)
// ════════════════════════════════════════════════════

/** RSI 신호 분석 */
export const getRSISignal = (data: DailyPrice[]): TechnicalSignal => {
  const closes = data.map((d) => d.close)
  const rsi = calcRSI(closes, 14)
  const latest = rsi[rsi.length - 1] ?? 50

  let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD'
  let strength = 0

  if (latest <= 30) {
    signal = 'BUY'
    strength = Math.min((30 - latest) / 30, 1)
  } else if (latest >= 70) {
    signal = 'SELL'
    strength = Math.min((latest - 70) / 30, 1)
  } else {
    strength = 0.3
  }

  return { indicator: 'RSI', value: Math.round(latest * 100) / 100, signal, strength }
}

/** MACD 신호 분석 */
export const getMACDSignal = (data: DailyPrice[]): TechnicalSignal => {
  const closes = data.map((d) => d.close)
  const { histogram } = calcMACD(closes)
  const latest = histogram[histogram.length - 1] ?? 0
  const prev = histogram[histogram.length - 2] ?? 0

  let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD'
  let strength = 0

  if (latest > 0 && prev <= 0) {
    signal = 'BUY'
    strength = 0.8
  } else if (latest < 0 && prev >= 0) {
    signal = 'SELL'
    strength = 0.8
  } else if (latest > 0) {
    signal = latest > prev ? 'BUY' : 'HOLD'
    strength = latest > prev ? 0.5 : 0.3
  } else {
    signal = latest < prev ? 'SELL' : 'HOLD'
    strength = latest < prev ? 0.5 : 0.3
  }

  return { indicator: 'MACD', value: Math.round(latest * 100) / 100, signal, strength }
}

/** 이동평균선 신호 (골든크로스/데드크로스) */
export const getMASignal = (data: DailyPrice[]): TechnicalSignal => {
  const closes = data.map((d) => d.close)
  const sma5 = calcSMA(closes, 5)
  const sma20 = calcSMA(closes, 20)

  const latest5 = sma5[sma5.length - 1] ?? 0
  const latest20 = sma20[sma20.length - 1] ?? 0
  const prev5 = sma5[sma5.length - 2] ?? 0
  const prev20 = sma20[sma20.length - 2] ?? 0

  let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD'
  let strength = 0

  if (prev5 <= prev20 && latest5 > latest20) {
    signal = 'BUY'
    strength = 0.9
  } else if (prev5 >= prev20 && latest5 < latest20) {
    signal = 'SELL'
    strength = 0.9
  } else if (latest5 > latest20) {
    signal = 'BUY'
    strength = 0.4
  } else {
    signal = 'SELL'
    strength = 0.4
  }

  const diff = latest20 > 0 ? ((latest5 - latest20) / latest20) * 100 : 0
  return { indicator: 'MA', value: Math.round(diff * 100) / 100, signal, strength }
}

/** 거래량 신호 */
export const getVolumeSignal = (data: DailyPrice[]): TechnicalSignal => {
  if (data.length < 21) {
    return { indicator: 'Volume', value: 0, signal: 'HOLD', strength: 0.2 }
  }

  const volumes = data.map((d) => d.volume)
  const latestVol = volumes[volumes.length - 1] ?? 0
  const avgVol = volumes.slice(-20, -1).reduce((a, b) => a + b, 0) / 19
  const ratio = avgVol > 0 ? latestVol / avgVol : 1

  const latestClose = data[data.length - 1]?.close ?? 0
  const prevClose = data[data.length - 2]?.close ?? 0
  const priceUp = latestClose > prevClose

  let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD'
  let strength = 0.3

  if (ratio > 2) {
    signal = priceUp ? 'BUY' : 'SELL'
    strength = Math.min(ratio / 5, 1)
  } else if (ratio > 1.5) {
    signal = priceUp ? 'BUY' : 'SELL'
    strength = 0.5
  }

  return { indicator: 'Volume', value: Math.round(ratio * 100) / 100, signal, strength }
}
