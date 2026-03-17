// KIS 잔고 조회 API Route
import { NextResponse } from 'next/server'
import { getKisBalance, isKisConfigured } from '@/lib/kis-api'

export async function GET() {
  try {
    if (!isKisConfigured()) {
      return NextResponse.json(
        { data: null, error: 'KIS API가 설정되지 않았습니다. .env.local에 KIS_APP_KEY, KIS_APP_SECRET, KIS_ACCOUNT_NO를 설정하세요.' },
        { status: 400 }
      )
    }

    const balance = await getKisBalance()
    return NextResponse.json({ data: balance })
  } catch (error) {
    console.error('[API /kis/balance] 오류:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : '잔고 조회 실패' },
      { status: 500 }
    )
  }
}
