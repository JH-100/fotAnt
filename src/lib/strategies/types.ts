// 자동매매 전략 인터페이스
import type { DailyPrice, KisOrderRequest } from '@/types/kis'

/** 전략 신호 */
export interface StrategySignal {
  action: 'BUY' | 'SELL' | 'HOLD'
  code: string
  name: string
  quantity: number
  price?: number
  reason: string
  confidence: number
}

/** 전략 인터페이스 */
export interface TradingStrategy {
  name: string
  description: string
  analyze: (
    code: string,
    name: string,
    data: DailyPrice[],
    currentHoldings: number
  ) => StrategySignal
}

/** 안전 설정 */
export interface SafetyConfig {
  maxPositionPercent: number    // 포지션 한도 (총 자산 대비 %)
  maxDailyLossPercent: number   // 일일 최대 손실 %
  stopLossPercent: number       // 종목별 손절 %
  maxDailyOrders: number        // 일일 최대 주문 수
  investPerTrade: number        // 건당 투자금액 (원)
}

export const DEFAULT_SAFETY: SafetyConfig = {
  maxPositionPercent: 20,
  maxDailyLossPercent: 3,
  stopLossPercent: 5,
  maxDailyOrders: 10,
  investPerTrade: 100000,
}

/** 매매 로그 */
export interface TradeLogEntry {
  id: string
  timestamp: string
  strategy: string
  action: 'BUY' | 'SELL'
  code: string
  name: string
  quantity: number
  price: number
  reason: string
  result: 'success' | 'failed'
  message?: string
}

/** 전략 신호를 주문 요청으로 변환 */
export const signalToOrder = (signal: StrategySignal): KisOrderRequest | null => {
  if (signal.action === 'HOLD') return null
  return {
    side: signal.action === 'BUY' ? 'buy' : 'sell',
    code: signal.code,
    quantity: signal.quantity,
    price: signal.price,
    orderType: signal.price ? 'limit' : 'market',
  }
}
