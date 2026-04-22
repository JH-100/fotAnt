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
  dailyStats: { orders: number; pnl: number; lossLevel?: string }
  selectedChartCode: string | null

  setRunning: (running: boolean) => void
  setConfig: (config: Partial<ScalpingConfig>) => void
  setSelectedChartCode: (code: string | null) => void
  addLogs: (logs: TradeLogEntry[]) => void
  setScanResults: (results: ScanItem[]) => void
  setLastExecuted: (time: string) => void
  setDailyStats: (stats: { orders: number; pnl: number; lossLevel?: string }) => void
  /** 폴링 데이터를 한번에 업데이트 (persist 쓰기 1회로 줄임) */
  updateFromServer: (data: {
    isRunning?: boolean
    logs?: TradeLogEntry[]
    scanResults?: ScanItem[]
    dailyStats?: { orders: number; pnl: number; lossLevel?: string }
    config?: Partial<ScalpingConfig>
  }) => void
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
      selectedChartCode: null,

      setRunning: (running) => set({ isRunning: running }),
      setSelectedChartCode: (code) => set({ selectedChartCode: code }),
      setConfig: (partial) =>
        set((state) => ({ config: { ...state.config, ...partial } })),
      addLogs: (newLogs) =>
        set((state) => {
          const existingIds = new Set(state.logs.map(l => l.id))
          const unique = newLogs.filter(l => !existingIds.has(l.id))
          if (unique.length === 0) return state
          return { logs: [...unique, ...state.logs].slice(0, 200) }
        }),
      setScanResults: (results) => set({ scanResults: results }),
      setLastExecuted: (time) => set({ lastExecuted: time }),
      setDailyStats: (stats) => set({ dailyStats: stats }),

      // 폴링에서 한번에 업데이트 → persist 쓰기 1회
      updateFromServer: (data) =>
        set((state) => {
          const updates: Partial<AutoTradeState> = {}

          if (data.isRunning !== undefined) {
            updates.isRunning = data.isRunning
          }

          if (data.logs && data.logs.length > 0) {
            const existingIds = new Set(state.logs.map(l => l.id))
            const unique = data.logs.filter(l => !existingIds.has(l.id))
            if (unique.length > 0) {
              updates.logs = [...unique, ...state.logs].slice(0, 200)
            }
          }

          if (data.scanResults) {
            updates.scanResults = data.scanResults
          }

          if (data.dailyStats) {
            updates.dailyStats = data.dailyStats
          }

          if (data.config) {
            updates.config = { ...state.config, ...data.config }
          }

          return updates
        }),
    }),
    {
      name: 'auto-trade-storage',
      version: 3, // 스키마 변경 시 올리면 localStorage 자동 초기화
      // config + logs만 persist (scanResults, dailyStats는 휘발성)
      partialize: (state) => ({
        config: state.config,
        logs: state.logs.slice(0, 50),
      }),
      // 버전 업그레이드 시 이전 config 보존 (기본값 위에 덮어씌움)
      migrate: (persistedState: unknown) => {
        const s = persistedState as Partial<AutoTradeState>
        return {
          ...s,
          config: { ...DEFAULT_SCALPING, ...(s.config ?? {}) },
        }
      },
      // 역직렬화 실패 시 기본값으로 폴백 (크래시 방지)
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.warn('[auto-trade-store] rehydrate 실패, 기본값으로 초기화:', error)
        }
      },
    }
  )
)

export default useAutoTradeStore
