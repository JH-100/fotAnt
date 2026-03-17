// 주식 관련 타입 정의

/** 환율 데이터 */
export interface ExchangeRate {
  fromCurrency: string
  toCurrency: string
  rate: number
  reverseRate: number
  lastUpdated: string
  change: number
  changePercent: number
}

/** 주식 시세 데이터 (토스증권 기반) */
export interface StockQuote {
  code: string
  name: string
  price: number
  basePrice: number
  change: number
  changePercent: number
  changeType: 'UP' | 'DOWN' | 'FLAT'
  volume: number
  lastUpdated: string
  logoUrl?: string
}

/** 토스 랭킹 아이템 */
export interface RankingItem {
  rank: number
  code: string
  name: string
  logoUrl: string
  price: number
  priceKrw: number | null
  basePrice: number
  changePercent: number
  changeType: 'UP' | 'DOWN' | 'FLAT'
  volume: number
  amount: number
  buyCount: number
  sellCount: number
}

/** API 응답 공통 타입 */
export interface ApiResponse<T> {
  data: T
  basedAt?: string
  error?: string
}
