// KIS 거래량 랭킹 API Route
import { NextRequest, NextResponse } from 'next/server'
import { getKisVolumeRank, isKisConfigured } from '@/lib/kis-api'
import type { RankingItem, ApiResponse } from '@/types/stock'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category') ?? '거래량'

    if (!isKisConfigured()) {
      return NextResponse.json(
        { data: [], error: 'KIS API가 설정되지 않았습니다.' } satisfies ApiResponse<RankingItem[]>,
        { status: 503 }
      )
    }

    const raw = await getKisVolumeRank()

    // 카테고리별 필터/정렬
    let items: RankingItem[] = raw.map((r, i) => ({
      rank: i + 1,
      code: r.code,
      name: r.name,
      logoUrl: '',
      price: r.price,
      priceKrw: null,
      basePrice: Math.round(r.price / (1 + r.change / 100)),
      changePercent: r.change,
      changeType: r.change > 0 ? 'UP' as const : r.change < 0 ? 'DOWN' as const : 'FLAT' as const,
      volume: r.volume,
      amount: r.tradingValue * 1_000_000, // 백만원 → 원
      buyCount: 0,
      sellCount: 0,
    }))

    if (category === '급상승') {
      items = items
        .filter(i => i.changePercent > 0)
        .sort((a, b) => b.changePercent - a.changePercent)
    } else if (category === '급하락') {
      items = items
        .filter(i => i.changePercent < 0)
        .sort((a, b) => a.changePercent - b.changePercent)
    }
    // '거래량' or '거래대금' — 기본 순서 (KIS가 거래량 순으로 반환)

    // 순위 재부여
    items = items.map((item, i) => ({ ...item, rank: i + 1 }))

    return NextResponse.json({
      data: items.slice(0, 50),
      basedAt: new Date().toISOString(),
    } satisfies ApiResponse<RankingItem[]>)
  } catch (error) {
    console.error('[API /ranking] 오류:', error)
    return NextResponse.json(
      { data: [], error: '랭킹 데이터를 가져오는 중 오류가 발생했습니다.' } satisfies ApiResponse<RankingItem[]>,
      { status: 500 }
    )
  }
}
