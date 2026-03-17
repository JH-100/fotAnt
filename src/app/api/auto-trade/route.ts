// 자동매매 실행 API
import { NextResponse } from 'next/server'
import { isKisConfigured } from '@/lib/kis-api'
import { executeAutoTrade, isMarketOpen, getTradeLogs, STRATEGIES } from '@/lib/auto-trader'
import type { SafetyConfig } from '@/lib/strategies/types'

/** POST: 자동매매 1회 실행 */
export async function POST(request: Request) {
  if (!isKisConfigured()) {
    return NextResponse.json(
      { error: 'KIS API가 설정되지 않았습니다.' },
      { status: 503 }
    )
  }

  try {
    const body = await request.json()
    const { strategy, targetStocks, safety, force } = body as {
      strategy: string
      targetStocks: { code: string; name: string }[]
      safety?: SafetyConfig
      force?: boolean
    }

    if (!strategy || !targetStocks?.length) {
      return NextResponse.json(
        { error: '전략과 대상 종목을 지정해주세요.' },
        { status: 400 }
      )
    }

    if (!STRATEGIES[strategy]) {
      return NextResponse.json(
        { error: `알 수 없는 전략: ${strategy}` },
        { status: 400 }
      )
    }

    // 장 시간 체크 (force=true면 무시)
    if (!force && !isMarketOpen()) {
      return NextResponse.json(
        { error: '장 운영시간이 아닙니다. (09:00~15:30 KST, 평일)' },
        { status: 400 }
      )
    }

    const logs = await executeAutoTrade(targetStocks, strategy, safety)
    return NextResponse.json({ logs, timestamp: new Date().toISOString() })
  } catch (error) {
    const message = error instanceof Error ? error.message : '자동매매 실행 실패'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** GET: 매매 로그 조회 */
export async function GET() {
  const logs = getTradeLogs()
  return NextResponse.json({ logs, marketOpen: isMarketOpen() })
}
