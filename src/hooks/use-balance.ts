'use client'

// KIS 잔고 조회 훅
import { useQuery } from '@tanstack/react-query'
import type { KisBalance } from '@/types/kis'

const fetchBalance = async (): Promise<KisBalance | null> => {
  const res = await fetch('/api/kis/balance')
  const json = await res.json()
  if (json.error) throw new Error(json.error)
  return json.data
}

const useBalance = () => {
  return useQuery({
    queryKey: ['kis-balance'],
    queryFn: fetchBalance,
    refetchInterval: 60_000,
    retry: 1,
  })
}

export default useBalance
