// KIS 잔고 조회 API Route — 실전/모의 모드 지원
import { NextResponse } from 'next/server'
import { getKisBalance, isKisConfigured } from '@/lib/kis-api'
import type { TradingMode } from '@/lib/kis-api'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const mode = (searchParams.get('mode') as TradingMode) || undefined

    if (!isKisConfigured(mode)) {
      return NextResponse.json(
        { data: null, error: 'KIS API가 설정되지 않았습니다.' },
        { status: 400 }
      )
    }

    const balance = await getKisBalance(mode)
    return NextResponse.json({ data: balance })
  } catch (error) {
    console.error('[API /kis/balance] 오류:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : '잔고 조회 실패' },
      { status: 500 }
    )
  }
}
