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
