'use client'

// 잔고 카드 — 예수금/투자금/평가금 분리 표시
import { Skeleton } from '@/components/ui/skeleton'
import useBalance from '@/hooks/use-balance'

const formatMoney = (v: number): string =>
  new Intl.NumberFormat('ko-KR').format(v) + '원'

const BalanceCard = ({ mode = 'real' }: { mode?: 'real' | 'mock' }) => {
  const { data: balance, isLoading, error } = useBalance(mode)

  if (error) {
    return (
      <div className="glass rounded-2xl p-6">
        <p className="text-sm text-muted-foreground">
          {mode === 'mock' ? '모의투자' : '실전투자'} API가 연결되지 않았습니다.
        </p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="glass rounded-2xl p-6 space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      </div>
    )
  }

  if (!balance) {
    return (
      <div className="glass rounded-2xl p-6">
        <p className="text-sm text-muted-foreground">잔고 데이터가 없습니다.</p>
      </div>
    )
  }

  const isProfitable = balance.totalProfitLoss >= 0

  // 투자금 = 보유종목 평가금 합계
  const investedAmount = balance.holdings.reduce((sum, h) => sum + h.evalAmount, 0)
  // 매입금 = 보유종목 매입가 합계
  const purchasedAmount = balance.holdings.reduce((sum, h) => sum + (h.avgPrice * h.quantity), 0)
  // 실제 남은 현금 = 총 평가금 - 보유종목 평가금
  // (KIS 모의투자 API는 cashBalance를 초기 입금액으로 줄 때가 있어서 직접 계산)
  const totalAsset = balance.totalEvaluation || (balance.cashBalance + investedAmount)
  const actualCash = investedAmount > 0 ? totalAsset - investedAmount : balance.cashBalance

  return (
    <div className="glass rounded-2xl p-6">
      <div className="mb-1 flex items-center gap-3">
        <div className={`h-5 w-1 rounded-full bg-gradient-to-b ${
          mode === 'real' ? 'from-blue-400 to-emerald-500' : 'from-amber-400 to-orange-500'
        }`} />
        <h3 className="font-semibold">계좌 잔고</h3>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${
          mode === 'real'
            ? 'border-emerald-500/30 text-emerald-400'
            : 'border-amber-500/30 text-amber-400'
        }`}>
          {mode === 'real' ? '실전투자' : '모의투자'}
        </span>
      </div>

      {/* 총 자산 */}
      <div className="mt-4 mb-6">
        <p className="text-xs text-muted-foreground">총 자산</p>
        <p className="font-mono text-3xl font-bold tabular-nums tracking-tight">
          {formatMoney(balance.totalEvaluation || totalAsset)}
        </p>
      </div>

      {/* 4칸 그리드 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white/[0.03] p-3">
          <p className="mb-1 text-[10px] text-muted-foreground">가용 현금</p>
          <p className="font-mono text-sm font-semibold tabular-nums">
            {formatMoney(actualCash)}
          </p>
        </div>
        <div className="rounded-xl bg-white/[0.03] p-3">
          <p className="mb-1 text-[10px] text-muted-foreground">투자 중</p>
          <p className="font-mono text-sm font-semibold tabular-nums text-blue-400">
            {investedAmount > 0 ? formatMoney(investedAmount) : '-'}
          </p>
          {purchasedAmount > 0 && (
            <p className="font-mono text-[9px] text-muted-foreground">
              매입 {formatMoney(purchasedAmount)}
            </p>
          )}
        </div>
        <div className="rounded-xl bg-white/[0.03] p-3">
          <p className="mb-1 text-[10px] text-muted-foreground">총 손익</p>
          <p className={`font-mono text-sm font-semibold tabular-nums ${
            isProfitable ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {isProfitable ? '+' : ''}{formatMoney(balance.totalProfitLoss)}
          </p>
        </div>
        <div className="rounded-xl bg-white/[0.03] p-3">
          <p className="mb-1 text-[10px] text-muted-foreground">수익률</p>
          <p className={`font-mono text-sm font-semibold tabular-nums ${
            isProfitable ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {isProfitable ? '+' : ''}{balance.totalProfitLossPercent.toFixed(2)}%
          </p>
        </div>
      </div>

      {/* 보유종목 수 요약 */}
      {balance.holdings.length > 0 && (
        <p className="mt-3 text-center text-[10px] text-muted-foreground">
          {balance.holdings.length}종목 보유 중
        </p>
      )}
    </div>
  )
}

export default BalanceCard
