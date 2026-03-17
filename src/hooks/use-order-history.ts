'use client'

import { useQuery } from '@tanstack/react-query'
import type { KisOrder } from '@/types/kis'

const fetchOrderHistory = async (): Promise<KisOrder[]> => {
  const res = await fetch('/api/kis/history')
  if (!res.ok) throw new Error('주문 내역을 불러올 수 없습니다.')
  const data = await res.json()
  return data.orders ?? []
}

const useOrderHistory = () => {
  return useQuery<KisOrder[]>({
    queryKey: ['order-history'],
    queryFn: fetchOrderHistory,
    refetchInterval: 30_000,
  })
}

export default useOrderHistory
