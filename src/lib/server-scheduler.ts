// 서버 사이드 스캘핑 스케줄러 — 브라우저 없이 자동 실행 + 로그 파일 저장
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import {
  executeScalpingCycle, isMarketOpen, getScalpingLogs, getLastScan, getDailyStats,
  restoreLogs, restoreStats,
} from './scalping-engine'
import { getKisBalance } from './kis-api'
import type { ScalpingConfig } from './scalping-engine'
import type { TradeLogEntry } from './strategies/types'

// ─── 파일 저장/복원 (서버 전용) ────────────────────
const LOG_FILE = join(process.cwd(), '.scalping-logs.json')
const STATS_FILE = join(process.cwd(), '.scalping-stats.json')

const loadAndRestore = () => {
  try {
    if (existsSync(LOG_FILE)) {
      const logs: TradeLogEntry[] = JSON.parse(readFileSync(LOG_FILE, 'utf-8'))
      restoreLogs(logs)
      console.log(`[스캘핑] 로그 ${logs.length}건 복원됨`)
    }
  } catch { /* ignore */ }
  try {
    if (existsSync(STATS_FILE)) {
      const stats = JSON.parse(readFileSync(STATS_FILE, 'utf-8'))
      restoreStats(stats)
      console.log(`[스캘핑] 통계 복원됨 (주문 ${stats.orders}건, 손익 ${stats.pnl}원)`)
    }
  } catch { /* ignore */ }
}

const persistLogs = () => {
  try {
    // getScalpingLogs()는 reverse된 상태 → 다시 reverse해서 원본 순서로 저장
    // (복원 시 restoreLogs가 원본 순서를 기대하므로)
    const logs = getScalpingLogs().slice(0, 200).reverse()
    writeFileSync(LOG_FILE, JSON.stringify(logs), 'utf-8')
  } catch { /* ignore */ }
}

const persistStats = () => {
  try {
    const stats = getDailyStats()
    const today = new Date().toISOString().split('T')[0] ?? ''
    writeFileSync(STATS_FILE, JSON.stringify({ ...stats, date: today }), 'utf-8')
  } catch { /* ignore */ }
}

// 서버 시작 시 자동 복원
loadAndRestore()

// ─── 스케줄러 상태 ────────────────────────────────
interface SchedulerState {
  isRunning: boolean
  config: ScalpingConfig
  intervalId: ReturnType<typeof setInterval> | null
  lastError: string | null
  startedAt: string | null
  lastCycleAt: string | null
  cycleCount: number
}

const state: SchedulerState = {
  isRunning: false,
  config: {
    budget: 500000,
    maxPerTrade: 100000,
    maxPositions: 5,
    maxDailyOrders: 20,
    minScore: 25,
    mode: 'mock',
    riskLevel: 'normal',
  },
  intervalId: null,
  lastError: null,
  startedAt: null,
  lastCycleAt: null,
  cycleCount: 0,
}

const INTERVAL_MS = 3 * 60 * 1000 // 3분

/** 1사이클 실행 */
const runCycle = async () => {
  if (!isMarketOpen()) {
    console.log('[스캘핑] 장 운영시간 아님 — 스킵')
    return
  }

  try {
    console.log(`[스캘핑] 사이클 #${state.cycleCount + 1} 실행 중... (${state.config.mode} 모드)`)
    const result = await executeScalpingCycle(state.config)
    state.lastCycleAt = new Date().toISOString()
    state.cycleCount++
    const buyCount = result.logs.filter(l => l.action === 'BUY' && l.result === 'success').length
    const sellCount = result.logs.filter(l => l.action === 'SELL' && l.result === 'success').length
    const buySignals = result.scan.filter(s => s.signal === 'BUY').length
    const failCount = result.logs.filter(l => l.result === 'failed').length

    console.log(`[스캘핑] 완료 — 스캔 ${result.scan.length}종목 (매수신호 ${buySignals}, 최소점수 ${state.config.minScore}) / 매수 ${buyCount}건, 매도 ${sellCount}건${failCount > 0 ? `, 실패 ${failCount}건` : ''}`)

    // 보유종목 캐시 업데이트
    try {
      const balance = await getKisBalance(state.config.mode)
      updateHoldingsCache(balance.holdings.filter(h => h.quantity > 0).map(h => ({
        ...h,
        totalInvested: h.avgPrice * h.quantity,
      })))
    } catch { /* 잔고 조회 실패 무시 */ }

    if (buySignals > 0 && buyCount === 0 && sellCount === 0) {
      const topBuy = result.scan.filter(s => s.signal === 'BUY')[0]
      console.log(`[스캘핑] 매수 미실행 — 상위 종목: ${topBuy?.name}(${topBuy?.score}점) / 최소점수: ${state.config.minScore}`)
      if (failCount > 0) {
        const failedLogs = result.logs.filter(l => l.result === 'failed')
        failedLogs.forEach(l => console.log(`[스캘핑] 실패: ${l.name} ${l.action} — ${l.message}`))
      }
    }

    // 로그/통계 파일 저장
    if (result.logs.length > 0) persistLogs()
    persistStats()

    state.lastError = null
  } catch (error) {
    const msg = error instanceof Error ? error.message : '알 수 없는 오류'
    console.error('[스캘핑] 오류:', msg)
    state.lastError = msg
    state.lastCycleAt = new Date().toISOString()
  }
}

/** 스케줄러 시작 */
export const startScheduler = (config?: Partial<ScalpingConfig>) => {
  if (state.isRunning) {
    if (config) Object.assign(state.config, config)
    return
  }

  if (config) Object.assign(state.config, config)

  state.isRunning = true
  state.startedAt = new Date().toISOString()
  state.lastError = null
  state.lastCycleAt = null
  state.cycleCount = 0

  console.log(`[스캘핑] 스케줄러 시작 (${state.config.mode} 모드, ${INTERVAL_MS / 1000}초 간격)`)

  runCycle()
  state.intervalId = setInterval(runCycle, INTERVAL_MS)
}

/** 스케줄러 중지 */
export const stopScheduler = () => {
  if (!state.isRunning) return

  if (state.intervalId) {
    clearInterval(state.intervalId)
    state.intervalId = null
  }

  state.isRunning = false
  persistLogs()
  persistStats()
  console.log('[스캘핑] 스케줄러 중지 (로그 저장됨)')
}

/** 스케줄러 상태 조회 */
export const getSchedulerStatus = () => {
  // 잔고 조회는 비동기이므로 별도 holdings 필드에 마지막 캐시 제공
  return {
    isRunning: state.isRunning,
    config: state.config,
    startedAt: state.startedAt,
    lastError: state.lastError,
    lastCycleAt: state.lastCycleAt,
    cycleCount: state.cycleCount,
    logs: getScalpingLogs(),
    scan: getLastScan().slice(0, 10),
    marketOpen: isMarketOpen(),
    dailyStats: getDailyStats(),
    holdings: lastHoldings,
  }
}

// ─── 보유종목 캐시 (마지막 잔고 조회 결과) ──────────
interface HoldingInfo {
  code: string
  name: string
  quantity: number
  avgPrice: number
  currentPrice: number
  profitLoss: number
  profitLossPercent: number
  evalAmount: number
  totalInvested: number  // 매입금액 (평단가 × 수량)
}
let lastHoldings: HoldingInfo[] = []

/** 보유종목 캐시 업데이트 (스캘핑 사이클 후 호출) */
export const updateHoldingsCache = (holdings: HoldingInfo[]) => {
  lastHoldings = holdings
}

/** 설정 업데이트 (실행 중에도 가능) */
export const updateSchedulerConfig = (config: Partial<ScalpingConfig>) => {
  Object.assign(state.config, config)
}
