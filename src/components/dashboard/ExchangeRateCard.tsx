'use client'

// 환율 카드 컴포넌트 — 글래스모피즘
import { Skeleton } from '@/components/ui/skeleton'
import useExchangeRates from '@/hooks/use-exchange-rates'
import { EXCHANGE_PAIRS } from '@/constants/stocks'

/** 통화 플래그 이모지 */
const FLAG: Record<string, string> = {
  USD: '$', JPY: '¥', EUR: '€', CNY: '¥',
}

/** 통화 코드 → 한국어 라벨 */
const getLabel = (from: string, to: string): string => {
  const pair = EXCHANGE_PAIRS.find((p) => p.from === from && p.to === to)
  return pair?.label ?? `${from}/${to}`
}

/** 숫자 포맷팅 */
const formatRate = (rate: number): string =>
  new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rate)

const ExchangeRateCard = () => {
  const { data: rates, isLoading, error } = useExchangeRates()

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass rounded-2xl p-5">
            <Skeleton className="mb-3 h-4 w-16" />
            <Skeleton className="h-8 w-28" />
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="glass rounded-2xl p-6 text-center">
        <p className="text-sm text-destructive">환율 데이터를 불러오지 못했습니다.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {rates?.map((rate) => {
        const isUp = rate.changePercent > 0
        const isDown = rate.changePercent < 0

        return (
          <div
            key={`${rate.fromCurrency}-${rate.toCurrency}`}
            className={`glass rounded-2xl p-5 transition-all duration-300 ${isUp ? 'glow-up' : isDown ? 'glow-down' : ''}`}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">
                {getLabel(rate.fromCurrency, rate.toCurrency)}
              </span>
              <span className="text-lg opacity-60">
                {FLAG[rate.fromCurrency] ?? rate.fromCurrency}
              </span>
            </div>
            {/* 정방향: 1 외화 = X원 */}
            <div className="mb-1 font-mono text-2xl font-bold tabular-nums tracking-tight">
              ₩{formatRate(rate.rate)}
            </div>
            {/* 역방향: 1,000원 = X 외화 */}
            <div className="mb-2 text-xs text-muted-foreground">
              1,000원 = {rate.reverseRate?.toFixed(rate.fromCurrency === 'JPY' ? 1 : 2)} {rate.fromCurrency}
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`text-sm font-medium tabular-nums ${
                  isUp ? 'text-emerald-400' : isDown ? 'text-rose-400' : 'text-muted-foreground'
                }`}
              >
                {isUp ? '▲' : isDown ? '▼' : '-'}{' '}
                {rate.changePercent >= 0 ? '+' : ''}
                {rate.changePercent.toFixed(2)}%
              </span>
              <span className="text-xs text-muted-foreground">
                {rate.change >= 0 ? '+' : ''}{rate.change.toFixed(2)}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default ExchangeRateCard
