// 기술적 지표 라이브러리
import type { DailyPrice, TechnicalSignal } from '@/types/kis'

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

/** RSI (상대강도지수) */
export const calcRSI = (prices: number[], period: number = 14): number[] => {
  const result: number[] = []
  const changes: number[] = []

  for (let i = 1; i < prices.length; i++) {
    changes.push((prices[i] ?? 0) - (prices[i - 1] ?? 0))
  }

  // 첫 번째 값은 NaN
  result.push(NaN)

  if (changes.length < period) return result

  // 초기 평균 계산
  let avgGain = 0
  let avgLoss = 0
  for (let i = 0; i < period; i++) {
    const change = changes[i] ?? 0
    if (change > 0) avgGain += change
    else avgLoss += Math.abs(change)
  }
  avgGain /= period
  avgLoss /= period

  // period 이전까지 NaN
  for (let i = 1; i < period; i++) result.push(NaN)

  // 첫 RSI
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
  result.push(100 - 100 / (1 + rs))

  // 나머지 RSI (스무딩)
  for (let i = period; i < changes.length; i++) {
    const change = changes[i] ?? 0
    avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period
    avgLoss = (avgLoss * (period - 1) + (change < 0 ? Math.abs(change) : 0)) / period
    const smoothRs = avgLoss === 0 ? 100 : avgGain / avgLoss
    result.push(100 - 100 / (1 + smoothRs))
  }

  return result
}

/** MACD (이동평균 수렴·확산) */
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

/** ATR (평균진폭) — 변동성 측정 */
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

  // 초기 ATR
  if (trueRanges.length < period) return result
  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period
  for (let i = 0; i < period; i++) result.push(NaN)
  result.push(atr)

  // 스무딩
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + (trueRanges[i] ?? 0)) / period
    result.push(atr)
  }

  return result
}

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

  // 히스토그램 부호 전환 감지
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
