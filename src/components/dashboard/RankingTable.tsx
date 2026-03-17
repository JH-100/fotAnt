'use client'

// 토스증권 랭킹 — 글래스모피즘
import { useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import useRanking from '@/hooks/use-ranking'
import type { RankingItem } from '@/types/stock'

/** 금액 포맷팅 (조/억/만) */
const formatAmount = (v: number): string => {
  if (v >= 1e12) return `${(v / 1e12).toFixed(1)}조`
  if (v >= 1e8) return `${(v / 1e8).toFixed(1)}억`
  if (v >= 1e4) return `${Math.round(v / 1e4).toLocaleString()}만`
  return v.toLocaleString()
}

/** 기준시간 포맷팅 */
const formatBasedAt = (basedAt?: string): string => {
  if (!basedAt) return ''
  const date = new Date(basedAt)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const h = date.getHours().toString().padStart(2, '0')
  const m = date.getMinutes().toString().padStart(2, '0')
  return isToday ? `${h}:${m} 기준` : `${date.getMonth() + 1}/${date.getDate()} ${h}:${m}`
}

/** 랭킹 행 */
const RankRow = ({ item }: { item: RankingItem }) => {
  const isUp = item.changeType === 'UP'
  const isDown = item.changeType === 'DOWN'
  const displayPrice = item.priceKrw
    ? `${new Intl.NumberFormat('ko-KR').format(item.priceKrw)}원`
    : `${new Intl.NumberFormat('ko-KR').format(item.price)}원`

  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.03]">
      <span className="w-6 text-center font-mono text-xs text-muted-foreground">
        {item.rank}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {item.name}
      </span>
      <span className="w-24 text-right font-mono text-xs tabular-nums">
        {displayPrice}
      </span>
      <span
        className={`w-16 text-right text-xs font-medium tabular-nums ${
          isUp ? 'text-emerald-400' : isDown ? 'text-rose-400' : 'text-muted-foreground'
        }`}
      >
        {isUp ? '+' : ''}{item.changePercent.toFixed(2)}%
      </span>
      <span className="hidden w-16 text-right font-mono text-xs tabular-nums text-muted-foreground sm:block">
        {formatAmount(item.amount)}
      </span>
    </div>
  )
}

/** 카테고리별 랭킹 */
const RankingContent = ({ category, market }: { category: string; market: string }) => {
  const { data, isLoading, error } = useRanking({ category, market })

  if (error) {
    return (
      <p className="py-6 text-center text-sm text-destructive">
        랭킹 데이터를 불러오지 못했습니다.
      </p>
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-1.5 p-1">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  return (
    <>
      {data?.basedAt && (
        <p className="mb-2 px-3 text-[10px] text-muted-foreground">
          {formatBasedAt(data.basedAt)}
        </p>
      )}
      <div className="max-h-[520px] divide-y divide-white/[0.03] overflow-y-auto">
        {data?.items.map((item) => (
          <RankRow key={item.code} item={item} />
        ))}
      </div>
    </>
  )
}

const RankingTable = () => {
  const [market, setMarket] = useState('all')

  return (
    <div className="glass rounded-2xl">
      {/* 헤더 */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="h-5 w-1 rounded-full bg-gradient-to-b from-violet-400 to-rose-500" />
          <h3 className="font-semibold">실시간 랭킹</h3>
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-muted-foreground">
            토스증권
          </span>
        </div>
        <div className="flex gap-1">
          {[
            { value: 'all', label: '전체' },
            { value: 'kr', label: '국내' },
            { value: 'us', label: '미국' },
          ].map((m) => (
            <button
              key={m.value}
              onClick={() => setMarket(m.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                market === m.value
                  ? 'bg-white/10 text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* 탭 + 컨텐츠 */}
      <div className="p-4">
        <Tabs defaultValue="토스증권 거래대금">
          <TabsList className="mb-3 w-full">
            <TabsTrigger value="토스증권 거래대금" className="flex-1">거래대금</TabsTrigger>
            <TabsTrigger value="토스증권 거래량" className="flex-1">거래량</TabsTrigger>
            <TabsTrigger value="급상승" className="flex-1">급상승</TabsTrigger>
            <TabsTrigger value="급하락" className="flex-1">급하락</TabsTrigger>
          </TabsList>
          {['토스증권 거래대금', '토스증권 거래량', '급상승', '급하락'].map((cat) => (
            <TabsContent key={cat} value={cat}>
              <RankingContent category={cat} market={market} />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  )
}

export default RankingTable
