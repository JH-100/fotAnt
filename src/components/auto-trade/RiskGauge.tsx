'use client'

import useAutoTradeStore from '@/store/auto-trade-store'

/* ────────────────────────────────────────────
   Loss-level metadata
   ──────────────────────────────────────────── */
const LOSS_LEVELS: Record<string, { label: string; color: string; bg: string; gaugeZone: number }> = {
  normal:       { label: '정상',      color: 'text-emerald-400', bg: 'bg-emerald-500/15', gaugeZone: 20 },
  conservative: { label: '보수적',    color: 'text-amber-400',   bg: 'bg-amber-500/15',   gaugeZone: 45 },
  recovery:     { label: '복구 모드', color: 'text-red-400',     bg: 'bg-red-500/15',     gaugeZone: 70 },
  'full-stop':  { label: '완전 중단', color: 'text-red-500',     bg: 'bg-red-500/20',     gaugeZone: 95 },
}

const AGGRESSIVE_META = { label: '공격 모드', color: 'text-purple-400', bg: 'bg-purple-500/20' }

/* ────────────────────────────────────────────
   Component
   ──────────────────────────────────────────── */
const RiskGauge = () => {
  const { dailyStats, config, logs } = useAutoTradeStore()

  const pnl = dailyStats.pnl ?? 0
  const orders = dailyStats.orders ?? 0
  const lossLevel = (dailyStats.lossLevel as string) ?? 'normal'
  const isAggressive = config.riskLevel === 'aggressive'

  // Resolve display metadata
  const levelMeta = LOSS_LEVELS[lossLevel] ?? LOSS_LEVELS.normal
  const modeMeta = isAggressive ? AGGRESSIVE_META : null
  const statusLabel = modeMeta && lossLevel === 'normal' ? modeMeta.label : levelMeta.label
  const statusColor = modeMeta && lossLevel === 'normal' ? modeMeta.color : levelMeta.color
  const statusBg = modeMeta && lossLevel === 'normal' ? modeMeta.bg : levelMeta.bg

  // Gauge pointer position: maps P&L from -300,000 ~ +300,000 to 0~100%
  const gaugePercent = Math.max(0, Math.min(100, ((pnl + 300_000) / 600_000) * 100))

  // Estimated daily range
  const tradeSize = isAggressive ? config.maxPerTrade * 1.5 : config.maxPerTrade
  const maxPos = isAggressive ? config.maxPositions + 3 : config.maxPositions
  const estProfit = Math.round((tradeSize * maxPos * 0.025) / 1_000) // 2.5% take-profit
  const estLoss = Math.round((tradeSize * maxPos * 0.015) / 1_000)   // 1.5% stop-loss

  // Win rate from recent logs (last 50 completed sell trades)
  const recentTrades = logs
    .filter((l) => l.action === 'SELL' && l.result === 'success')
    .slice(0, 50)
  const winCount = recentTrades.filter((l) => l.reason.includes('익절') || l.reason.includes('트레일링')).length
  const winRate = recentTrades.length >= 3 ? Math.round((winCount / recentTrades.length) * 100) : null

  return (
    <div className="glass rounded-2xl p-6">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <div className="h-5 w-1 rounded-full bg-gradient-to-b from-amber-400 to-red-500" />
        <h3 className="font-semibold">리스크 게이지</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusColor} ${statusBg}`}
        >
          {statusLabel}
        </span>
        {/* Show mode badge separately when lossLevel is not normal */}
        {isAggressive && lossLevel !== 'normal' && (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${AGGRESSIVE_META.color} ${AGGRESSIVE_META.bg}`}>
            공격
          </span>
        )}
      </div>

      {/* Gauge bar */}
      <div className="relative mb-2">
        {/* Background track */}
        <div className="h-3 overflow-hidden rounded-full bg-white/[0.06]">
          {/* Gradient: green → yellow → red → purple */}
          <div
            className="h-full w-full rounded-full"
            style={{
              background: 'linear-gradient(to right, #10b981 0%, #10b981 25%, #f59e0b 45%, #ef4444 70%, #a855f7 100%)',
            }}
          />
        </div>
        {/* Pointer marker */}
        <div
          className="absolute -top-1 h-5 w-1.5 rounded-full bg-white transition-all duration-700 ease-out"
          style={{
            left: `calc(${gaugePercent}% - 3px)`,
            boxShadow: '0 0 8px rgba(255,255,255,0.6), 0 0 2px rgba(255,255,255,0.9)',
          }}
        />
      </div>

      {/* Scale labels */}
      <div className="mb-4 flex justify-between text-[9px] text-muted-foreground">
        <span>-30만</span>
        <span>-20만</span>
        <span>-10만</span>
        <span className="font-medium text-white/40">0</span>
        <span>+10만</span>
        <span>+20만</span>
        <span>+30만</span>
      </div>

      {/* Main stats: daily P&L, loss level, mode */}
      <div className="mb-3 grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-white/[0.03] p-3 text-center">
          <p className="text-[9px] text-muted-foreground">일 손익</p>
          <p
            className={`font-mono text-sm font-bold ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}
          >
            {pnl >= 0 ? '+' : ''}
            {pnl.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl bg-white/[0.03] p-3 text-center">
          <p className="text-[9px] text-muted-foreground">손실 단계</p>
          <p className={`text-sm font-bold ${levelMeta.color}`}>{levelMeta.label}</p>
        </div>
        <div className="rounded-xl bg-white/[0.03] p-3 text-center">
          <p className="text-[9px] text-muted-foreground">현재 모드</p>
          <p className={`text-sm font-bold ${isAggressive ? 'text-purple-400' : 'text-emerald-400'}`}>
            {isAggressive ? '공격' : '일반'}
          </p>
        </div>
      </div>

      {/* Bottom stats: estimated range, win rate */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-emerald-500/5 p-3 text-center">
          <p className="text-[9px] text-muted-foreground">예상 수익</p>
          <p className="font-mono text-sm font-bold text-emerald-400">+{estProfit}천</p>
        </div>
        <div className="rounded-xl bg-rose-500/5 p-3 text-center">
          <p className="text-[9px] text-muted-foreground">예상 손실</p>
          <p className="font-mono text-sm font-bold text-rose-400">-{estLoss}천</p>
        </div>
        <div className="rounded-xl bg-white/[0.03] p-3 text-center">
          <p className="text-[9px] text-muted-foreground">승률{winRate !== null ? ` (${recentTrades.length}건)` : ''}</p>
          {winRate !== null ? (
            <p
              className={`font-mono text-sm font-bold ${
                winRate >= 60 ? 'text-emerald-400' : winRate >= 40 ? 'text-amber-400' : 'text-rose-400'
              }`}
            >
              {winRate}%
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">-</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default RiskGauge
