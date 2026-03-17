'use client'

// 자동매매 ON/OFF 제어
import { useCallback, useEffect, useRef } from 'react'
import useAutoTradeStore from '@/store/auto-trade-store'

const AutoTradeControl = () => {
  const { isRunning, setRunning, strategy, targetStocks, safety, addLogs, setLastExecuted, lastExecuted } =
    useAutoTradeStore()
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const execute = useCallback(async () => {
    try {
      const res = await fetch('/api/auto-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy, targetStocks, safety }),
      })
      const data = await res.json()
      if (data.logs) {
        addLogs(data.logs)
        setLastExecuted(data.timestamp ?? new Date().toISOString())
      }
    } catch {
      // 실패 시 자동 중지하지 않음 — 다음 간격에 재시도
    }
  }, [strategy, targetStocks, safety, addLogs, setLastExecuted])

  useEffect(() => {
    if (isRunning) {
      execute() // 즉시 1회 실행
      intervalRef.current = setInterval(execute, 5 * 60 * 1000) // 5분 간격
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isRunning, execute])

  return (
    <div className="glass rounded-2xl p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="h-5 w-1 rounded-full bg-gradient-to-b from-orange-400 to-rose-500" />
        <h3 className="font-semibold">자동매매</h3>
      </div>

      {/* 상태 표시 */}
      <div className="mb-4 flex items-center gap-3">
        <div className={`h-3 w-3 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-white/20'}`} />
        <span className="text-sm font-medium">{isRunning ? '실행 중' : '중지됨'}</span>
      </div>

      {/* ON/OFF 토글 */}
      <button
        onClick={() => setRunning(!isRunning)}
        className={`w-full rounded-xl py-3 text-sm font-semibold transition-all ${
          isRunning
            ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
            : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
        }`}
      >
        {isRunning ? '자동매매 중지' : '자동매매 시작'}
      </button>

      {lastExecuted && (
        <p className="mt-3 text-center text-[10px] text-muted-foreground">
          마지막 실행: {new Date(lastExecuted).toLocaleString('ko-KR')}
        </p>
      )}

      <p className="mt-2 text-center text-[10px] text-muted-foreground">
        5분 간격 · 장중(09:00~15:30) 실행
      </p>
    </div>
  )
}

export default AutoTradeControl
