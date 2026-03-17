'use client'

// 주식 시세 조회 훅 (토스증권 기반)
import { useQuery } from '@tanstack/react-query'
import { REFRESH_INTERVAL } from '@/constants/stocks'
import type { StockQuote, ApiResponse } from '@/types/stock'

const fetchStocks = async (): Promise<StockQuote[]> => {
  const res = await fetch('/api/stocks')
  if (!res.ok) throw new Error('주식 데이터 조회 실패')
  const json: ApiResponse<StockQuote[]> = await res.json()
  if (json.error) throw new Error(json.error)
  return json.data
}

const useStocks = () => {
  return useQuery({
    queryKey: ['stocks'],
    queryFn: fetchStocks,
    refetchInterval: REFRESH_INTERVAL,
  })
}

export default useStocks
