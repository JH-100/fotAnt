// 모니터링 대상 주식 및 환율 상수

/** 모니터링할 환율 쌍 */
export const EXCHANGE_PAIRS = [
  { from: 'USD', to: 'KRW', label: '달러/원' },
  { from: 'JPY', to: 'KRW', label: '엔/원' },
  { from: 'EUR', to: 'KRW', label: '유로/원' },
  { from: 'CNY', to: 'KRW', label: '위안/원' },
] as const

/** 모니터링할 국내 주식 (토스증권 코드: A + 종목코드) */
export const KR_STOCKS = [
  { code: '005930', name: '삼성전자' },
  { code: '000660', name: 'SK하이닉스' },
  { code: '035420', name: 'NAVER' },
  { code: '035720', name: '카카오' },
  { code: '051910', name: 'LG화학' },
  { code: '006400', name: '삼성SDI' },
] as const

/** 데이터 갱신 주기 (밀리초) */
export const REFRESH_INTERVAL = 30_000
