// 워치리스트 API — 스캘핑 스캐너 종목 추가/제거/조회
import { NextResponse } from 'next/server'
import { addToWatchList, removeFromWatchList, getWatchList } from '@/lib/stock-scanner'

/** GET: 현재 워치리스트 조회 */
export async function GET() {
  const list = getWatchList()
  return NextResponse.json({ total: list.length, stocks: list })
}

/** POST: 워치리스트 추가/제거 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { action, code, name } = body as {
      action: 'add' | 'remove'
      code: string
      name?: string
    }

    if (!code) {
      return NextResponse.json({ error: '종목코드 필수' }, { status: 400 })
    }

    if (action === 'add') {
      addToWatchList(code, name || code)
      return NextResponse.json({ message: `${name || code} 추가됨`, ...getWatchListInfo() })
    }

    if (action === 'remove') {
      removeFromWatchList(code)
      return NextResponse.json({ message: `${code} 제거됨`, ...getWatchListInfo() })
    }

    return NextResponse.json({ error: '잘못된 action' }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '오류' },
      { status: 500 }
    )
  }
}

const getWatchListInfo = () => {
  const list = getWatchList()
  return { total: list.length }
}
