// 자동매매 상태 관리 (Zustand)
import { create } from 'zustand'
import type { SafetyConfig, TradeLogEntry } from '@/lib/strategies/types'
import { DEFAULT_SAFETY } from '@/lib/strategies/types'

interface AutoTradeState {
  // 자동매매 상태
  isRunning: boolean
  strategy: string
  safety: SafetyConfig
  targetStocks: { code: string; name: string }[]
  logs: TradeLogEntry[]
  lastExecuted: string | null

  // 액션
  setRunning: (running: boolean) => void
  setStrategy: (strategy: string) => void
  setSafety: (safety: Partial<SafetyConfig>) => void
  setTargetStocks: (stocks: { code: string; name: string }[]) => void
  addLogs: (logs: TradeLogEntry[]) => void
  setLastExecuted: (time: string) => void
}

const useAutoTradeStore = create<AutoTradeState>((set) => ({
  isRunning: false,
  strategy: 'rsi',
  safety: DEFAULT_SAFETY,
  targetStocks: [
    { code: '005930', name: '삼성전자' },
    { code: '000660', name: 'SK하이닉스' },
    { code: '035420', name: 'NAVER' },
    { code: '035720', name: '카카오' },
    { code: '068270', name: '셀트리온' },
  ],
  logs: [],
  lastExecuted: null,

  setRunning: (running) => set({ isRunning: running }),
  setStrategy: (strategy) => set({ strategy }),
  setSafety: (partial) =>
    set((state) => ({ safety: { ...state.safety, ...partial } })),
  setTargetStocks: (stocks) => set({ targetStocks: stocks }),
  addLogs: (newLogs) =>
    set((state) => ({ logs: [...newLogs, ...state.logs].slice(0, 200) })),
  setLastExecuted: (time) => set({ lastExecuted: time }),
}))

export default useAutoTradeStore
