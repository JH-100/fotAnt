'use client'

// 미장 실시간 추천 — AI 기술분석 기반 미국 주식 매수/매도 시그널
import { useCallback, useEffect, useState } from 'react'
import UsRecommendationCard from '@/components/us-stocks/UsRecommendationCard'

interface UsRecommendation {
  symbol: string
  name: string
  exchange: string
  price: number
  priceKrw: number
  change: number
  score: number
  signal: 'BUY' | 'SELL' | 'HOLD'
  reasons: string[]
  timestamp: string
}

const UsStocksPage = () => {
  const [isRunning, setIsRunning] = useState(false)
  const [recommendations, setRecommendations] = useState<UsRecommendation[]>([])
  const [lastScanAt, setLastScanAt] = useState<string | null>(null)
  const [mode, setMode] = useState<'real' | 'mock'>('mock')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 서버 상태 폴링
  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/us-recommendations')
      const data = await res.json()
      setIsRunning(data.isRunning ?? false)
      setRecommendations(data.recommendations ?? [])
      setLastScanAt(data.lastScanAt ?? null)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => {
    pollStatus()
    const id = setInterval(pollStatus, 10_000)
    return () => clearInterval(id)
  }, [pollStatus])

  // 시작
  const handleStart = async () => {
    setError('')
    try {
      const res = await fetch('/api/us-recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', mode }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
        return
      }
      setIsRunning(true)
    } catch {
      setError('네트워크 오류')
    }
  }

  // 중지
  const handleStop = async () => {
    setError('')
    try {
      await fetch('/api/us-recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      })
      setIsRunning(false)
    } catch {
      setError('네트워크 오류')
    }
  }

  const buyCount = recommendations.filter((r) => r.signal === 'BUY').length
  const sellCount = recommendations.filter((r) => r.signal === 'SELL').length

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      {/* 헤더 */}
      <header className="space-y-2">
        <h1 className="bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-400 bg-clip-text text-4xl font-bold tracking-tight text-transparent">
          미장 실시간 추천
        </h1>
        <p className="text-sm text-muted-foreground">
          AI 기술분석 기반 미국 주식 매수/매도 시그널
        </p>
      </header>

      {/* 제어 패널 */}
      <div className="glass rounded-2xl p-6">
        <div className="flex flex-wrap items-center gap-4">
          {/* 상태 표시 */}
          <div className="flex items-center gap-3">
            <div className={`h-3 w-3 rounded-full ${
              isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-white/20'
            }`} />
            <span className="text-sm font-medium">
              {isRunning ? '스캔 실행 중' : '대기'}
            </span>
          </div>

          {/* 모드 선택 */}
          <div className="flex items-center gap-1 rounded-full bg-white/[0.04] p-0.5">
            <button
              onClick={() => !isRunning && setMode('mock')}
              disabled={isRunning}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                mode === 'mock'
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'text-muted-foreground hover:text-foreground'
              } disabled:opacity-50`}
            >
              모의
            </button>
            <button
              onClick={() => !isRunning && setMode('real')}
              disabled={isRunning}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                mode === 'real'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'text-muted-foreground hover:text-foreground'
              } disabled:opacity-50`}
            >
              실전
            </button>
          </div>

          {/* 시작/중지 버튼 */}
          <button
            onClick={isRunning ? handleStop : handleStart}
            className={`rounded-xl px-6 py-2 text-sm font-semibold transition-all ${
              isRunning
                ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
                : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
            }`}
          >
            {isRunning ? '스캔 중지' : '스캔 시작'}
          </button>

          {/* 마지막 스캔 시각 */}
          {lastScanAt && (
            <span className="text-[10px] text-muted-foreground">
              마지막 스캔: {new Date(lastScanAt).toLocaleString('ko-KR')}
            </span>
          )}

          {/* 요약 통계 */}
          {recommendations.length > 0 && (
            <div className="ml-auto flex items-center gap-3 text-xs">
              <span className="text-muted-foreground">{recommendations.length}종목</span>
              {buyCount > 0 && <span className="text-emerald-400">BUY {buyCount}</span>}
              {sellCount > 0 && <span className="text-rose-400">SELL {sellCount}</span>}
            </div>
          )}
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-400">{error}</p>
        )}

        {isRunning && (
          <div className="mt-3 rounded-lg bg-emerald-500/10 px-3 py-2">
            <p className="text-[11px] text-emerald-400">
              서버에서 미국 주식을 분석 중입니다 -- 10초마다 자동 갱신
            </p>
          </div>
        )}
      </div>

      {/* 추천 목록 */}
      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">불러오는 중...</p>
      ) : recommendations.length === 0 ? (
        <div className="glass rounded-2xl py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {isRunning ? '종목을 분석 중입니다...' : '스캔을 시작하면 추천 종목이 여기에 표시됩니다'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recommendations.map((rec) => (
            <UsRecommendationCard key={rec.symbol} rec={rec} />
          ))}
        </div>
      )}
    </div>
  )
}

export default UsStocksPage
