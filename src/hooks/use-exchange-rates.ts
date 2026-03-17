'use client'

// 환율 데이터 조회 훅
import { useQuery } from '@tanstack/react-query'
import { REFRESH_INTERVAL } from '@/constants/stocks'
import type { ExchangeRate, ApiResponse } from '@/types/stock'

const fetchExchangeRates = async (): Promise<ExchangeRate[]> => {
  const res = await fetch('/api/exchange-rate')
  if (!res.ok) throw new Error('환율 데이터 조회 실패')
  const json: ApiResponse<ExchangeRate[]> = await res.json()
  if (json.error) throw new Error(json.error)
  return json.data
}

const useExchangeRates = () => {
  return useQuery({
    queryKey: ['exchange-rates'],
    queryFn: fetchExchangeRates,
    refetchInterval: REFRESH_INTERVAL,
  })
}

export default useExchangeRates
