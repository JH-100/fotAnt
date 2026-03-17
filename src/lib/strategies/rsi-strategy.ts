// RSI 기반 역추세 전략
import type { DailyPrice } from '@/types/kis'
import type { TradingStrategy, StrategySignal } from './types'
import { calcRSI } from '../indicators'

const rsiStrategy: TradingStrategy = {
  name: 'RSI 역추세',
  description: 'RSI 30 이하 매수, 70 이상 매도 (14일 기준)',

  analyze(code, name, data, currentHoldings): StrategySignal {
    const closes = data.map((d) => d.close)
    const rsi = calcRSI(closes, 14)
    const latest = rsi[rsi.length - 1] ?? 50
    const currentPrice = data[data.length - 1]?.close ?? 0

    if (latest <= 30 && currentHoldings === 0) {
      return {
        action: 'BUY',
        code,
        name,
        quantity: 0, // auto-trader에서 투자금액 기반으로 계산
        reason: `RSI ${latest.toFixed(1)} 과매도 구간 진입`,
        confidence: Math.min((30 - latest) / 20 * 100, 100),
      }
    }

    if (latest >= 70 && currentHoldings > 0) {
      return {
        action: 'SELL',
        code,
        name,
        quantity: currentHoldings,
        reason: `RSI ${latest.toFixed(1)} 과매수 구간 진입`,
        confidence: Math.min((latest - 70) / 20 * 100, 100),
      }
    }

    return {
      action: 'HOLD',
      code,
      name,
      quantity: 0,
      reason: `RSI ${latest.toFixed(1)} 중립 구간`,
      confidence: 30,
    }
  },
}

export default rsiStrategy
