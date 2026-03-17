// 국내 주식 시세 API Route (토스증권 기반)
import { NextResponse } from 'next/server'
import { getTossStockPrices } from '@/lib/toss-invest'
import { KR_STOCKS } from '@/constants/stocks'
import type { StockQuote, ApiResponse } from '@/types/stock'

export async function GET() {
  try {
    const codes = KR_STOCKS.map((s) => s.code)
    const result = await getTossStockPrices(codes)

    const quotes: StockQuote[] = result.prices.map((p) => {
      const stock = KR_STOCKS.find((s) => `A${s.code}` === p.code)
      const change = p.close - p.base
      const changePercent = p.base > 0 ? (change / p.base) * 100 : 0

      return {
        code: p.code,
        name: stock?.name ?? p.code,
        price: p.close,
        basePrice: p.base,
        change,
        changePercent,
        changeType: p.changeType,
        volume: p.volume,
        lastUpdated: p.tradingEnd,
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
