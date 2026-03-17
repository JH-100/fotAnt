// 매매 상태 관리 (Zustand)
import { create } from 'zustand'
import type { KisOrderRequest } from '@/types/kis'

interface TradingState {
  // 인증 상태
  isConnected: boolean
  isMockMode: boolean

  // 주문 확인 다이얼로그
  pendingOrder: KisOrderRequest | null
  isConfirmOpen: boolean

  // 액션
  setConnected: (connected: boolean) => void
  setMockMode: (mock: boolean) => void
  openConfirm: (order: KisOrderRequest) => void
  closeConfirm: () => void
}

const useTradingStore = create<TradingState>((set) => ({
  isConnected: false,
  isMockMode: true,
  pendingOrder: null,
  isConfirmOpen: false,

  setConnected: (connected) => set({ isConnected: connected }),
  setMockMode: (mock) => set({ isMockMode: mock }),
  openConfirm: (order) => set({ pendingOrder: order, isConfirmOpen: true }),
  closeConfirm: () => set({ pendingOrder: null, isConfirmOpen: false }),
}))

export default useTradingStore
