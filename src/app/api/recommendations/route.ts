// 주식 추천 API — KIS 거래량 상위 종목 기반
import { NextResponse } from 'next/server'
import { isKisConfigured, getKisDailyPrices, getKisVolumeRank } from '@/lib/kis-api'
import { analyzeStocks } from '@/lib/recommendation-engine'

// KIS 거래량 상위 종목에서 인기 종목 가져오기
const getPopularStocks = async (): Promise<{ code: string; name: string }[]> => {
  try {
    const rank = await getKisVolumeRank()
    return rank.slice(0, 10).map((r) => ({ code: r.code, name: r.name }))
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
