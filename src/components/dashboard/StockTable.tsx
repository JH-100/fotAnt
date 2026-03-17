'use client'

// 주식 테이블 — 국내/미국 탭
import { useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import useStocks from '@/hooks/use-stocks'
import useRanking from '@/hooks/use-ranking'
import type { StockQuote, RankingItem } from '@/types/stock'

/** 가격 포맷팅 */
const formatPrice = (price: number): string =>
  new Intl.NumberFormat('ko-KR').format(price) + '원'

/** 거래량 포맷팅 */
const formatVolume = (volume: number): string => {
  if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(1)}M`
  if (volume >= 1_000) return `${(volume / 1_000).toFixed(1)}K`
  return volume.toLocaleString()
}

/** 금액 포맷팅 (조/억/만) */
const formatAmount = (v: number): string => {
  if (v >= 1e12) return `${(v / 1e12).toFixed(1)}조`
  if (v >= 1e8) return `${(v / 1e8).toFixed(1)}억`
  if (v >= 1e4) return `${Math.round(v / 1e4).toLocaleString()}만`
  return v.toLocaleString()
}

/** 국내 주식 행 */
const StockRow = ({ stock }: { stock: StockQuote }) => {
  const isUp = stock.changeType === 'UP'
  const isDown = stock.changeType === 'DOWN'

  return (
    <div className="flex items-center justify-between rounded-xl px-4 py-3 transition-colors hover:bg-white/[0.03]">
      <div className="min-w-0 flex-1">
        <span className="font-medium">{stock.name}</span>
      </div>
      <div className="flex items-center gap-4 text-right">
        <span className="w-28 font-mono text-sm font-semibold tabular-nums">
          {formatPrice(stock.price)}
        </span>
        <span
          className={`w-20 text-sm font-medium tabular-nums ${
            isUp ? 'text-emerald-400' : isDown ? 'text-rose-400' : 'text-muted-foreground'
          }`}
        >
          {isUp ? '▲' : isDown ? '▼' : '-'} {Math.abs(stock.changePercent).toFixed(2)}%
        </span>
        <span className="hidden w-24 font-mono text-xs tabular-nums text-muted-foreground sm:block">
          {isUp ? '+' : ''}{new Intl.NumberFormat('ko-KR').format(stock.change)}원
        </span>
        <span className="hidden w-16 font-mono text-xs tabular-nums text-muted-foreground lg:block">
          {formatVolume(stock.volume)}
        </span>
      </div>
    </div>
  )
}

/** 미국 주식 행 (랭킹 데이터 재활용) */
const UsStockRow = ({ item }: { item: RankingItem }) => {
  const isUp = item.changeType === 'UP'
  const isDown = item.changeType === 'DOWN'
  const displayPrice = item.priceKrw
    ? `${new Intl.NumberFormat('ko-KR').format(item.priceKrw)}원`
    : `$${new Intl.NumberFormat('en-US').format(item.price)}`

  return (
    <div className="flex items-center justify-between rounded-xl px-4 py-3 transition-colors hover:bg-white/[0.03]">
      <div className="min-w-0 flex-1">
        <span className="font-medium">{item.name}</span>
      </div>
      <div className="flex items-center gap-4 text-right">
        <span className="w-28 font-mono text-sm font-semibold tabular-nums">
          {displayPrice}
        </span>
        <span
          className={`w-20 text-sm font-medium tabular-nums ${
            isUp ? 'text-emerald-400' : isDown ? 'text-rose-400' : 'text-muted-foreground'
          }`}
        >
          {isUp ? '+' : ''}{item.changePercent.toFixed(2)}%
        </span>
        <span className="hidden w-24 font-mono text-xs tabular-nums text-muted-foreground sm:block">
          {formatAmount(item.amount)}
        </span>
      </div>
    </div>
  )
}

/** 국내 주식 컨텐츠 */
const KrStockContent = () => {
  const { data: stocks, isLoading, error } = useStocks()

  if (error) return <p className="py-8 text-center text-sm text-destructive">주식 데이터를 불러오지 못했습니다.</p>
  if (isLoading) return <LoadingSkeleton count={6} />

  return (
    <div className="divide-y divide-white/[0.03]">
      {stocks?.map((stock) => <StockRow key={stock.code} stock={stock} />)}
      {stocks?.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">데이터가 없습니다.</p>}
    </div>
  )
}

/** 미국 주식 컨텐츠 (토스 랭킹 market=us) */
const UsStockContent = () => {
  const { data, isLoading, error } = useRanking({ category: '토스증권 거래대금', market: 'us' })

  if (error) return <p className="py-8 text-center text-sm text-destructive">미국 주식 데이터를 불러오지 못했습니다.</p>
  if (isLoading) return <LoadingSkeleton count={10} />

  return (
    <div className="divide-y divide-white/[0.03]">
      {data?.items.map((item) => <UsStockRow key={item.code} item={item} />)}
    </div>
  )
}

/** 로딩 스켈레톤 */
const LoadingSkeleton = ({ count }: { count: number }) => (
  <div className="space-y-2 p-2">
    {Array.from({ length: count }).map((_, i) => (
      <Skeleton key={i} className="h-10 w-full rounded-lg" />
    ))}
  </div>
)

const StockTable = () => {
  const [tab, setTab] = useState<'kr' | 'us'>('kr')

  return (
    <div className="glass rounded-2xl">
      {/* 헤더 + 탭 */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="h-5 w-1 rounded-full bg-gradient-to-b from-emerald-400 to-blue-500" />
          <h3 className="font-semibold">주식 모니터링</h3>
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-muted-foreground">
            토스증권
          </span>
        </div>
        <div className="flex gap-1">
          {([
            { value: 'kr' as const, label: '국내' },
            { value: 'us' as const, label: '미국' },
          ]).map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                tab === t.value
                  ? 'bg-white/10 text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 컬럼 헤더 */}
      <div className="flex items-center justify-between border-b border-white/[0.04] px-4 py-2 text-xs text-muted-foreground">
        <span className="flex-1">종목명</span>
        <div className="flex items-center gap-4 text-right">
          <span className="w-28">현재가</span>
          <span className="w-20">등락률</span>
          <span className="hidden w-24 sm:block">{tab === 'kr' ? '전일대비' : '거래대금'}</span>
          {tab === 'kr' && <span className="hidden w-16 lg:block">거래량</span>}
        </div>
      </div>

      {/* 컨텐츠 */}
      <div className="p-2">
        {tab === 'kr' ? <KrStockContent /> : <UsStockContent />}
      </div>
    </div>
  )
}

export default StockTable
