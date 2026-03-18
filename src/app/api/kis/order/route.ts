// KIS 주문 API Route — 실전/모의 모드 + 비밀번호 보호
import { NextResponse } from 'next/server'
import { placeKisOrder, isKisConfigured } from '@/lib/kis-api'
import type { TradingMode } from '@/lib/kis-api'
import type { KisOrderRequest } from '@/types/kis'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { mode, password, ...orderBody } = body as KisOrderRequest & {
      mode?: TradingMode
      password?: string
    }

    const tradingMode: TradingMode = mode || 'mock'

    // 실전투자는 비밀번호 필수
    if (tradingMode === 'real') {
      const correctPassword = process.env.TRADING_PASSWORD
      if (!correctPassword) {
        return NextResponse.json(
          { data: null, error: 'TRADING_PASSWORD 환경변수가 설정되지 않았습니다.' },
          { status: 500 }
        )
      }
      if (!password || password !== correctPassword) {
        return NextResponse.json(
          { data: null, error: '비밀번호가 올바르지 않습니다.' },
          { status: 403 }
        )
      }
    }

    if (!isKisConfigured(tradingMode)) {
      return NextResponse.json(
        { data: null, error: `KIS API (${tradingMode === 'real' ? '실전' : '모의'})가 설정되지 않았습니다.` },
        { status: 400 }
      )
    }

    // 입력 검증
    if (!orderBody.side || !orderBody.code || !orderBody.quantity || orderBody.quantity <= 0) {
      return NextResponse.json(
        { data: null, error: '주문 정보가 올바르지 않습니다. (side, code, quantity 필수)' },
        { status: 400 }
      )
    }

    if (orderBody.orderType && !['market', 'limit', 'pre-market', 'after-close', 'after-hours'].includes(orderBody.orderType)) {
      return NextResponse.json(
        { data: null, error: 'orderType이 올바르지 않습니다.' },
        { status: 400 }
      )
    }

    if (!['buy', 'sell'].includes(orderBody.side)) {
      return NextResponse.json(
        { data: null, error: 'side는 buy 또는 sell이어야 합니다.' },
        { status: 400 }
      )
    }

    const order = await placeKisOrder(orderBody, tradingMode)
    return NextResponse.json({ data: order })
  } catch (error) {
    console.error('[API /kis/order] 오류:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : '주문 실패' },
      { status: 500 }
    )
  }
}
