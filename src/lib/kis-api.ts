// 한국투자증권(KIS) OpenAPI 클라이언트 — 실전/모의 듀얼 모드 지원
import type { KisToken, KisBalance, KisHolding, KisOrder, KisOrderRequest, DailyPrice, MinutePrice } from '@/types/kis'

export type TradingMode = 'real' | 'mock'

/** 모드별 설정 */
const getModeConfig = (mode: TradingMode) => {
  if (mode === 'mock') {
    return {
      baseUrl: 'https://openapivts.koreainvestment.com:29443',
      appKey: process.env.KIS_MOCK_APP_KEY || process.env.KIS_APP_KEY || '',
      appSecret: process.env.KIS_MOCK_APP_SECRET || process.env.KIS_APP_SECRET || '',
      accountNo: process.env.KIS_MOCK_ACCOUNT_NO || process.env.KIS_ACCOUNT_NO || '',
    }
  }
  return {
    baseUrl: 'https://openapi.koreainvestment.com:9443',
    appKey: process.env.KIS_REAL_APP_KEY || process.env.KIS_APP_KEY || '',
    appSecret: process.env.KIS_REAL_APP_SECRET || process.env.KIS_APP_SECRET || '',
    accountNo: process.env.KIS_REAL_ACCOUNT_NO || process.env.KIS_ACCOUNT_NO || '',
  }
}

/** 계좌번호 파싱 */
const parseAccount = (acctNo: string): { cano: string; acntPrdtCd: string } => {
  const [cano, acntPrdtCd] = acctNo.split('-')
  if (!cano || !acntPrdtCd) throw new Error('계좌번호 형식 오류 (예: 12345678-01)')
  return { cano, acntPrdtCd }
}

/** KIS API 설정 상태 확인 */
export const isKisConfigured = (mode?: TradingMode): boolean => {
  if (mode) {
    const cfg = getModeConfig(mode)
    return !!(cfg.appKey && cfg.appSecret && cfg.accountNo)
  }
  // 어느 쪽이든 설정되어 있으면 true
  return !!(process.env.KIS_APP_KEY || process.env.KIS_REAL_APP_KEY || process.env.KIS_MOCK_APP_KEY)
}

// ─── 토큰 캐시 (모드별 분리) + 파일 저장 + 동시 요청 중복 방지 ────
const tokenCaches: Record<string, { token: string; expiresAt: number }> = {}
const tokenPending: Record<string, Promise<string> | undefined> = {}

// 서버사이드에서만 토큰을 파일에 저장/복원 (24시간 유효 → 재시작해도 재사용)
const TOKEN_FILE_PATH = '.kis-tokens.json'

const loadTokensFromFile = () => {
  if (typeof window !== 'undefined') return // 브라우저에서는 스킵
  try {
    const fs = require('fs') as typeof import('fs')
    const path = require('path') as typeof import('path')
    const filePath = path.join(process.cwd(), TOKEN_FILE_PATH)
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      for (const [mode, cache] of Object.entries(data)) {
        const c = cache as { token: string; expiresAt: number }
        if (c.token && c.expiresAt && Date.now() < c.expiresAt) {
          tokenCaches[mode] = c
          console.log(`[KIS] ${mode} 토큰 파일에서 복원 (만료: ${new Date(c.expiresAt).toLocaleTimeString('ko-KR')})`)
        }
      }
    }
  } catch { /* ignore */ }
}

const saveTokensToFile = () => {
  if (typeof window !== 'undefined') return
  try {
    const fs = require('fs') as typeof import('fs')
    const path = require('path') as typeof import('path')
    fs.writeFileSync(path.join(process.cwd(), TOKEN_FILE_PATH), JSON.stringify(tokenCaches), 'utf-8')
  } catch { /* ignore */ }
}

// 서버 시작 시 토큰 복원
loadTokensFromFile()

/** OAuth 토큰 발급/갱신 — 동시 호출 시 1개만 실제 발급, 나머지는 대기 */
const getToken = async (mode: TradingMode, forceRefresh = false): Promise<string> => {
  // 강제 갱신 요청 시 캐시 삭제
  if (forceRefresh) {
    delete tokenCaches[mode]
    delete tokenPending[mode]
  }

  // 1) 캐시에 유효한 토큰이 있으면 즉시 반환
  const cached = tokenCaches[mode]
  if (cached && Date.now() < cached.expiresAt) return cached.token

  // 2) 이미 발급 중인 요청이 있으면 같은 Promise 재사용 (중복 방지)
  const pending = tokenPending[mode]
  if (pending) {
    return pending
  }

  // 3) 실제 발급 1회만 실행
  tokenPending[mode] = (async () => {
    // 이중 체크 — 대기 중 다른 요청이 캐시를 채웠을 수 있음
    const recheck = tokenCaches[mode]
    if (recheck && Date.now() < recheck.expiresAt) return recheck.token

    const cfg = getModeConfig(mode)

    if (!cfg.appKey || !cfg.appSecret) {
      throw new Error(`KIS 토큰 발급 실패 (${mode}): appKey 또는 appSecret이 비어있습니다. .env.local 확인 필요`)
    }

    console.log(`[KIS] 토큰 발급 요청 (${mode}) → ${cfg.baseUrl}/oauth2/tokenP`)

    let res: Response
    try {
      res = await fetch(`${cfg.baseUrl}/oauth2/tokenP`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          appkey: cfg.appKey,
          appsecret: cfg.appSecret,
        }),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`KIS 토큰 네트워크 오류 (${mode}): ${msg} — ${cfg.baseUrl} 연결 실패`)
    }

    const text = await res.text()
    let data: Record<string, unknown>
    try {
      data = JSON.parse(text)
    } catch {
      throw new Error(`KIS 토큰 응답 파싱 실패 (${mode}): HTTP ${res.status} — ${text.slice(0, 200)}`)
    }

    if (!res.ok) {
      throw new Error(`KIS 토큰 발급 실패 (${mode}): HTTP ${res.status} — ${data.error_description || data.msg1 || text.slice(0, 200)}`)
    }

    if (!data.access_token) {
      throw new Error(`KIS 토큰 응답에 access_token 없음 (${mode}): ${JSON.stringify(data).slice(0, 300)}`)
    }

    console.log(`[KIS] 토큰 발급 성공 (${mode}), 만료: ${data.expires_in}초`)

    tokenCaches[mode] = {
      token: data.access_token as string,
      expiresAt: Date.now() + ((data.expires_in as number) - 3600) * 1000,
    }
    saveTokensToFile()
    return data.access_token as string
  })()

  try {
    return await tokenPending[mode]
  } finally {
    delete tokenPending[mode]
  }
}

/** 토큰 강제 삭제 — 만료/오류 시 호출 */
const invalidateToken = (mode: TradingMode) => {
  delete tokenCaches[mode]
  delete tokenPending[mode]
  // 파일에서도 제거
  if (typeof window !== 'undefined') return
  try {
    const fs = require('fs') as typeof import('fs')
    const path = require('path') as typeof import('path')
    const filePath = path.join(process.cwd(), TOKEN_FILE_PATH)
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      delete data[mode]
      fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8')
    }
  } catch { /* ignore */ }
  console.log(`[KIS] ${mode} 토큰 무효화 — 다음 요청 시 재발급`)
}

/** 공통 헤더 생성 */
const getHeaders = async (mode: TradingMode, trId: string): Promise<Record<string, string>> => {
  const cfg = getModeConfig(mode)
  const token = await getToken(mode)
  return {
    'Content-Type': 'application/json; charset=utf-8',
    authorization: `Bearer ${token}`,
    appkey: cfg.appKey,
    appsecret: cfg.appSecret,
    tr_id: trId,
    custtype: 'P',
  }
}

/** API 호출 래퍼 — 토큰 만료 시 자동 재발급 후 1회 재시도 */
const kisApiFetch = async (
  mode: TradingMode,
  trId: string,
  url: string,
  options?: { method?: string; body?: string }
): Promise<Response> => {
  const headers = await getHeaders(mode, trId)
  let res = await fetch(url, { ...options, headers })

  // 토큰 만료 에러 감지 (EGW00123 = 만료, EGW00121 = 유효하지 않음)
  if (res.status === 401 || res.status === 403) {
    console.log(`[KIS] 토큰 만료 감지 (HTTP ${res.status}) — 재발급 시도`)
    invalidateToken(mode)
    const newHeaders = await getHeaders(mode, trId)
    res = await fetch(url, { ...options, headers: newHeaders })
  } else {
    // body를 미리 읽지 않고 텍스트로 확인할 수도 있으므로
    // rt_cd 체크는 호출자에서 처리
    const cloned = res.clone()
    try {
      const data = await cloned.json()
      if (data.msg_cd === 'EGW00123' || data.msg_cd === 'EGW00121') {
        console.log(`[KIS] 토큰 만료 감지 (${data.msg_cd}: ${data.msg1}) — 재발급 시도`)
        invalidateToken(mode)
        const newHeaders = await getHeaders(mode, trId)
        res = await fetch(url, { ...options, headers: newHeaders })
      }
    } catch { /* JSON 파싱 실패 시 무시 */ }
  }

  return res
}

/** hashkey 발급 */
const getHashKey = async (mode: TradingMode, body: Record<string, string>): Promise<string> => {
  const cfg = getModeConfig(mode)
  const res = await fetch(`${cfg.baseUrl}/uapi/hashkey`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      appkey: cfg.appKey,
      appsecret: cfg.appSecret,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) throw new Error(`KIS hashkey 발급 실패: ${res.status}`)
  const data = await res.json()
  return data.HASH as string
}

// ─── 레거시 호환 (mode 파라미터 없는 함수) ──────────
const defaultMode = (): TradingMode =>
  process.env.KIS_MOCK_MODE === 'true' ? 'mock' : 'real'

/** 레거시: OAuth 토큰 (기존 호환) */
export const getKisToken = async (): Promise<string> => getToken(defaultMode())

/** 토큰 강제 리셋 — 만료 에러 발생 시 호출 */
export const resetKisToken = (mode?: TradingMode) => {
  const m = mode ?? defaultMode()
  invalidateToken(m)
}

/** 모든 모드 토큰 리셋 + 파일 삭제 */
export const resetAllKisTokens = () => {
  invalidateToken('real')
  invalidateToken('mock')
  // 파일 자체를 삭제
  if (typeof window !== 'undefined') return
  try {
    const fs = require('fs') as typeof import('fs')
    const path = require('path') as typeof import('path')
    const filePath = path.join(process.cwd(), TOKEN_FILE_PATH)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    console.log('[KIS] 모든 토큰 리셋 완료 — .kis-tokens.json 삭제')
  } catch { /* ignore */ }
}

// ─── 잔고 조회 ──────────────────────────────────────

export const getKisBalance = async (mode?: TradingMode): Promise<KisBalance> => {
  const m = mode ?? defaultMode()
  const cfg = getModeConfig(m)
  const { cano, acntPrdtCd } = parseAccount(cfg.accountNo)
  const trId = m === 'mock' ? 'VTTC8434R' : 'TTTC8434R'
  const headers = await getHeaders(m, trId)

  const params = new URLSearchParams({
    CANO: cano,
    ACNT_PRDT_CD: acntPrdtCd,
    AFHR_FLPR_YN: 'N',
    OFL_YN: '',
    INQR_DVSN: '01',
    UNPR_DVSN: '01',
    FUND_STTL_ICLD_YN: 'N',
    FNCG_AMT_AUTO_RDPT_YN: 'N',
    PRCS_DVSN: '00',
    CTX_AREA_FK100: '',
    CTX_AREA_NK100: '',
  })

  const res = await fetch(
    `${cfg.baseUrl}/uapi/domestic-stock/v1/trading/inquire-balance?${params.toString()}`,
    { headers }
  )

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`KIS 잔고 조회 실패: HTTP ${res.status} — ${errText.slice(0, 200)}`)
  }
  const data = await res.json()
  if (data.rt_cd !== '0') throw new Error(`KIS 잔고 조회 오류: ${data.msg1}`)

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

  const summary = data.output2?.[0] ?? {}
  const cashBalance = parseInt(summary.dnca_tot_amt ?? '0', 10)
  // 주문가능금액: 여러 필드 중 가장 큰 값 사용 (KIS API 버전별로 필드명이 다름)
  const nrcvb = parseInt(summary.nrcvb_buy_amt ?? '0', 10)
  const ordPsbl = parseInt(summary.ord_psbl_cash ?? '0', 10)
  const prvRuse = parseInt(summary.prvs_ruse_psbl_amt ?? '0', 10)
  const orderableCash = Math.max(nrcvb, ordPsbl, prvRuse, cashBalance)
  console.log(`[KIS잔고] 예수금=${cashBalance.toLocaleString()} 주문가능=${orderableCash.toLocaleString()} (nrcvb=${nrcvb} ordPsbl=${ordPsbl} prvRuse=${prvRuse})`)
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
    orderableCash, // 실제 주문가능금액 (한투 앱과 동일)
    totalEvaluation: totalEval || (cashBalance + evalTotal),
    totalProfitLoss,
    totalProfitLossPercent: Math.round(totalProfitLossPercent * 100) / 100,
  }
}

// ─── 매수가능금액 조회 (주문가능원화) ──────────────────
export const getKisOrderableCash = async (mode?: TradingMode): Promise<number> => {
  const m = mode ?? defaultMode()
  const cfg = getModeConfig(m)
  const trId = m === 'real' ? 'TTTC8908R' : 'VTTC8908R'
  const headers = await getHeaders(m, trId)
  const [cano, acntPrdtCd] = cfg.accountNo.split('-')

  const params = new URLSearchParams({
    CANO: cano ?? '',
    ACNT_PRDT_CD: acntPrdtCd ?? '',
    PDNO: '005930',           // 아무 종목 (삼성전자)
    ORD_UNPR: '50000',        // 기준가
    ORD_DVSN: '01',           // 시장가
    CMA_EVLU_AMT_ICLD_YN: 'Y', // CMA 평가금 포함
    OVRS_ICLD_YN: 'N',
  })

  const res = await fetch(
    `${cfg.baseUrl}/uapi/domestic-stock/v1/trading/inquire-psbl-order?${params.toString()}`,
    { headers }
  )

  if (!res.ok) {
    console.log(`[KIS] 매수가능조회 실패: HTTP ${res.status}`)
    return 0
  }
  const data = await res.json()
  if (data.rt_cd !== '0') {
    console.log(`[KIS] 매수가능조회 오류: ${data.msg1}`)
    return 0
  }

  const output = data.output ?? {}
  // 모든 금액 필드 출력해서 어디에 주문가능금액이 있는지 확인
  const fields = Object.entries(output)
    .filter(([, v]) => typeof v === 'string' && /^\d+$/.test(v as string) && parseInt(v as string, 10) > 0)
    .map(([k, v]) => `${k}=${parseInt(v as string, 10).toLocaleString()}`)
    .join(', ')
  console.log(`[KIS매수가능] ${fields || 'empty'}`)
  const orderableAmt = Math.max(
    parseInt(output.ord_psbl_cash ?? '0', 10),
    parseInt(output.nrcvb_buy_amt ?? '0', 10),
    parseInt(output.max_buy_amt ?? '0', 10),
    parseInt(output.ord_psbl_frcr_amt ?? '0', 10),
  )
  console.log(`[KIS잔고] 매수가능조회: ${orderableAmt.toLocaleString()}원`)
  return orderableAmt
}

// ─── 주문 실행 ──────────────────────────────────────

export const placeKisOrder = async (request: KisOrderRequest, mode?: TradingMode): Promise<KisOrder> => {
  const m = mode ?? defaultMode()
  const cfg = getModeConfig(m)
  const { cano, acntPrdtCd } = parseAccount(cfg.accountNo)
  const isBuy = request.side === 'buy'

  // 신규 tr_id 사용 (구TR은 사전고지 없이 막힐 수 있음)
  const trId = m === 'mock'
    ? (isBuy ? 'VTTC0012U' : 'VTTC0011U')
    : (isBuy ? 'TTTC0012U' : 'TTTC0011U')

  // 거래소 결정 (모의투자는 KRX만 가능)
  const exchange = (m === 'mock') ? 'KRX' : (request.exchange ?? 'KRX')

  // ORD_DVSN 매핑
  const ordDvsnMap: Record<string, string> = {
    market: '01',
    limit: '00',
    'pre-market': '05',    // KRX 장전시간외
    'after-close': '06',   // KRX 장후시간외종가
    'after-hours': '07',   // KRX 시간외단일가
  }

  // NXT일 때 ORD_DVSN 결정 (NXT는 일반 시장가 불가)
  let ordDvsn = ordDvsnMap[request.orderType] ?? '01'
  if (exchange === 'NXT') {
    if (['01', '02', '05', '06', '07'].includes(ordDvsn)) {
      // 가격 지정 있으면 지정가(00), 없으면 최유리지정가(03) — 호가창 최적가 자동 체결
      ordDvsn = request.price ? '00' : '03'
    }
  }

  // 주문단가: 최유리(03)/최우선(04)/시장가(01)는 가격 불필요
  const noPriceTypes = ['01', '03', '04', '13', '14', '15', '16']
  const needsPrice = !noPriceTypes.includes(ordDvsn) && (request.orderType === 'limit' || request.orderType === 'after-hours' || ordDvsn === '00')
  const ordUnpr = needsPrice ? String(request.price ?? 0) : '0'

  const body: Record<string, string> = {
    CANO: cano,
    ACNT_PRDT_CD: acntPrdtCd,
    PDNO: request.code,
    ORD_DVSN: ordDvsn,
    ORD_QTY: String(request.quantity),
    ORD_UNPR: ordUnpr,
    EXCG_ID_DVSN_CD: exchange,  // KRX | NXT | SOR
  }

  if (exchange === 'NXT') {
    console.log(`[KIS주문] NXT 요청 — ${isBuy ? '매수' : '매도'} ${request.code} ORD_DVSN=${ordDvsn} QTY=${request.quantity} UNPR=${ordUnpr} TR=${trId}`)
  }

  const [headers, hashkey] = await Promise.all([
    getHeaders(m, trId),
    getHashKey(m, body),
  ])

  const res = await fetch(
    `${cfg.baseUrl}/uapi/domestic-stock/v1/trading/order-cash`,
    {
      method: 'POST',
      headers: { ...headers, hashkey },
      body: JSON.stringify(body),
    }
  )

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const errMsg = data?.msg1 || data?.message || `HTTP ${res.status}`
    console.log(`[KIS주문] ${res.status} 에러 — ${exchange} ${ordDvsn} ${request.code}:`, JSON.stringify(data))
    throw new Error(`KIS 주문 실패: ${errMsg}`)
  }
  if (!data) throw new Error('KIS 주문 응답 파싱 실패')

  if (data.rt_cd !== '0') {
    throw new Error(data.msg1 || '주문이 거절되었습니다.')
  }

  return {
    orderId: data.output?.ODNO ?? '',
    side: request.side,
    code: request.code,
    name: request.code,
    quantity: request.quantity,
    price: request.price ?? 0,
    status: 'executed' as const,
    executedAt: new Date().toISOString(),
    message: data.msg1 ?? '주문이 접수되었습니다.',
  }
}

// ─── 현재가 조회 (NXT 재시도용) ─────────────────────

export const getKisCurrentPrice = async (code: string, mode?: TradingMode): Promise<number> => {
  const m = mode ?? defaultMode()
  const headers = await getHeaders(m, 'FHKST01010100')
  const cfg = getModeConfig(m)

  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'J',
    FID_INPUT_ISCD: code,
  })

  const res = await fetch(
    `${cfg.baseUrl}/uapi/domestic-stock/v1/quotations/inquire-price?${params.toString()}`,
    { headers }
  )

  if (!res.ok) throw new Error(`KIS 현재가 조회 실패: ${res.status}`)
  const data = await res.json()
  if (data.rt_cd !== '0') throw new Error(`KIS 현재가 오류: ${data.msg1}`)

  const price = parseInt(data.output?.stck_prpr ?? '0', 10)
  if (price <= 0) throw new Error(`KIS 현재가 0원: ${code}`)
  return price
}

// ─── 일별 시세 조회 (기술지표 분석용) ────────────────

export const getKisDailyPrices = async (
  code: string,
  days: number = 100,
  mode?: TradingMode
): Promise<DailyPrice[]> => {
  // 시세 조회 (모의/실전 공통)
  const m = mode ?? defaultMode()
  const headers = await getHeaders(m, 'FHKST03010100')
  const cfg = getModeConfig(m)

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
    `${cfg.baseUrl}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${params.toString()}`,
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
    .reverse()  // KIS는 최신→과거순 반환 → 과거→최신순으로 뒤집기 (지표 함수 요구사항)

  return prices
}

// ─── 거래량 상위 종목 조회 (스캐너용) ──────────────

export interface VolumeRankItem {
  code: string
  name: string
  price: number
  change: number        // 등락률 %
  volume: number        // 누적 거래량
  tradingValue: number  // 거래대금 (백만원)
}

/** KIS 거래량 순위 — 코스피+코스닥 상위 30종목 */
export const getKisVolumeRank = async (mode?: TradingMode): Promise<VolumeRankItem[]> => {
  const m = mode ?? defaultMode()
  const headers = await getHeaders(m, 'FHPST01710000')
  const cfg = getModeConfig(m)

  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'J',    // 전체 (J=코스피+코스닥)
    FID_COND_SCR_DIV_CODE: '20171',
    FID_INPUT_ISCD: '0000',
    FID_DIV_CLS_CODE: '0',
    FID_BLNG_CLS_CODE: '0',          // 0: 전체
    FID_TRGT_CLS_CODE: '111111111',
    FID_TRGT_EXLS_CLS_CODE: '000000',
    FID_INPUT_PRICE_1: '0',
    FID_INPUT_PRICE_2: '0',
    FID_VOL_CNT: '0',
    FID_INPUT_DATE_1: '',
  })

  const res = await fetch(
    `${cfg.baseUrl}/uapi/domestic-stock/v1/quotations/volume-rank?${params.toString()}`,
    { headers }
  )

  if (!res.ok) throw new Error(`KIS 거래량순위 조회 실패: ${res.status}`)
  const data = await res.json()
  if (data.rt_cd !== '0') throw new Error(`KIS 거래량순위 오류: ${data.msg1}`)

  return (data.output ?? []).map((item: Record<string, string>) => ({
    code: item.mksc_shrn_iscd ?? '',
    name: item.hts_kor_isnm ?? '',
    price: parseInt(item.stck_prpr ?? '0', 10),
    change: parseFloat(item.prdy_ctrt ?? '0'),
    volume: parseInt(item.acml_vol ?? '0', 10),
    tradingValue: Math.round(parseInt(item.acml_tr_pbmn ?? '0', 10) / 1_000_000),
  }))
}

// ─── 투자자별 매매동향 조회 (외국인/기관 수급) ────────

export interface InvestorTrading {
  foreignNetBuy: number   // 외국인 순매수량
  institutionNetBuy: number // 기관 순매수량
  individualNetBuy: number  // 개인 순매수량
  foreignAcc: number      // 외국인 누적 순매수
  institutionAcc: number  // 기관 누적 순매수
}

/** 종목별 투자자 매매동향 (당일) — FHKST01010900 */
export const getKisInvestorTrading = async (code: string, mode?: TradingMode): Promise<InvestorTrading> => {
  const m = mode ?? defaultMode()
  const headers = await getHeaders(m, 'FHKST01010900')
  const cfg = getModeConfig(m)

  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'J',
    FID_INPUT_ISCD: code,
  })

  try {
    const res = await fetch(
      `${cfg.baseUrl}/uapi/domestic-stock/v1/quotations/inquire-investor?${params.toString()}`,
      { headers }
    )
    if (!res.ok) return { foreignNetBuy: 0, institutionNetBuy: 0, individualNetBuy: 0, foreignAcc: 0, institutionAcc: 0 }
    const data = await res.json()
    if (data.rt_cd !== '0') return { foreignNetBuy: 0, institutionNetBuy: 0, individualNetBuy: 0, foreignAcc: 0, institutionAcc: 0 }

    // output: 시간대별 투자자 매매 데이터 (최신부터)
    const items = data.output ?? []
    let foreignBuy = 0, foreignSell = 0, instBuy = 0, instSell = 0, indivBuy = 0, indivSell = 0

    for (const item of items) {
      foreignBuy += parseInt(item.frgn_ntby_qty ?? '0', 10)  // 외국인
      instBuy += parseInt(item.orgn_ntby_qty ?? '0', 10)      // 기관
      indivBuy += parseInt(item.prsn_ntby_qty ?? '0', 10)     // 개인
    }

    // 최근 데이터(첫 행)를 순매수로 사용
    const latest = items[0] ?? {}
    const foreignNet = parseInt(latest.frgn_ntby_qty ?? '0', 10)
    const instNet = parseInt(latest.orgn_ntby_qty ?? '0', 10)
    const indivNet = parseInt(latest.prsn_ntby_qty ?? '0', 10)

    return {
      foreignNetBuy: foreignNet,
      institutionNetBuy: instNet,
      individualNetBuy: indivNet,
      foreignAcc: foreignBuy,
      institutionAcc: instBuy,
    }
  } catch {
    return { foreignNetBuy: 0, institutionNetBuy: 0, individualNetBuy: 0, foreignAcc: 0, institutionAcc: 0 }
  }
}

// ─── 당일 분봉 조회 (스캘핑 단기지표용) ──────────────

/** KIS 당일 분봉 조회 — 1분봉 데이터를 가져와서 지정 간격으로 집계 */
export const getKisMinutePrices = async (
  code: string,
  mode?: TradingMode
): Promise<MinutePrice[]> => {
  const m = mode ?? defaultMode()
  const headers = await getHeaders(m, 'FHKST03010200')
  const cfg = getModeConfig(m)

  // 현재 시각 기준 조회 (HHMMSS)
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const hh = String(kst.getUTCHours()).padStart(2, '0')
  const mm = String(kst.getUTCMinutes()).padStart(2, '0')
  const endTime = `${hh}${mm}00`

  const params = new URLSearchParams({
    FID_ETC_CLS_CODE: '',
    FID_COND_MRKT_DIV_CODE: 'J',
    FID_INPUT_ISCD: code,
    FID_INPUT_HOUR_1: endTime,
    FID_PW_DATA_INCU_YN: 'N',
  })

  const res = await fetch(
    `${cfg.baseUrl}/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice?${params.toString()}`,
    { headers }
  )

  if (!res.ok) throw new Error(`KIS 분봉 조회 실패: ${res.status}`)
  const data = await res.json()
  if (data.rt_cd !== '0') throw new Error(`KIS 분봉 오류: ${data.msg1}`)

  const minutes: MinutePrice[] = (data.output2 ?? [])
    .map((item: Record<string, string>) => ({
      time: item.stck_cntg_hour ?? '',
      open: parseInt(item.stck_oprc ?? '0', 10),
      high: parseInt(item.stck_hgpr ?? '0', 10),
      low: parseInt(item.stck_lwpr ?? '0', 10),
      close: parseInt(item.stck_prpr ?? '0', 10),
      volume: parseInt(item.cntg_vol ?? '0', 10),
      cumVolume: parseInt(item.acml_vol ?? '0', 10),
    }))
    .filter((p: MinutePrice) => p.close > 0)

  return minutes
}

/** 1분봉 → N분봉으로 집계 (시간 기반 그룹핑 — 갭 시간대 정확 처리) */
export const aggregateMinuteBars = (bars: MinutePrice[], intervalMin: number): MinutePrice[] => {
  if (bars.length === 0 || intervalMin <= 1) return bars

  // 시간순 정렬 (오래된것 먼저)
  const sorted = [...bars].sort((a, b) => a.time.localeCompare(b.time))
  const result: MinutePrice[] = []

  // 시간 기반 그룹핑: HHmm → 분 변환 후 intervalMin 단위 버킷
  const timeToMinutes = (t: string): number => {
    const hh = parseInt(t.slice(0, 2), 10)
    const mm = parseInt(t.slice(2, 4), 10)
    return hh * 60 + mm
  }
  const bucketKey = (t: string): number => {
    const mins = timeToMinutes(t)
    return Math.floor(mins / intervalMin)
  }

  const buckets = new Map<number, MinutePrice[]>()
  for (const bar of sorted) {
    const key = bucketKey(bar.time)
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(bar)
  }

  for (const [, chunk] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
    if (chunk.length === 0) continue
    const first = chunk[0]!
    const last = chunk[chunk.length - 1]!

    result.push({
      time: first.time,
      open: first.open,
      high: Math.max(...chunk.map(c => c.high)),
      low: Math.min(...chunk.map(c => c.low)),
      close: last.close,
      volume: chunk.reduce((sum, c) => sum + c.volume, 0),
      cumVolume: last.cumVolume,
    })
  }

  return result
}

// ─── 해외주식 현재가 조회 ──────────────────────────

export interface OverseasPrice {
  price: number       // USD
  change: number      // 전일대비 USD
  changePercent: number // 등락률 %
  volume: number
}

export const getKisOverseasPrice = async (
  symbol: string, exchange: string, mode?: TradingMode
): Promise<OverseasPrice> => {
  const m = mode ?? defaultMode()
  const trId = m === 'real' ? 'HHDFS00000300' : 'VHHDFS00000300'
  const headers = await getHeaders(m, trId)
  const cfg = getModeConfig(m)

  const params = new URLSearchParams({ AUTH: '', EXCD: exchange, SYMB: symbol })
  const res = await fetch(
    `${cfg.baseUrl}/uapi/overseas-price/v1/quotations/price?${params.toString()}`,
    { headers }
  )

  if (!res.ok) throw new Error(`KIS 해외 현재가 조회 실패: ${res.status}`)
  const data = await res.json()
  if (data.rt_cd !== '0') throw new Error(`KIS 해외 현재가 오류: ${data.msg1}`)

  const output = data.output ?? {}
  return {
    price: parseFloat(output.last ?? '0'),
    change: parseFloat(output.diff ?? '0'),
    changePercent: parseFloat(output.rate ?? '0'),
    volume: parseInt(output.tvol ?? '0', 10),
  }
}

// ─── 해외주식 일봉 조회 ──────────────────────────

export const getKisOverseasDailyPrices = async (
  symbol: string, exchange: string, days: number = 60, mode?: TradingMode
): Promise<DailyPrice[]> => {
  const m = mode ?? defaultMode()
  const trId = m === 'real' ? 'HHDFS76240000' : 'VHHDFS76240000'
  const headers = await getHeaders(m, trId)
  const cfg = getModeConfig(m)

  const params = new URLSearchParams({
    AUTH: '', EXCD: exchange, SYMB: symbol,
    GUBN: '0', BYMD: '', MODP: '0',
  })
  const res = await fetch(
    `${cfg.baseUrl}/uapi/overseas-price/v1/quotations/dailyprice?${params.toString()}`,
    { headers }
  )

  if (!res.ok) throw new Error(`KIS 해외 일봉 조회 실패: ${res.status}`)
  const data = await res.json()
  if (data.rt_cd !== '0') throw new Error(`KIS 해외 일봉 오류: ${data.msg1}`)

  const prices: DailyPrice[] = (data.output2 ?? [])
    .map((item: Record<string, string>) => ({
      date: item.xymd ?? '',
      open: parseFloat(item.open ?? '0'),
      high: parseFloat(item.high ?? '0'),
      low: parseFloat(item.low ?? '0'),
      close: parseFloat(item.clos ?? '0'),
      volume: parseInt(item.tvol ?? '0', 10),
    }))
    .filter((p: DailyPrice) => p.close > 0)
    .slice(0, days)
    .reverse()

  return prices
}
