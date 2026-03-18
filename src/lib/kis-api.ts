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
const getToken = async (mode: TradingMode): Promise<string> => {
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
    INQR_DVSN: '02',
    UNPR_DVSN: '01',
    FUND_STTL_ICLD_YN: 'N',
    FNCG_AMT_AUTO_RDPT_YN: 'N',
    PRCS_DVSN: '01',
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

/** 1분봉 → N분봉으로 집계 */
export const aggregateMinuteBars = (bars: MinutePrice[], intervalMin: number): MinutePrice[] => {
  if (bars.length === 0 || intervalMin <= 1) return bars

  // 시간순 정렬 (오래된것 먼저)
  const sorted = [...bars].sort((a, b) => a.time.localeCompare(b.time))
  const result: MinutePrice[] = []

  for (let i = 0; i < sorted.length; i += intervalMin) {
    const chunk = sorted.slice(i, i + intervalMin)
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
