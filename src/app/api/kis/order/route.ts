// KIS 주문 API Route
import { NextResponse } from 'next/server'
import { placeKisOrder, isKisConfigured } from '@/lib/kis-api'
import type { KisOrderRequest } from '@/types/kis'

export async function POST(request: Request) {
  try {
    if (!isKisConfigured()) {
      return NextResponse.json(
        { data: null, error: 'KIS API가 설정되지 않았습니다.' },
        { status: 400 }
      )
    }

    const body: KisOrderRequest = await request.json()

    // 입력 검증
    if (!body.side || !body.code || !body.quantity || body.quantity <= 0) {
      return NextResponse.json(
        { data: null, error: '주문 정보가 올바르지 않습니다. (side, code, quantity 필수)' },
        { status: 400 }
      )
    }

    if (!['buy', 'sell'].includes(body.side)) {
      return NextResponse.json(
        { data: null, error: 'side는 buy 또는 sell이어야 합니다.' },
        { status: 400 }
      )
    }

    const order = await placeKisOrder(body)
    return NextResponse.json({ data: order })
  } catch (error) {
    console.error('[API /kis/order] 오류:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : '주문 실패' },
      { status: 500 }
    )
  }
}
