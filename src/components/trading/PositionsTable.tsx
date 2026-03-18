'use client'

// 보유종목 테이블 — 모드 지원
import { Skeleton } from '@/components/ui/skeleton'
import useBalance from '@/hooks/use-balance'
import type { KisHolding } from '@/types/kis'

const formatMoney = (v: number): string =>
  new Intl.NumberFormat('ko-KR').format(v) + '원'

const HoldingRow = ({ holding }: { holding: KisHolding }) => {
  const isProfitable = holding.profitLoss >= 0

  return (
    <div className="flex items-center justify-between rounded-xl px-4 py-3 transition-colors hover:bg-white/[0.03]">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{holding.name}</p>
        <p className="text-xs text-muted-foreground">{holding.code} · {holding.quantity}주</p>
      </div>
      <div className="flex items-center gap-4 text-right">
        <div>
          <p className="font-mono text-sm font-semibold tabular-nums">
            {formatMoney(holding.currentPrice)}
          </p>
          <p className="font-mono text-[10px] text-muted-foreground tabular-nums">
            평균 {formatMoney(holding.avgPrice)}
          </p>
        </div>
        <div className="w-24">
          <p className={`font-mono text-sm font-medium tabular-nums ${
            isProfitable ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {isProfitable ? '+' : ''}{formatMoney(holding.profitLoss)}
          </p>
          <p className={`font-mono text-[10px] tabular-nums ${
            isProfitable ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {isProfitable ? '+' : ''}{holding.profitLossPercent.toFixed(2)}%
          </p>
        </div>
      </div>
    </div>
  )
}

const PositionsTable = ({ mode = 'real' }: { mode?: 'real' | 'mock' }) => {
  const { data: balance, isLoading } = useBalance(mode)

  return (
    <div className="glass rounded-2xl">
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-6 py-4">
        <div className="h-5 w-1 rounded-full bg-gradient-to-b from-violet-400 to-rose-500" />
        <h3 className="font-semibold">보유종목</h3>
      </div>

      <div className="p-2">
        {isLoading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : !balance || balance.holdings.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            보유종목이 없습니다.
          </p>
        ) : (
          <div className="divide-y divide-white/[0.03]">
            {balance.holdings.map((h) => (
              <HoldingRow key={h.code} holding={h} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default PositionsTable
