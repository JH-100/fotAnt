// 환율 목업 데이터 (Frankfurter API 실패 시 대체용)
import type { ExchangeRate } from '@/types/stock'

export const MOCK_EXCHANGE_RATES: ExchangeRate[] = [
  {
    fromCurrency: 'USD',
    toCurrency: 'KRW',
    rate: 1342.50,
    reverseRate: 0.7449,
    lastUpdated: new Date().toISOString().split('T')[0] ?? '',
    change: 5.30,
    changePercent: 0.40,
  },
  {
    fromCurrency: 'JPY',
    toCurrency: 'KRW',
    rate: 8.96,
    reverseRate: 111.61,
    lastUpdated: new Date().toISOString().split('T')[0] ?? '',
    change: -0.03,
    changePercent: -0.33,
  },
  {
    fromCurrency: 'EUR',
    toCurrency: 'KRW',
    rate: 1462.80,
    reverseRate: 0.6836,
    lastUpdated: new Date().toISOString().split('T')[0] ?? '',
    change: 12.10,
    changePercent: 0.83,
  },
  {
    fromCurrency: 'CNY',
    toCurrency: 'KRW',
    rate: 185.40,
    reverseRate: 5.3938,
    lastUpdated: new Date().toISOString().split('T')[0] ?? '',
    change: -0.80,
    changePercent: -0.43,
  },
]

/** demo API 키인지 확인 */
export const isDemoMode = (): boolean => {
  return !process.env.ALPHA_VANTAGE_API_KEY || process.env.ALPHA_VANTAGE_API_KEY === 'demo'
}
