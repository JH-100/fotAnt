// KIS 주문 내역 조회 API
import { NextResponse } from 'next/server'
import { isKisConfigured, getKisToken } from '@/lib/kis-api'
import type { KisOrder } from '@/types/kis'

export async function GET() {
  if (!isKisConfigured()) {
    return NextResponse.json(
      { error: 'KIS API가 설정되지 않았습니다.' },
      { status: 503 }
    )
  }

  try {
    const isMock = process.env.KIS_MOCK_MODE === 'true'
    const baseUrl = isMock
      ? 'https://openapivts.koreainvestment.com:29443'
      : 'https://openapi.koreainvestment.com:9443'

    const token = await getKisToken()
    const acctNo = process.env.KIS_ACCOUNT_NO ?? ''
    const [cano, acntPrdtCd] = acctNo.split('-')

    const trId = isMock ? 'VTTC8001R' : 'TTTC8001R'

    const params = new URLSearchParams({
      CANO: cano ?? '',
      ACNT_PRDT_CD: acntPrdtCd ?? '',
      INQR_STRT_DT: getDateStr(-7),
      INQR_END_DT: getDateStr(0),
      SLL_BUY_DVSN_CD: '00',
      INQR_DVSN: '00',
      PDNO: '',
      CCLD_DVSN: '00',
      ORD_GNO_BRNO: '',
      ODNO: '',
      INQR_DVSN_3: '00',
      INQR_DVSN_1: '',
      CTX_AREA_FK100: '',
      CTX_AREA_NK100: '',
    })

    const res = await fetch(
      `${baseUrl}/uapi/domestic-stock/v1/trading/inquire-daily-ccld?${params.toString()}`,
      {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          authorization: `Bearer ${token}`,
          appkey: process.env.KIS_APP_KEY ?? '',
          appsecret: process.env.KIS_APP_SECRET ?? '',
          tr_id: trId,
          custtype: 'P',
        },
      }
    )

    if (!res.ok) {
      return NextResponse.json({ error: `KIS API 오류: ${res.status}` }, { status: res.status })
    }

    const data = await res.json()
    if (data.rt_cd !== '0') {
      return NextResponse.json({ error: data.msg1 }, { status: 400 })
    }

    const orders: KisOrder[] = (data.output1 ?? []).map(
      (item: Record<string, string>) => ({
        orderId: item.odno ?? '',
        side: item.sll_buy_dvsn_cd === '02' ? 'buy' : 'sell',
        code: item.pdno ?? '',
        name: item.prdt_name ?? '',
        quantity: parseInt(item.ord_qty ?? '0', 10),
        price: parseInt(item.ord_unpr ?? '0', 10),
        status: item.ord_dvsn_name?.includes('체결') ? 'executed' : 'pending',
        executedAt: item.ord_dt ?? '',
        message: item.ord_dvsn_name ?? '',
      } as KisOrder)
    )

    return NextResponse.json({ orders })
  } catch (error) {
    const message = error instanceof Error ? error.message : '주문 내역 조회 실패'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function getDateStr(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().split('T')[0]?.replace(/-/g, '') ?? ''
}
