// 자율 스캘핑 상태 관리 — 서버 스케줄러 상태 미러링
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TradeLogEntry } from '@/lib/strategies/types'
import type { ScalpingConfig } from '@/lib/scalping-engine'
import { DEFAULT_SCALPING } from '@/lib/scalping-engine'

export interface ScanItem {
  code: string
  name: string
  price: number
  score: number
  signal: 'BUY' | 'SELL' | 'HOLD'
  reasons: string[]
  rsi: number
  change: number
  takeProfitPercent: number
  stopLossPercent: number
  atrPercent: number
}

interface AutoTradeState {
  isRunning: boolean
  config: ScalpingConfig
  logs: TradeLogEntry[]
  scanResults: ScanItem[]
  lastExecuted: string | null
  dailyStats: { orders: number; pnl: number }

  setRunning: (running: boolean) => void
  setConfig: (config: Partial<ScalpingConfig>) => void
  addLogs: (logs: TradeLogEntry[]) => void
  setScanResults: (results: ScanItem[]) => void
  setLastExecuted: (time: string) => void
  setDailyStats: (stats: { orders: number; pnl: number }) => void
}

const useAutoTradeStore = create<AutoTradeState>()(
  persist(
    (set) => ({
      isRunning: false,
      config: DEFAULT_SCALPING,
      logs: [],
      scanResults: [],
      lastExecuted: null,
      dailyStats: { orders: 0, pnl: 0 },

      setRunning: (running) => set({ isRunning: running }),
      setConfig: (partial) =>
        set((state) => ({ config: { ...state.config, ...partial } })),
      addLogs: (newLogs) =>
        set((state) => {
          // 중복 제거 (같은 id는 스킵)
          const existingIds = new Set(state.logs.map(l => l.id))
          const unique = newLogs.filter(l => !existingIds.has(l.id))
          if (unique.length === 0) return state
          return { logs: [...unique, ...state.logs].slice(0, 200) }
        }),
      setScanResults: (results) => set({ scanResults: results }),
      setLastExecuted: (time) => set({ lastExecuted: time }),
      setDailyStats: (stats) => set({ dailyStats: stats }),
    }),
    {
      name: 'auto-trade-storage',
      // config만 persist (isRunning은 서버에서 폴링)
      partialize: (state) => ({
        config: state.config,
        logs: state.logs.slice(0, 50),
      }),
    }
  )
)

export default useAutoTradeStore
