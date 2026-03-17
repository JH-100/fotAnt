// 한국투자증권(KIS) OpenAPI 클라이언트
import type { KisToken, KisBalance, KisHolding, KisOrder, KisOrderRequest, DailyPrice } from '@/types/kis'

/** 모의투자 모드 여부 */
const isMockMode = (): boolean => process.env.KIS_MOCK_MODE === 'true'

/** 베이스 URL */
const getBaseUrl = (): string =>
  isMockMode()
    ? 'https://openapivts.koreainvestment.com:29443'
    : 'https://openapi.koreainvestment.com:9443'

/** 환경변수 가져오기 */
const getAppKey = (): string => {
  const key = process.env.KIS_APP_KEY
  if (!key) throw new Error('KIS_APP_KEY 환경변수가 설정되지 않았습니다.')
  return key
}

const getAppSecret = (): string => {
  const secret = process.env.KIS_APP_SECRET
  if (!secret) throw new Error('KIS_APP_SECRET 환경변수가 설정되지 않았습니다.')
  return secret
}

/** 계좌번호 파싱 (12345678-01 → CANO: 12345678, ACNT_PRDT_CD: 01) */
const getAccount = (): { cano: string; acntPrdtCd: string } => {
  const acctNo = process.env.KIS_ACCOUNT_NO
  if (!acctNo) throw new Error('KIS_ACCOUNT_NO 환경변수가 설정되지 않았습니다.')
  const [cano, acntPrdtCd] = acctNo.split('-')
  if (!cano || !acntPrdtCd) throw new Error('KIS_ACCOUNT_NO 형식이 올바르지 않습니다. (예: 12345678-01)')
  return { cano, acntPrdtCd }
}

// 토큰 캐시 (메모리)
let tokenCache: { token: string; expiresAt: number } | null = null

/** OAuth 토큰 발급/갱신 */
export const getKisToken = async (): Promise<string> => {
  // 캐시된 토큰이 유효하면 재사용
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token
  }

  const res = await fetch(`${getBaseUrl()}/oauth2/tokenP`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey: getAppKey(),
      appsecret: getAppSecret(),
    }),
  })

  if (!res.ok) throw new Error(`KIS 토큰 발급 실패: ${res.status}`)

  const data: KisToken = await res.json()
  // 만료 1시간 전에 갱신하도록 설정
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 3600) * 1000,
  }

  return data.access_token
}

/** 공통 헤더 생성 */
const getHeaders = async (trId: string): Promise<Record<string, string>> => {
  const token = await getKisToken()
  return {
    'Content-Type': 'application/json; charset=utf-8',
    authorization: `Bearer ${token}`,
    appkey: getAppKey(),
    appsecret: getAppSecret(),
    tr_id: trId,
    custtype: 'P',
  }
}

/** hashkey 발급 (POST 요청 body에 필요) */
const getHashKey = async (body: Record<string, string>): Promise<string> => {
  const res = await fetch(`${getBaseUrl()}/uapi/hashkey`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      appkey: getAppKey(),
      appsecret: getAppSecret(),
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) throw new Error(`KIS hashkey 발급 실패: ${res.status}`)
  const data = await res.json()
  return data.HASH as string
}

/** KIS API 설정 상태 확인 */
export const isKisConfigured = (): boolean => {
  return !!(process.env.KIS_APP_KEY && process.env.KIS_APP_SECRET && process.env.KIS_ACCOUNT_NO)
}

/** 잔고 조회 */
export const getKisBalance = async (): Promise<KisBalance> => {
  const { cano, acntPrdtCd } = getAccount()
  const trId = isMockMode() ? 'VTTC8434R' : 'TTTC8434R'
  const headers = await getHeaders(trId)

  const params = new URLSearchParams({
    CANO: cano,
    ACNT_PRDT_CD: acntPrdtCd,
    AFHR_FLPR_YN: 'N',
    OFL_YN: '',
    INQR_DVSN: '02',
    UNPR_DVSN: '01',
    FUND_STTL_ICLD_YN: 'N',
    FNCG_AMT_AUTO_RDPT_YN: 'N',
    PRCS_DVSN: '01',
    CTX_AREA_FK100: '',
    CTX_AREA_NK100: '',
  })

  const res = await fetch(
    `${getBaseUrl()}/uapi/domestic-stock/v1/trading/inquire-balance?${params.toString()}`,
    { headers }
  )

  if (!res.ok) throw new Error(`KIS 잔고 조회 실패: ${res.status}`)
  const data = await res.json()

  if (data.rt_cd !== '0') throw new Error(`KIS 잔고 조회 오류: ${data.msg1}`)

  // output1: 보유종목 배열
  const holdings: KisHolding[] = (data.output1 ?? [])
    .filter((item: Record<string, string>) => parseInt(item.hldg_qty ?? '0', 10) > 0)
    .map((item: Record<string, string>) => ({
      code: item.pdno ?? '',
      name: item.prdt_name ?? '',
      quantity: parseInt(item.hldg_qty ?? '0', 10),
      avgPrice: Math.round(parseFloat(item.pchs_avg_pric ?? '0')),
      currentPrice: parseInt(item.prpr ?? '0', 10),
      profitLoss: parseInt(item.evlu_pfls_amt ?? '0', 10),
      profitLossPercent: parseFloat(item.evlu_pfls_rt ?? '0'),
      evalAmount: parseInt(item.evlu_amt ?? '0', 10),
    }))

  // output2: 계좌 요약 (첫 번째 항목)
  const summary = data.output2?.[0] ?? {}
  const cashBalance = parseInt(summary.dnca_tot_amt ?? '0', 10)
  const totalEval = parseInt(summary.tot_evlu_amt ?? '0', 10)
  const purchaseTotal = parseInt(summary.pchs_amt_smtl_amt ?? '0', 10)
  const evalTotal = parseInt(summary.evlu_amt_smtl_amt ?? '0', 10)
  const totalProfitLoss = parseInt(summary.evlu_pfls_smtl_amt ?? '0', 10)
  const totalProfitLossPercent = purchaseTotal > 0
    ? (totalProfitLoss / purchaseTotal) * 100
    : 0

  return {
    holdings,
    cashBalance,
    totalEvaluation: totalEval || (cashBalance + evalTotal),
    totalProfitLoss,
    totalProfitLossPercent: Math.round(totalProfitLossPercent * 100) / 100,
  }
}

/** 주문 실행 (매수/매도) */
export const placeKisOrder = async (request: KisOrderRequest): Promise<KisOrder> => {
  const { cano, acntPrdtCd } = getAccount()
  const isBuy = request.side === 'buy'
  const trId = isMockMode()
    ? (isBuy ? 'VTTC0802U' : 'VTTC0801U')
    : (isBuy ? 'TTTC0802U' : 'TTTC0801U')

  const body: Record<string, string> = {
    CANO: cano,
    ACNT_PRDT_CD: acntPrdtCd,
    PDNO: request.code,
    ORD_DVSN: request.orderType === 'market' ? '01' : '00',
    ORD_QTY: String(request.quantity),
    ORD_UNPR: request.orderType === 'market' ? '0' : String(request.price ?? 0),
  }

  const [headers, hashkey] = await Promise.all([
    getHeaders(trId),
    getHashKey(body),
  ])

  const res = await fetch(
    `${getBaseUrl()}/uapi/domestic-stock/v1/trading/order-cash`,
    {
      method: 'POST',
      headers: { ...headers, hashkey },
      body: JSON.stringify(body),
    }
  )

  if (!res.ok) throw new Error(`KIS 주문 실패: ${res.status}`)
  const data = await res.json()

  const success = data.rt_cd === '0'

  return {
    orderId: data.output?.ODNO ?? '',
    side: request.side,
    code: request.code,
    name: request.code,
    quantity: request.quantity,
    price: request.price ?? 0,
    status: success ? 'executed' : 'failed',
    executedAt: success ? new Date().toISOString() : undefined,
    message: data.msg1 ?? '',
  }
}

/** 일별 시세 조회 (기술지표 분석용) */
export const getKisDailyPrices = async (
  code: string,
  days: number = 100
): Promise<DailyPrice[]> => {
  const headers = await getHeaders('FHKST03010100')

  // 날짜 범위 계산
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - Math.ceil(days * 1.5))

  const format = (d: Date): string =>
    d.toISOString().split('T')[0]?.replace(/-/g, '') ?? ''

  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'J',
    FID_INPUT_ISCD: code,
    FID_INPUT_DATE_1: format(startDate),
    FID_INPUT_DATE_2: format(endDate),
    FID_PERIOD_DIV_CODE: 'D',
    FID_ORG_ADJ_PRC: '0',
  })

  const res = await fetch(
    `${getBaseUrl()}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${params.toString()}`,
    { headers }
  )

  if (!res.ok) throw new Error(`KIS 일별 시세 조회 실패: ${res.status}`)
  const data = await res.json()

  if (data.rt_cd !== '0') throw new Error(`KIS 일별 시세 오류: ${data.msg1}`)

  const prices: DailyPrice[] = (data.output2 ?? [])
    .map((item: Record<string, string>) => ({
      date: item.stck_bsop_date ?? '',
      open: parseInt(item.stck_oprc ?? '0', 10),
      high: parseInt(item.stck_hgpr ?? '0', 10),
      low: parseInt(item.stck_lwpr ?? '0', 10),
      close: parseInt(item.stck_clpr ?? '0', 10),
      volume: parseInt(item.acml_vol ?? '0', 10),
    }))
    .filter((p: DailyPrice) => p.close > 0)
    .slice(0, days)

  return prices
}
