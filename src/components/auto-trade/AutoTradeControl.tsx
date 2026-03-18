'use client'

// 자율 스캘핑 제어 — 서버 스케줄러 제어 + 상태 폴링
import { useCallback, useEffect, useState } from 'react'
import useAutoTradeStore from '@/store/auto-trade-store'
import useTradingStore from '@/store/trading-store'

const AutoTradeControl = () => {
  const {
    isRunning, setRunning, config, setConfig, addLogs,
    setScanResults, setLastExecuted, setDailyStats, dailyStats,
  } = useAutoTradeStore()
  const dashboardMode = useTradingStore((s) => s.mode)
  const [password, setPassword] = useState('')
  const [needsPassword, setNeedsPassword] = useState(false)
  const [error, setError] = useState('')
  const [lastError, setLastError] = useState<string | null>(null)
  const [startedAt, setStartedAt] = useState<string | null>(null)
  const [diagnostics, setDiagnostics] = useState<{
    scanCount?: number; buySignals?: number; marketOpen?: boolean;
    lastCycleAt?: string
  }>({})

  // 대시보드 모드 → 자동매매 모드 동기화
  useEffect(() => {
    if (!isRunning && config.mode !== dashboardMode) {
      setConfig({ mode: dashboardMode })
    }
  }, [dashboardMode, isRunning, config.mode, setConfig])

  // 서버 상태 폴링 (10초 간격)
  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/auto-trade')
      const data = await res.json()
      setRunning(data.isRunning ?? false)
      if (data.logs?.length > 0) addLogs(data.logs)
      if (data.scan?.length > 0) setScanResults(data.scan)
      if (data.dailyStats) setDailyStats(data.dailyStats)
      if (data.startedAt) setStartedAt(data.startedAt)
      setLastError(data.lastError)
      // 서버 모드 동기화 (서버가 실전으로 돌고 있으면 UI도 실전으로)
      if (data.isRunning && data.config?.mode) {
        setConfig({ mode: data.config.mode })
      }
      // 진단 정보
      setDiagnostics({
        scanCount: data.scan?.length ?? 0,
        buySignals: data.scan?.filter((s: { signal: string }) => s.signal === 'BUY')?.length ?? 0,
        marketOpen: data.marketOpen,
        lastCycleAt: data.lastCycleAt,
      })
    } catch { /* 네트워크 오류 무시 */ }
  }, [setRunning, addLogs, setScanResults, setDailyStats, setConfig])

  useEffect(() => {
    pollStatus() // 즉시 1회
    const id = setInterval(pollStatus, 10_000) // 10초 폴링
    return () => clearInterval(id)
  }, [pollStatus])

  // 시작
  const handleStart = async () => {
    if (config.mode === 'real' && !password) {
      setNeedsPassword(true)
      return
    }
    setError('')
    try {
      const res = await fetch('/api/auto-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          config,
          password: config.mode === 'real' ? password : undefined,
        }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
        return
      }
      setRunning(true)
      setNeedsPassword(false)
      setStartedAt(data.startedAt)
    } catch {
      setError('네트워크 오류')
    }
  }

  // 중지
  const handleStop = async () => {
    try {
      await fetch('/api/auto-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      })
      setRunning(false)
      setError('')
    } catch {
      setError('네트워크 오류')
    }
  }

  // 설정 변경 (서버에 반영)
  const handleUpdateConfig = async () => {
    try {
      await fetch('/api/auto-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          config,
          password: config.mode === 'real' ? password : undefined,
        }),
      })
    } catch { /* ignore */ }
  }

  // config 변경 시 서버에 반영
  useEffect(() => {
    if (isRunning) handleUpdateConfig()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config])

  const isReal = config.mode === 'real'

  return (
    <div className="glass rounded-2xl p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="h-5 w-1 rounded-full bg-gradient-to-b from-orange-400 to-rose-500" />
        <h3 className="font-semibold">자율 스캘핑</h3>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
          isReal ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
        }`}>
          {isReal ? '실전' : '모의'}
        </span>
        <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] text-blue-400">
          서버 실행
        </span>
      </div>

      {/* 상태 */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`h-3 w-3 rounded-full ${
            isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-white/20'
          }`} />
          <span className="text-sm font-medium">
            {isRunning ? '서버에서 스캘핑 중' : '대기'}
          </span>
        </div>
        {(isRunning || dailyStats.orders > 0) && (
          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">오늘 {dailyStats.orders}건</span>
            <span className={dailyStats.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
              {dailyStats.pnl >= 0 ? '+' : ''}{dailyStats.pnl.toLocaleString()}원
            </span>
          </div>
        )}
      </div>

      {/* 서버 실행 안내 */}
      {isRunning && (
        <div className="mb-4 rounded-lg bg-emerald-500/10 px-3 py-2">
          <p className="text-[11px] text-emerald-400">
            ✓ 서버에서 3분 간격으로 자동 실행 중 — 브라우저를 닫아도 계속 돌아갑니다.
          </p>
          {startedAt && (
            <p className="mt-1 text-[10px] text-emerald-400/60">
              시작: {new Date(startedAt).toLocaleString('ko-KR')}
            </p>
          )}
          {/* 진단 정보 */}
          <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-emerald-400/60">
            {diagnostics.marketOpen !== undefined && (
              <span>장상태: {diagnostics.marketOpen ? '🟢 열림' : '🔴 닫힘'}</span>
            )}
            {diagnostics.scanCount !== undefined && (
              <span>스캔: {diagnostics.scanCount}종목</span>
            )}
            {diagnostics.buySignals !== undefined && (
              <span>매수신호: {diagnostics.buySignals}건</span>
            )}
            {diagnostics.lastCycleAt && (
              <span>마지막: {new Date(diagnostics.lastCycleAt).toLocaleTimeString('ko-KR')}</span>
            )}
          </div>
        </div>
      )}

      {/* 서버 에러 표시 */}
      {lastError && isRunning && (
        <div className="mb-4 rounded-lg bg-amber-500/10 px-3 py-2">
          <p className="text-[10px] text-amber-400">⚠️ 마지막 오류: {lastError}</p>
        </div>
      )}

      {/* 실전 비밀번호 입력 */}
      {isReal && needsPassword && !isRunning && (
        <div className="mb-4 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            🔒 실전투자 비밀번호를 입력하세요. 서버에서 자동 실행됩니다.
          </p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && password) handleStart() }}
            placeholder="실전투자 비밀번호"
            autoFocus
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm outline-none focus:border-amber-400/50"
          />
        </div>
      )}

      {/* ON/OFF */}
      <button
        onClick={isRunning ? handleStop : handleStart}
        disabled={isReal && needsPassword && !password && !isRunning}
        className={`w-full rounded-xl py-3 text-sm font-semibold transition-all disabled:opacity-40 ${
          isRunning
            ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
            : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
        }`}
      >
        {isRunning ? '스캘핑 중지' : '스캘핑 시작'}
      </button>

      {error && (
        <p className="mt-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-400">{error}</p>
      )}

      <p className="mt-3 text-center text-[10px] text-muted-foreground">
        서버 3분 간격 · 자동 종목 탐색 · 익절/손절 자동 · 브라우저 꺼도 유지
      </p>
    </div>
  )
}

export default AutoTradeControl
