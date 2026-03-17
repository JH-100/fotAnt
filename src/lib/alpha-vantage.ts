// Alpha Vantage API 클라이언트

const BASE_URL = 'https://www.alphavantage.co/query'

/** API 키 가져오기 */
const getApiKey = (): string => {
  const key = process.env.ALPHA_VANTAGE_API_KEY
  if (!key) throw new Error('ALPHA_VANTAGE_API_KEY 환경변수가 설정되지 않았습니다.')
  return key
}

/** Alpha Vantage API 호출 공통 함수 */
const fetchAlphaVantage = async (params: Record<string, string>): Promise<unknown> => {
  const url = new URL(BASE_URL)
  url.searchParams.set('apikey', getApiKey())
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value)
  })

  const res = await fetch(url.toString(), { next: { revalidate: 60 } })
  if (!res.ok) {
    throw new Error(`Alpha Vantage API 오류: ${res.status}`)
  }
  return res.json()
}

/** 환율 조회 */
export const getExchangeRate = async (fromCurrency: string, toCurrency: string) => {
  const data = await fetchAlphaVantage({
    function: 'CURRENCY_EXCHANGE_RATE',
    from_currency: fromCurrency,
    to_currency: toCurrency,
  })

  const result = data as Record<string, Record<string, string>>
  const rateData = result['Realtime Currency Exchange Rate']

  if (!rateData) return null

  return {
    fromCurrency,
    toCurrency,
    rate: parseFloat(rateData['5. Exchange Rate'] ?? '0'),
    lastUpdated: rateData['6. Last Refreshed'] ?? '',
    change: 0,
    changePercent: 0,
  }
}

/** 주식 시세 조회 (글로벌) */
export const getStockQuote = async (symbol: string) => {
  const data = await fetchAlphaVantage({
    function: 'GLOBAL_QUOTE',
    symbol,
  })

  const result = data as Record<string, Record<string, string>>
  const quote = result['Global Quote']

  if (!quote) return null

  return {
    symbol: quote['01. symbol'] ?? symbol,
    price: parseFloat(quote['05. price'] ?? '0'),
    change: parseFloat(quote['09. change'] ?? '0'),
    changePercent: parseFloat((quote['10. change percent'] ?? '0').replace('%', '')),
    volume: parseInt(quote['06. volume'] ?? '0', 10),
    high: parseFloat(quote['03. high'] ?? '0'),
    low: parseFloat(quote['04. low'] ?? '0'),
    previousClose: parseFloat(quote['08. previous close'] ?? '0'),
    lastUpdated: quote['07. latest trading day'] ?? '',
  }
}
