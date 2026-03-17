// MACD 교차 전략
import type { DailyPrice } from '@/types/kis'
import type { TradingStrategy, StrategySignal } from './types'
import { calcMACD } from '../indicators'

const macdCrossoverStrategy: TradingStrategy = {
  name: 'MACD 교차',
  description: 'MACD 히스토그램 부호 전환 시 매수/매도',

  analyze(code, name, data, currentHoldings): StrategySignal {
    const closes = data.map((d) => d.close)
    const { histogram } = calcMACD(closes)

    const latest = histogram[histogram.length - 1] ?? 0
    const prev = histogram[histogram.length - 2] ?? 0

    // 히스토그램이 음 → 양 전환: 매수 신호
    if (latest > 0 && prev <= 0 && currentHoldings === 0) {
      return {
        action: 'BUY',
        code,
        name,
        quantity: 0,
        reason: 'MACD 히스토그램 상향 전환 (골든크로스)',
        confidence: 70,
      }
    }

    // 히스토그램이 양 → 음 전환: 매도 신호
    if (latest < 0 && prev >= 0 && currentHoldings > 0) {
      return {
        action: 'SELL',
        code,
        name,
        quantity: currentHoldings,
        reason: 'MACD 히스토그램 하향 전환 (데드크로스)',
        confidence: 70,
      }
    }

    return {
      action: 'HOLD',
      code,
      name,
      quantity: 0,
      reason: `MACD 히스토그램 ${latest > 0 ? '양' : '음'}값 유지`,
      confidence: 30,
    }
  },
}

export default macdCrossoverStrategy
