// 국내 주식 시세 API Route (KIS 거래량 상위 종목 기반)
import { NextResponse } from 'next/server'
import { getKisVolumeRank, isKisConfigured } from '@/lib/kis-api'
import type { StockQuote, ApiResponse } from '@/types/stock'

export async function GET() {
  try {
    if (!isKisConfigured()) {
      return NextResponse.json(
        { data: [], error: 'KIS API가 설정되지 않았습니다.' } satisfies ApiResponse<StockQuote[]>,
        { status: 503 }
      )
    }

    const raw = await getKisVolumeRank()

    const quotes: StockQuote[] = raw.map((r) => {
      const basePrice = Math.round(r.price / (1 + r.change / 100))
      const change = r.price - basePrice

      return {
        code: `A${r.code}`,
        name: r.name,
        price: r.price,
        basePrice,
        change,
        changePercent: r.change,
        changeType: r.change > 0 ? 'UP' as const : r.change < 0 ? 'DOWN' as const : 'FLAT' as const,
        volume: r.volume,
        lastUpdated: new Date().toISOString(),
      }
    })

    return NextResponse.json({ data: quotes } satisfies ApiResponse<StockQuote[]>)
  } catch (error) {
    console.error('[API /stocks] 오류:', error)
    return NextResponse.json(
      { data: [], error: '주식 데이터를 가져오는 중 오류가 발생했습니다.' } satisfies ApiResponse<StockQuote[]>,
      { status: 500 }
    )
  }
}
