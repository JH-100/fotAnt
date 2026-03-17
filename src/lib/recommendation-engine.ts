// 주식 추천 엔진
import type { DailyPrice, StockRecommendation, TechnicalSignal } from '@/types/kis'
import { getRSISignal, getMACDSignal, getMASignal, getVolumeSignal } from './indicators'

/** 가중치 설정 */
const WEIGHTS: Record<string, number> = {
  RSI: 0.25,
  MACD: 0.3,
  MA: 0.25,
  Volume: 0.2,
}

/** 신호를 숫자로 변환 (-1 ~ 1) */
const signalToScore = (signal: TechnicalSignal): number => {
  const base = signal.signal === 'BUY' ? 1 : signal.signal === 'SELL' ? -1 : 0
  return base * signal.strength
}

/** 단일 종목의 종합 추천 생성 */
export const analyzeStock = (
  code: string,
  name: string,
  data: DailyPrice[]
): StockRecommendation | null => {
  if (data.length < 30) return null

  const signals: TechnicalSignal[] = [
    getRSISignal(data),
    getMACDSignal(data),
    getMASignal(data),
    getVolumeSignal(data),
  ]

  // 가중 평균 점수 계산
  let weightedScore = 0
  let totalWeight = 0
  for (const sig of signals) {
    const w = WEIGHTS[sig.indicator] ?? 0.25
    weightedScore += signalToScore(sig) * w
    totalWeight += w
  }
  const avgScore = totalWeight > 0 ? weightedScore / totalWeight : 0

  // 종합 신호 판정
  let overallSignal: 'BUY' | 'SELL' | 'HOLD'
  if (avgScore > 0.2) overallSignal = 'BUY'
  else if (avgScore < -0.2) overallSignal = 'SELL'
  else overallSignal = 'HOLD'

  // 신뢰도 (0~100)
  const confidence = Math.round(Math.abs(avgScore) * 100)

  // 요약 생성
  const summary = generateSummary(signals, overallSignal, confidence)

  return {
    code,
    name,
    currentPrice: data[data.length - 1]?.close ?? 0,
    signals,
    overallSignal,
    confidence: Math.min(confidence, 100),
    summary,
  }
}

/** 요약 텍스트 생성 */
const generateSummary = (
  signals: TechnicalSignal[],
  overall: 'BUY' | 'SELL' | 'HOLD',
  confidence: number
): string => {
  const parts: string[] = []

  const rsi = signals.find((s) => s.indicator === 'RSI')
  if (rsi) {
    if (rsi.value <= 30) parts.push(`RSI ${rsi.value} 과매도`)
    else if (rsi.value >= 70) parts.push(`RSI ${rsi.value} 과매수`)
    else parts.push(`RSI ${rsi.value} 중립`)
  }

  const macd = signals.find((s) => s.indicator === 'MACD')
  if (macd?.signal === 'BUY') parts.push('MACD 상향교차')
  else if (macd?.signal === 'SELL') parts.push('MACD 하향교차')

  const ma = signals.find((s) => s.indicator === 'MA')
  if (ma?.signal === 'BUY' && ma.strength > 0.7) parts.push('골든크로스')
  else if (ma?.signal === 'SELL' && ma.strength > 0.7) parts.push('데드크로스')

  const vol = signals.find((s) => s.indicator === 'Volume')
  if (vol && vol.value > 2) parts.push(`거래량 ${vol.value}배 급증`)

  const action = overall === 'BUY' ? '매수 추천' : overall === 'SELL' ? '매도 추천' : '관망 추천'
  return `${action} (신뢰도 ${confidence}%) — ${parts.join(', ')}`
}

/** 여러 종목 일괄 분석 */
export const analyzeStocks = (
  stocks: { code: string; name: string; data: DailyPrice[] }[]
): StockRecommendation[] => {
  return stocks
    .map((s) => analyzeStock(s.code, s.name, s.data))
    .filter((r): r is StockRecommendation => r !== null)
    .sort((a, b) => b.confidence - a.confidence)
}
