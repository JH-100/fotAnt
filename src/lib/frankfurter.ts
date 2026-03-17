// Frankfurter 환율 API 클라이언트 (무료, API 키 불필요)
// 데이터 출처: 유럽중앙은행(ECB), 매일 16:00 CET 업데이트

const BASE_URL = 'https://api.frankfurter.dev/v1'

interface FrankfurterResponse {
  amount: number
  base: string
  date: string
  rates: Record<string, number>
}

/** 최신 환율 조회 */
export const getLatestRates = async (
  base: string,
  symbols: string[]
): Promise<FrankfurterResponse> => {
  const url = `${BASE_URL}/latest?base=${base}&symbols=${symbols.join(',')}`
  const res = await fetch(url, { next: { revalidate: 300 } })
  if (!res.ok) throw new Error(`Frankfurter API 오류: ${res.status}`)
  return res.json()
}

/** 특정 날짜 환율 조회 */
export const getHistoricalRates = async (
  date: string,
  base: string,
  symbols: string[]
): Promise<FrankfurterResponse> => {
  const url = `${BASE_URL}/${date}?base=${base}&symbols=${symbols.join(',')}`
  const res = await fetch(url, { next: { revalidate: 3600 } })
  if (!res.ok) throw new Error(`Frankfurter API 오류: ${res.status}`)
  return res.json()
}

/** 어제 날짜 계산 (주말 건너뛰기) */
const getYesterday = (): string => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  // 주말이면 금요일로
  if (d.getDay() === 0) d.setDate(d.getDate() - 2)
  if (d.getDay() === 6) d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0] ?? ''
}

/** 환율 + 전일대비 변동 조회 */
export const getExchangeRatesWithChange = async (
  pairs: { from: string; to: string }[]
): Promise<{
  fromCurrency: string
  toCurrency: string
  rate: number
  reverseRate: number
  lastUpdated: string
  change: number
  changePercent: number
}[]> => {
  // KRW 기반 환율은 역산 필요 (Frankfurter는 KRW → 다른통화 가능)
  const symbols = [...new Set(pairs.map((p) => p.from))]
  const yesterday = getYesterday()

  const [today, prev] = await Promise.all([
    getLatestRates('KRW', symbols),
    getHistoricalRates(yesterday, 'KRW', symbols),
  ])

  return pairs.map((pair) => {
    // KRW 기준이므로 역수를 취해서 1 외화 = X원 으로 변환
    const todayRate = today.rates[pair.from]
    const prevRate = prev.rates[pair.from]

    if (!todayRate || !prevRate) {
      return {
        fromCurrency: pair.from,
        toCurrency: pair.to,
        rate: 0,
        reverseRate: 0,
        lastUpdated: today.date,
        change: 0,
        changePercent: 0,
      }
    }

    // 1/todayRate = 1 외화당 KRW
    const rate = 1 / todayRate
    const prevRateKrw = 1 / prevRate
    const change = rate - prevRateKrw
    const changePercent = prevRateKrw > 0 ? (change / prevRateKrw) * 100 : 0
    // 1000원당 외화 금액 (역방향)
    const reverseRate = todayRate * 1000

    return {
      fromCurrency: pair.from,
      toCurrency: pair.to,
      rate: Math.round(rate * 100) / 100,
      reverseRate: Math.round(reverseRate * 10000) / 10000,
      lastUpdated: today.date,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100,
    }
  })
}
