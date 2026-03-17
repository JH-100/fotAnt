// 토스증권 비공식 API 클라이언트

const WTS_INFO_API = 'https://wts-info-api.tossinvest.com/api/v2'
const WTS_API = 'https://wts-api.tossinvest.com/api/v3'
const WTS_CERT_API = 'https://wts-cert-api.tossinvest.com/api/v2'

/** 토스 인증 토큰 */
interface TossTokens {
  xsrfToken: string
  browserId: string
  cookies: string
}

/** 토스 주식 시세 응답 */
interface TossPriceResult {
  prices: {
    code: string
    base: number
    close: number
    changeType: 'UP' | 'DOWN' | 'FLAT'
    currency: string
    tradingEnd: string
    nextTradingStart: string
    volume: number
  }[]
}

/** 토스 종목 정보 응답 */
interface TossStockInfo {
  code: string
  name: string
  englishName: string
  logoImageUrl: string
  market: { code: string; displayName: string }
  currency: string
}

/** 토스 랭킹 상품 */
export interface TossRankingProduct {
  rank: number
  productCode: string
  name: string
  logoImageUrl: string
  price: {
    base: number
    close: number
    baseKrw: number | null
    closeKrw: number | null
    tossSecuritiesVolume: number
    tossSecuritiesAmount: number
  }
  extraInfo: {
    tossSecuritiesBuy: number
    tossSecuritiesSell: number
  }
}

/** 토스 랭킹 응답 */
interface TossRankingResult {
  basedAt: string
  type: string
  products: TossRankingProduct[]
}

/** 토스 인증 토큰 발급 */
export const getTossTokens = async (): Promise<TossTokens> => {
  const res = await fetch(`${WTS_API}/init?tabId=`, {
    method: 'GET',
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })

  const setCookies = res.headers.getSetCookie?.() ?? []
  let xsrfToken = ''
  let browserId = ''

  for (const cookie of setCookies) {
    if (cookie.startsWith('XSRF-TOKEN=')) {
      xsrfToken = cookie.split('=')[1]?.split(';')[0] ?? ''
    }
    if (cookie.startsWith('_browserId=')) {
      browserId = cookie.split('=')[1]?.split(';')[0] ?? ''
    }
  }

  const cookieStr = setCookies.map((c) => c.split(';')[0]).join('; ')

  return { xsrfToken, browserId, cookies: cookieStr }
}

/** 국내 주식 시세 조회 (인증 불필요) */
export const getTossStockPrices = async (codes: string[]): Promise<TossPriceResult> => {
  const codesParam = codes.map((c) => (c.startsWith('A') ? c : `A${c}`)).join(',')
  const res = await fetch(`${WTS_INFO_API}/stock-prices?codes=${codesParam}`, {
    next: { revalidate: 30 },
  })

  if (!res.ok) throw new Error(`토스 시세 API 오류: ${res.status}`)
  const json = await res.json() as { result: TossPriceResult }
  return json.result
}

/** 국내 주식 종목 정보 조회 (인증 불필요) */
export const getTossStockInfos = async (codes: string[]): Promise<TossStockInfo[]> => {
  const codesParam = codes.map((c) => (c.startsWith('A') ? c : `A${c}`)).join(',')
  const res = await fetch(`${WTS_INFO_API}/stock-infos?codes=${codesParam}`, {
    next: { revalidate: 300 },
  })

  if (!res.ok) throw new Error(`토스 종목정보 API 오류: ${res.status}`)
  const json = await res.json() as { result: TossStockInfo[] }
  return json.result
}

/** 랭킹 카테고리 ID */
export const RANKING_CATEGORIES = {
  '토스증권 거래대금': 'biggest_total_amount',
  '토스증권 거래량': 'biggest_total_volume',
  '거래대금': 'biggest_market_amount',
  '거래량': 'biggest_market_volume',
  '급상승': 'heavy_soar',
  '급하락': 'heavy_descent',
} as const

export type RankingCategory = keyof typeof RANKING_CATEGORIES

/** 토스 랭킹 조회 (인증 필요) */
export const getTossRanking = async (
  categoryId: string,
  duration: string = 'realtime',
  market: string = 'all'
): Promise<TossRankingResult> => {
  const { xsrfToken, browserId, cookies } = await getTossTokens()

  const body = {
    id: categoryId,
    filters: [
      'KRX_MANAGEMENT_STOCK',
      'MARKET_CAP_GREATER_THAN_50M',
      'STOCKS_PRICE_GREATER_THAN_ONE_DOLLAR',
    ],
    duration,
    tag: market,
  }

  const res = await fetch(`${WTS_CERT_API}/dashboard/wts/overview/ranking`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-xsrf-token': xsrfToken,
      Referer: 'https://www.tossinvest.com',
      'browser-tab-id': `browser-tab-${browserId}`,
      Cookie: cookies,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) throw new Error(`토스 랭킹 API 오류: ${res.status}`)
  const json = await res.json() as { result: TossRankingResult }
  return json.result
}
