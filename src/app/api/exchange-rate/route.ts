// 환율 데이터 API Route — Frankfurter API (무료, 키 불필요)
import { NextResponse } from 'next/server'
import { getExchangeRatesWithChange } from '@/lib/frankfurter'
import { EXCHANGE_PAIRS } from '@/constants/stocks'
import type { ExchangeRate, ApiResponse } from '@/types/stock'

export async function GET() {
  try {
    const pairs = EXCHANGE_PAIRS.map((p) => ({
      from: p.from as string,
      to: p.to as string,
    }))

    const rates: ExchangeRate[] = await getExchangeRatesWithChange(pairs)

    return NextResponse.json({ data: rates } satisfies ApiResponse<ExchangeRate[]>)
  } catch (error) {
    console.error('[API /exchange-rate] 오류:', error)
    return NextResponse.json(
      { data: [], error: '환율 데이터를 가져오는 중 오류가 발생했습니다.' } satisfies ApiResponse<ExchangeRate[]>,
      { status: 500 }
    )
  }
}
