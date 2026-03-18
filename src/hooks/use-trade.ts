'use client'

// KIS 주문 실행 훅 — 실전/모의 모드 + 비밀번호 지원
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { KisOrderRequest, KisOrder } from '@/types/kis'

interface TradeParams {
  order: KisOrderRequest
  mode: 'real' | 'mock'
  password?: string
}

const executeTrade = async ({ order, mode, password }: TradeParams): Promise<KisOrder> => {
  const res = await fetch('/api/kis/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...order, mode, password }),
  })
  const json = await res.json()
  if (json.error) throw new Error(json.error)
  return json.data
}

const useTrade = (mode: 'real' | 'mock' = 'real') => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: executeTrade,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kis-balance', mode] })
    },
  })
}

export default useTrade
