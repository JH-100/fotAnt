'use client'

import useAutoTradeStore from '@/store/auto-trade-store'

const RiskGauge = () => {
  const { dailyStats, config } = useAutoTradeStore()
  const pnl = dailyStats.pnl ?? 0
  const lossLevel = dailyStats.lossLevel ?? 'normal'
  const isAggressive = config.riskLevel === 'aggressive'

  // 게이지 위치: -30만원 ~ +30만원 범위를 0~100%로 매핑
  const gaugePercent = Math.max(0, Math.min(100, ((pnl + 300000) / 600000) * 100))

  // 현재 상태 색상
  const statusColor = lossLevel === 'full-stop'
    ? 'text-red-500'
    : lossLevel === 'recovery'
      ? 'text-red-400'
      : lossLevel === 'conservative'
        ? 'text-amber-400'
        : isAggressive
          ? 'text-purple-400'
          : 'text-emerald-400'

  const statusLabel = lossLevel === 'full-stop'
    ? '완전 중단'
    : lossLevel === 'recovery'
      ? '복구 모드'
      : lossLevel === 'conservative'
        ? '보수적'
        : isAggressive
          ? '공격 모드'
          : '정상'

  // 예상 수익/손실 범위 (대략적 추정)
  const tradeSize = isAggressive ? config.maxPerTrade * 1.5 : config.maxPerTrade
  const maxPos = isAggressive ? config.maxPositions + 3 : config.maxPositions
  const estProfit = Math.round(tradeSize * maxPos * 0.025 / 1000) // 2.5% 익절 가정
  const estLoss = Math.round(tradeSize * maxPos * 0.015 / 1000)   // 1.5% 손절 가정

  return (
    <div className="glass rounded-2xl p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="h-5 w-1 rounded-full bg-gradient-to-b from-amber-400 to-red-500" />
        <h3 className="font-semibold">리스크 게이지</h3>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusColor} ${
          isAggressive ? 'bg-purple-500/20' : lossLevel !== 'normal' ? 'bg-red-500/15' : 'bg-emerald-500/15'
        }`}>
          {statusLabel}
        </span>
      </div>

      {/* 게이지 바 */}
      <div className="relative mb-2">
        <div className="h-3 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-red-500 via-amber-400 via-emerald-400 to-purple-500 transition-all duration-500"
            style={{ width: '100%' }}
          />
        </div>
        {/* 포인터 */}
        <div
          className="absolute top-[-4px] h-5 w-1 rounded-full bg-white shadow-lg shadow-white/50 transition-all duration-500"
          style={{ left: `calc(${gaugePercent}% - 2px)` }}
        />
      </div>

      {/* 스케일 라벨 */}
      <div className="mb-4 flex justify-between text-[9px] text-muted-foreground">
        <span>-30만</span>
        <span>-20만</span>
        <span>-10만</span>
        <span>0</span>
        <span>+10만</span>
        <span>+20만</span>
        <span>+30만</span>
      </div>

      {/* 수치 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-white/[0.03] p-3 text-center">
          <p className="text-[9px] text-muted-foreground">일 손익</p>
          <p className={`font-mono text-sm font-bold ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {pnl >= 0 ? '+' : ''}{pnl.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl bg-emerald-500/5 p-3 text-center">
          <p className="text-[9px] text-muted-foreground">예상 수익</p>
          <p className="font-mono text-sm font-bold text-emerald-400">+{estProfit}천</p>
        </div>
        <div className="rounded-xl bg-rose-500/5 p-3 text-center">
          <p className="text-[9px] text-muted-foreground">예상 손실</p>
          <p className="font-mono text-sm font-bold text-rose-400">-{estLoss}천</p>
        </div>
      </div>
    </div>
  )
}

export default RiskGauge
