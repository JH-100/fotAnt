// 한국투자증권(KIS) OpenAPI 타입 정의

/** OAuth 토큰 */
export interface KisToken {
  access_token: string
  token_type: string
  expires_in: number
  access_token_token_expired: string
}

/** 보유 종목 */
export interface KisHolding {
  code: string
  name: string
  quantity: number
  avgPrice: number
  currentPrice: number
  profitLoss: number
  profitLossPercent: number
  evalAmount: number
}

/** 계좌 잔고 */
export interface KisBalance {
  holdings: KisHolding[]
  cashBalance: number
  totalEvaluation: number
  totalProfitLoss: number
  totalProfitLossPercent: number
}

/** 주문 요청 */
export interface KisOrderRequest {
  side: 'buy' | 'sell'
  code: string
  quantity: number
  price?: number
  orderType: 'market' | 'limit'
}

/** 주문 결과 */
export interface KisOrder {
  orderId: string
  side: 'buy' | 'sell'
  code: string
  name: string
  quantity: number
  price: number
  status: 'pending' | 'executed' | 'cancelled' | 'failed'
  executedAt?: string
  message?: string
}

/** 일별 시세 (기술지표용) */
export interface DailyPrice {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/** 기술 신호 */
export interface TechnicalSignal {
  indicator: string
  value: number
  signal: 'BUY' | 'SELL' | 'HOLD'
  strength: number
}

/** 주식 추천 */
export interface StockRecommendation {
  code: string
  name: string
  currentPrice: number
  signals: TechnicalSignal[]
  overallSignal: 'BUY' | 'SELL' | 'HOLD'
  confidence: number
  summary: string
}
