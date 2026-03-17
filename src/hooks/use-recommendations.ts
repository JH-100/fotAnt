'use client'

import { useQuery } from '@tanstack/react-query'
import type { StockRecommendation } from '@/types/kis'

const fetchRecommendations = async (): Promise<StockRecommendation[]> => {
  const res = await fetch('/api/recommendations')
  if (!res.ok) throw new Error('추천 데이터를 불러올 수 없습니다.')
  const data = await res.json()
  return data.recommendations ?? []
}

const useRecommendations = () => {
  return useQuery<StockRecommendation[]>({
    queryKey: ['recommendations'],
    queryFn: fetchRecommendations,
    refetchInterval: 5 * 60 * 1000, // 5분
    staleTime: 3 * 60 * 1000,
  })
}

export default useRecommendations
