'use client'

// KIS 주문 실행 훅
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { KisOrderRequest, KisOrder } from '@/types/kis'

const executeTrade = async (order: KisOrderRequest): Promise<KisOrder> => {
  const res = await fetch('/api/kis/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(order),
  })
  const json = await res.json()
  if (json.error) throw new Error(json.error)
  return json.data
}

const useTrade = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: executeTrade,
    onSuccess: () => {
      // 주문 성공 후 잔고 새로고침
      queryClient.invalidateQueries({ queryKey: ['kis-balance'] })
    },
  })
}

export default useTrade
