// 서버 사이드 스캘핑 스케줄러 — 브라우저 없이 자동 실행
import { executeScalpingCycle, isMarketOpen, getScalpingLogs, getLastScan, getDailyStats } from './scalping-engine'
import type { ScalpingConfig } from './scalping-engine'

interface SchedulerState {
  isRunning: boolean
  config: ScalpingConfig
  intervalId: ReturnType<typeof setInterval> | null
  lastError: string | null
  startedAt: string | null
  lastCycleAt: string | null
  cycleCount: number
}

// 서버 메모리에 스케줄러 상태 저장
const state: SchedulerState = {
  isRunning: false,
  config: {
    budget: 500000,
    maxPerTrade: 100000,
    maxPositions: 5,
    maxDailyOrders: 20,
    minScore: 25,
    mode: 'mock',
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
  // 장 운영시간 아니면 스킵 (주말, 야간)
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

    // 매수 신호는 있지만 주문이 없는 경우 원인 로깅
    if (buySignals > 0 && buyCount === 0 && sellCount === 0) {
      const topBuy = result.scan.filter(s => s.signal === 'BUY')[0]
      console.log(`[스캘핑] 매수 미실행 — 상위 종목: ${topBuy?.name}(${topBuy?.score}점) / 최소점수: ${state.config.minScore}`)
      if (failCount > 0) {
        const failedLogs = result.logs.filter(l => l.result === 'failed')
        failedLogs.forEach(l => console.log(`[스캘핑] 실패: ${l.name} ${l.action} — ${l.message}`))
      }
    }

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
    // 설정만 업데이트
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

  // 즉시 1회 실행
  runCycle()

  // 3분 간격 반복
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
  console.log('[스캘핑] 스케줄러 중지')
}

/** 스케줄러 상태 조회 */
export const getSchedulerStatus = () => ({
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
})

/** 설정 업데이트 (실행 중에도 가능) */
export const updateSchedulerConfig = (config: Partial<ScalpingConfig>) => {
  Object.assign(state.config, config)
}
