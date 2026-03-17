// 모멘텀 전략 (거래량 + 가격 추세)
import type { DailyPrice } from '@/types/kis'
import type { TradingStrategy, StrategySignal } from './types'
import { calcSMA } from '../indicators'

const momentumStrategy: TradingStrategy = {
  name: '모멘텀',
  description: '5일 이동평균 > 20일 이동평균 + 거래량 증가 시 매수',

  analyze(code, name, data, currentHoldings): StrategySignal {
    if (data.length < 25) {
      return { action: 'HOLD', code, name, quantity: 0, reason: '데이터 부족', confidence: 0 }
    }

    const closes = data.map((d) => d.close)
    const volumes = data.map((d) => d.volume)

    const sma5 = calcSMA(closes, 5)
    const sma20 = calcSMA(closes, 20)

    const latest5 = sma5[sma5.length - 1] ?? 0
    const latest20 = sma20[sma20.length - 1] ?? 0
    const prev5 = sma5[sma5.length - 2] ?? 0
    const prev20 = sma20[sma20.length - 2] ?? 0

    // 거래량 체크
    const latestVol = volumes[volumes.length - 1] ?? 0
    const avgVol = volumes.slice(-20, -1).reduce((a, b) => a + b, 0) / 19
    const volumeRising = latestVol > avgVol * 1.3

    // 골든크로스 + 거래량 증가 → 매수
    if (prev5 <= prev20 && latest5 > latest20 && volumeRising && currentHoldings === 0) {
      return {
        action: 'BUY',
        code,
        name,
        quantity: 0,
        reason: `골든크로스 + 거래량 ${(latestVol / avgVol).toFixed(1)}배`,
        confidence: 80,
      }
    }

    // 데드크로스 → 매도
    if (prev5 >= prev20 && latest5 < latest20 && currentHoldings > 0) {
      return {
        action: 'SELL',
        code,
        name,
        quantity: currentHoldings,
        reason: '데드크로스 발생',
        confidence: 75,
      }
    }

    // 하향 추세 + 보유 → 매도
    if (latest5 < latest20 && currentHoldings > 0) {
      return {
        action: 'SELL',
        code,
        name,
        quantity: currentHoldings,
        reason: '하향 추세 지속 (5일선 < 20일선)',
        confidence: 50,
      }
    }

    return {
      action: 'HOLD',
      code,
      name,
      quantity: 0,
      reason: latest5 > latest20 ? '상승 추세 유지' : '하락 추세 관망',
      confidence: 30,
    }
  },
}

export default momentumStrategy
