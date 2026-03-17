'use client'

// 잔고 카드 컴포넌트
import { Skeleton } from '@/components/ui/skeleton'
import useBalance from '@/hooks/use-balance'

/** 금액 포맷팅 */
const formatMoney = (v: number): string =>
  new Intl.NumberFormat('ko-KR').format(v) + '원'

const BalanceCard = () => {
  const { data: balance, isLoading, error } = useBalance()

  if (error) {
    return (
      <div className="glass rounded-2xl p-6">
        <p className="text-sm text-muted-foreground">
          KIS API가 연결되지 않았습니다. 설정 페이지에서 API 키를 확인하세요.
        </p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="glass rounded-2xl p-6 space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-3 gap-4">
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

  return (
    <div className="glass rounded-2xl p-6">
      <div className="mb-1 flex items-center gap-3">
        <div className="h-5 w-1 rounded-full bg-gradient-to-b from-blue-400 to-emerald-500" />
        <h3 className="font-semibold">계좌 잔고</h3>
        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-muted-foreground">
          한국투자증권
        </span>
      </div>

      {/* 총 평가금액 */}
      <div className="mt-4 mb-6">
        <p className="text-xs text-muted-foreground">총 평가금액</p>
        <p className="font-mono text-3xl font-bold tabular-nums tracking-tight">
          {formatMoney(balance.totalEvaluation)}
        </p>
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl bg-white/[0.03] p-3">
          <p className="mb-1 text-[10px] text-muted-foreground">예수금</p>
          <p className="font-mono text-sm font-semibold tabular-nums">
            {formatMoney(balance.cashBalance)}
          </p>
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
    </div>
  )
}

export default BalanceCard
