// 거래 리포트 API — 일일/주간 손익 및 reason별 성과
import { NextResponse } from 'next/server'
import { generateDailyReport, getWeeklyReport, getReasonPerformance } from '@/lib/scalping-engine'

/** GET /api/trading-report?type=daily|weekly|reasons */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') ?? 'daily'

  try {
    if (type === 'weekly') {
      const report = getWeeklyReport()
      return NextResponse.json(report)
    }

    if (type === 'reasons') {
      const perf = getReasonPerformance()
      // 승률순 정렬
      const sorted = Object.entries(perf)
        .map(([reason, stat]) => ({
          reason,
          wins: stat.wins,
          losses: stat.losses,
          totalPnl: Math.round(stat.totalPnl),
          winRate: (stat.wins + stat.losses) > 0
            ? Math.round((stat.wins / (stat.wins + stat.losses)) * 100)
            : 0,
          trades: stat.wins + stat.losses,
        }))
        .sort((a, b) => b.trades - a.trades)

      return NextResponse.json({ reasons: sorted })
    }

    // 기본: 오늘 리포트
    const report = generateDailyReport()
    return NextResponse.json(report)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '리포트 생성 실패' },
      { status: 500 }
    )
  }
}
