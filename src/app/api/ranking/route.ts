// 토스증권 랭킹 API Route
import { NextRequest, NextResponse } from 'next/server'
import { getTossRanking, RANKING_CATEGORIES } from '@/lib/toss-invest'
import type { RankingItem, ApiResponse } from '@/types/stock'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category') ?? '토스증권 거래대금'
    const duration = searchParams.get('duration') ?? 'realtime'
    const market = searchParams.get('market') ?? 'all'

    const categoryId = RANKING_CATEGORIES[category as keyof typeof RANKING_CATEGORIES]
    if (!categoryId) {
      return NextResponse.json(
        { data: [], error: `잘못된 카테고리: ${category}` } satisfies ApiResponse<RankingItem[]>,
        { status: 400 }
      )
    }

    const result = await getTossRanking(categoryId, duration, market)

    const items: RankingItem[] = result.products.slice(0, 50).map((p) => {
      const change = p.price.close - p.price.base
      const changePercent = p.price.base > 0 ? (change / p.price.base) * 100 : 0
      const changeType: 'UP' | 'DOWN' | 'FLAT' =
        change > 0 ? 'UP' : change < 0 ? 'DOWN' : 'FLAT'

      return {
        rank: p.rank,
        code: p.productCode,
        name: p.name,
        logoUrl: p.logoImageUrl,
        price: p.price.close,
        priceKrw: p.price.closeKrw,
        basePrice: p.price.base,
        changePercent,
        changeType,
        volume: p.price.tossSecuritiesVolume,
        amount: p.price.tossSecuritiesAmount,
        buyCount: p.extraInfo.tossSecuritiesBuy,
        sellCount: p.extraInfo.tossSecuritiesSell,
      }
    })

    return NextResponse.json({
      data: items,
      basedAt: result.basedAt,
    } satisfies ApiResponse<RankingItem[]>)
  } catch (error) {
    console.error('[API /ranking] 오류:', error)
    return NextResponse.json(
      { data: [], error: '랭킹 데이터를 가져오는 중 오류가 발생했습니다.' } satisfies ApiResponse<RankingItem[]>,
      { status: 500 }
    )
  }
}
