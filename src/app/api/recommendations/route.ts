// 주식 추천 API
import { NextResponse } from 'next/server'
import { isKisConfigured, getKisDailyPrices } from '@/lib/kis-api'
import { analyzeStocks } from '@/lib/recommendation-engine'

// 토스 랭킹에서 인기 종목 가져오기
const getPopularStocks = async (): Promise<{ code: string; name: string }[]> => {
  try {
    const res = await fetch(
      'https://wts-info-api.tossinvest.com/api/v2/ranking?category=%ED%86%A0%EC%8A%A4%EC%A6%9D%EA%B6%8C%20%EA%B1%B0%EB%9E%98%EB%8C%80%EA%B8%88&market=kr',
      { next: { revalidate: 300 } }
    )
    if (!res.ok) return getDefaultStocks()
    const data = await res.json()
    const items = (data.result ?? []).slice(0, 10)
    return items.map((item: Record<string, string>) => ({
      code: item.symbolCode?.replace('KR:', '') ?? '',
      name: item.name ?? '',
    })).filter((s: { code: string }) => s.code)
  } catch {
    return getDefaultStocks()
  }
}

const getDefaultStocks = (): { code: string; name: string }[] => [
  { code: '005930', name: '삼성전자' },
  { code: '000660', name: 'SK하이닉스' },
  { code: '373220', name: 'LG에너지솔루션' },
  { code: '035420', name: 'NAVER' },
  { code: '035720', name: '카카오' },
  { code: '051910', name: 'LG화학' },
  { code: '006400', name: '삼성SDI' },
  { code: '068270', name: '셀트리온' },
]

export async function GET() {
  if (!isKisConfigured()) {
    return NextResponse.json(
      { error: 'KIS API가 설정되지 않았습니다.' },
      { status: 503 }
    )
  }

  try {
    const popularStocks = await getPopularStocks()

    // 각 종목의 일별 시세를 병렬로 가져오기
    const stocksWithData = await Promise.allSettled(
      popularStocks.map(async (stock) => {
        const data = await getKisDailyPrices(stock.code, 100)
        return { ...stock, data }
      })
    )

    const validStocks = stocksWithData
      .filter((r): r is PromiseFulfilledResult<{ code: string; name: string; data: import('@/types/kis').DailyPrice[] }> => r.status === 'fulfilled')
      .map((r) => r.value)

    const recommendations = analyzeStocks(validStocks)

    return NextResponse.json({ recommendations })
  } catch (error) {
    const message = error instanceof Error ? error.message : '추천 분석 실패'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
