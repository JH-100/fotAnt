'use client'

// KIS 거래량 랭킹 조회 훅
import { useQuery } from '@tanstack/react-query'
import { REFRESH_INTERVAL } from '@/constants/stocks'
import type { RankingItem, ApiResponse } from '@/types/stock'

interface RankingParams {
  category?: string
  duration?: string
  market?: string
}

interface RankingResponse {
  items: RankingItem[]
  basedAt?: string
}

const fetchRanking = async (params: RankingParams): Promise<RankingResponse> => {
  const searchParams = new URLSearchParams()
  if (params.category) searchParams.set('category', params.category)
  if (params.duration) searchParams.set('duration', params.duration)
  if (params.market) searchParams.set('market', params.market)

  const res = await fetch(`/api/ranking?${searchParams.toString()}`)
  if (!res.ok) throw new Error('랭킹 데이터 조회 실패')
  const json: ApiResponse<RankingItem[]> = await res.json()
  if (json.error) throw new Error(json.error)
  return { items: json.data, basedAt: json.basedAt }
}

const useRanking = (params: RankingParams = {}) => {
  return useQuery({
    queryKey: ['ranking', params],
    queryFn: () => fetchRanking(params),
    refetchInterval: REFRESH_INTERVAL,
  })
}

export default useRanking
