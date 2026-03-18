// 매매 상태 관리 (Zustand) — 실전/모의 듀얼 모드
import { create } from 'zustand'
import type { KisOrderRequest } from '@/types/kis'

type TradingMode = 'real' | 'mock'

interface TradingState {
  // 모드
  mode: TradingMode

  // 주문 확인 다이얼로그
  pendingOrder: KisOrderRequest | null
  isConfirmOpen: boolean

  // 액션
  setMode: (mode: TradingMode) => void
  openConfirm: (order: KisOrderRequest) => void
  closeConfirm: () => void
}

const useTradingStore = create<TradingState>((set) => ({
  mode: 'real',
  pendingOrder: null,
  isConfirmOpen: false,

  setMode: (mode) => set({ mode }),
  openConfirm: (order) => set({ pendingOrder: order, isConfirmOpen: true }),
  closeConfirm: () => set({ pendingOrder: null, isConfirmOpen: false }),
}))

export default useTradingStore
