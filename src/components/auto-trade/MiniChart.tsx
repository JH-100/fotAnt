'use client'

import { useEffect, useState } from 'react'
import useAutoTradeStore from '@/store/auto-trade-store'
import {
  ComposedChart, Bar, Line, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'

interface CandleData {
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  bbUpper?: number
  bbLower?: number
  vwap?: number
  signal?: 'BUY' | 'SELL'
}

interface ChartResponse {
  code: string
  name: string
  candles: CandleData[]
}

const MiniChart = () => {
  const { selectedChartCode, setSelectedChartCode, scanResults } = useAutoTradeStore()
  const [data, setData] = useState<ChartResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const selectedName = scanResults.find(s => s.code === selectedChartCode)?.name ?? selectedChartCode

  useEffect(() => {
    if (!selectedChartCode) { setData(null); return }
    let cancelled = false
    setLoading(true)
    fetch(`/api/auto-trade?action=chart&code=${selectedChartCode}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setData(d) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [selectedChartCode])

  if (!selectedChartCode) {
    return (
      <div className="glass rounded-2xl p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="h-5 w-1 rounded-full bg-gradient-to-b from-blue-400 to-cyan-500" />
          <h3 className="font-semibold">분봉 차트</h3>
        </div>
        <p className="py-12 text-center text-sm text-muted-foreground">
          스캔 결과에서 종목을 클릭하면 차트가 표시됩니다
        </p>
      </div>
    )
  }

  // 캔들차트용 데이터 변환: recharts는 native candle이 없어서 stacked bar trick
  const chartData = (data?.candles ?? []).map(c => ({
    time: c.time.slice(0, 5), // HH:MM
    open: c.open,
    close: c.close,
    high: c.high,
    low: c.low,
    // stacked bar: 아래쪽 투명 + 위쪽 실제 봉
    barBase: Math.min(c.open, c.close),
    barBody: Math.abs(c.close - c.open) || 1,
    isUp: c.close >= c.open,
    bbUpper: c.bbUpper,
    bbLower: c.bbLower,
    vwap: c.vwap,
    signal: c.signal,
    volume: c.volume,
  }))

  const prices = chartData.flatMap(d => [d.high, d.low]).filter(Boolean)
  const minPrice = Math.min(...prices) * 0.998
  const maxPrice = Math.max(...prices) * 1.002

  return (
    <div className="glass rounded-2xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-5 w-1 rounded-full bg-gradient-to-b from-blue-400 to-cyan-500" />
          <h3 className="font-semibold">분봉 차트</h3>
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px]">
            {selectedName} ({selectedChartCode})
          </span>
        </div>
        <button
          onClick={() => setSelectedChartCode(null)}
          className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-white/[0.05]"
        >
          닫기
        </button>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          차트 로딩 중...
        </div>
      ) : chartData.length === 0 ? (
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          분봉 데이터 없음
        </div>
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
              <XAxis
                dataKey="time"
                tick={{ fill: '#6b7280', fontSize: 9 }}
                axisLine={{ stroke: '#ffffff10' }}
                tickLine={false}
                interval={Math.floor(chartData.length / 6)}
              />
              <YAxis
                domain={[minPrice, maxPrice]}
                tick={{ fill: '#6b7280', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => v.toLocaleString()}
                width={55}
              />
              <Tooltip
                contentStyle={{
                  background: '#1a1a2e',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  fontSize: 11,
                  color: '#e2e8f0',
                }}
                labelStyle={{ color: '#94a3b8' }}
                formatter={(value, name) => {
                  const v = Number(value) || 0
                  if (name === 'barBase') return [null, null]
                  if (name === 'barBody') return [`${v.toLocaleString()}원`, '봉 크기']
                  if (name === 'bbUpper') return [`${v.toLocaleString()}`, 'BB 상단']
                  if (name === 'bbLower') return [`${v.toLocaleString()}`, 'BB 하단']
                  if (name === 'vwap') return [`${v.toLocaleString()}`, 'VWAP']
                  return [v.toLocaleString(), String(name)]
                }}
              />

              {/* 볼린저밴드 영역 */}
              <Area dataKey="bbUpper" stroke="none" fill="#8b5cf6" fillOpacity={0.05} />
              <Area dataKey="bbLower" stroke="none" fill="#8b5cf6" fillOpacity={0.05} />
              <Line dataKey="bbUpper" stroke="#8b5cf620" strokeWidth={1} dot={false} />
              <Line dataKey="bbLower" stroke="#8b5cf620" strokeWidth={1} dot={false} />

              {/* VWAP */}
              <Line dataKey="vwap" stroke="#06b6d4" strokeWidth={1} strokeDasharray="4 2" dot={false} />

              {/* 캔들 바디 (stacked bar trick) */}
              <Bar dataKey="barBase" stackId="candle" fill="transparent" isAnimationActive={false} />
              <Bar dataKey="barBody" stackId="candle" isAnimationActive={false}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.isUp ? '#10b981' : '#ef4444'} fillOpacity={0.8} />
                ))}
              </Bar>

              {/* 시그널 마커 */}
              {chartData.map((d, i) =>
                d.signal === 'BUY' ? (
                  <ReferenceLine key={`sig-${i}`} x={d.time} stroke="#10b981" strokeWidth={1} strokeDasharray="2 2" />
                ) : d.signal === 'SELL' ? (
                  <ReferenceLine key={`sig-${i}`} x={d.time} stroke="#ef4444" strokeWidth={1} strokeDasharray="2 2" />
                ) : null
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 범례 */}
      <div className="mt-2 flex items-center justify-center gap-4 text-[9px] text-muted-foreground">
        <span><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> 양봉</span>
        <span><span className="inline-block h-2 w-2 rounded-full bg-rose-500" /> 음봉</span>
        <span><span className="inline-block h-2 w-3 border-b border-dashed border-cyan-500" /> VWAP</span>
        <span><span className="inline-block h-2 w-3 border-b border-purple-500/30" /> BB</span>
      </div>
    </div>
  )
}

export default MiniChart
