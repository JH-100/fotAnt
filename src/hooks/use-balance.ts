'use client'

// KIS 잔고 조회 훅 — 실전/모의 모드 지원
import { useQuery } from '@tanstack/react-query'
import type { KisBalance } from '@/types/kis'

const fetchBalance = async (mode: string): Promise<KisBalance | null> => {
  const res = await fetch(`/api/kis/balance?mode=${mode}`)
  const json = await res.json()
  if (json.error) throw new Error(json.error)
  return json.data
}

const useBalance = (mode: 'real' | 'mock' = 'real') => {
  return useQuery({
    queryKey: ['kis-balance', mode],
    queryFn: () => fetchBalance(mode),
    refetchInterval: 60_000,
    retry: 1,
  })
}

export default useBalance
