'use client'

// 주식 테이블 — 국내/미국 탭 + 필터 + 정렬
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
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

type SortKey = 'name' | 'price' | 'change'
type SortDir = 'asc' | 'desc'
type Filter = 'all' | 'etf' | 'low' | 'mid'

/** ETF/인버스 판별 */
const isETF = (name: string): boolean =>
  /KODEX|TIGER|KBSTAR|HANARO|SOL|ACE|ARIRANG|인버스|레버리지/i.test(name)

/** 국내 주식 행 */
const StockRow = ({ stock }: { stock: StockQuote }) => {
  const isUp = stock.changeType === 'UP'
  const isDown = stock.changeType === 'DOWN'
  const router = useRouter()
  const cleanCode = stock.code.replace(/^A/, '')

  return (
    <div
      onClick={() => router.push(`/?code=${cleanCode}&name=${encodeURIComponent(stock.name)}`)}
      className="flex cursor-pointer items-center justify-between rounded-xl px-4 py-3 transition-colors hover:bg-white/[0.06]"
    >
      <div className="min-w-0 flex-1">
        <span className="font-medium">{stock.name}</span>
        <span className="ml-2 font-mono text-[10px] text-muted-foreground">{cleanCode}</span>
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
    <div className="flex items-center justify-between rounded-xl px-4 py-3 transition-colors hover:bg-white/[0.06]">
      <div className="min-w-0 flex-1">
        <span className="font-medium">{item.name}</span>
        <span className="ml-2 font-mono text-[10px] text-muted-foreground">{item.code}</span>
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

/** 국내 주식 컨텐츠 — 모니터링 + 랭킹 합산 */
const KrStockContent = ({ filter, sortKey, sortDir }: { filter: Filter; sortKey: SortKey; sortDir: SortDir }) => {
  const { data: stocks, isLoading: stocksLoading, error: stocksError } = useStocks()
  const { data: ranking, isLoading: rankingLoading } = useRanking({ category: '토스증권 거래대금', market: 'kr' })

  const filtered = useMemo(() => {
    // 모니터링 종목
    const list: StockQuote[] = stocks ? [...stocks] : []
    const codes = new Set(list.map((s) => s.code))

    // 랭킹 종목을 StockQuote 형태로 변환하여 합산 (중복 제외)
    if (ranking?.items) {
      for (const item of ranking.items) {
        // 랭킹 코드는 KR:005930 또는 005930 등 다양한 형태
        const rawCode = item.code.replace(/^[A-Z]+:/, '')
        const tossCode = `A${rawCode}`
        if (codes.has(tossCode) || codes.has(rawCode) || codes.has(item.code)) continue

        const change = item.price - item.basePrice
        list.push({
          code: tossCode,
          name: item.name,
          price: item.price,
          basePrice: item.basePrice,
          change,
          changePercent: item.changePercent,
          changeType: item.changeType,
          volume: item.volume,
          lastUpdated: '',
        })
      }
    }

    // 필터
    let result = list
    if (filter === 'etf') result = result.filter((s) => isETF(s.name))
    if (filter === 'low') result = result.filter((s) => s.price <= 5000)
    if (filter === 'mid') result = result.filter((s) => s.price <= 10000)

    // 정렬
    result.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'price') cmp = a.price - b.price
      else if (sortKey === 'change') cmp = a.changePercent - b.changePercent
      else cmp = a.name.localeCompare(b.name)
      return sortDir === 'desc' ? -cmp : cmp
    })

    return result
  }, [stocks, ranking, filter, sortKey, sortDir])

  if (stocksError) return <p className="py-8 text-center text-sm text-destructive">주식 데이터를 불러오지 못했습니다.</p>
  if (stocksLoading && rankingLoading) return <LoadingSkeleton count={8} />

  return (
    <div className="max-h-[480px] divide-y divide-white/[0.03] overflow-y-auto">
      {filtered.map((stock) => <StockRow key={stock.code} stock={stock} />)}
      {filtered.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">해당 조건의 종목이 없습니다.</p>}
    </div>
  )
}

/** 미국 주식 컨텐츠 (토스 랭킹 market=us) */
const UsStockContent = ({ sortKey, sortDir }: { sortKey: SortKey; sortDir: SortDir }) => {
  const { data, isLoading, error } = useRanking({ category: '토스증권 거래대금', market: 'us' })

  const sorted = useMemo(() => {
    if (!data?.items) return []
    const list = [...data.items]
    list.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'price') cmp = a.price - b.price
      else if (sortKey === 'change') cmp = a.changePercent - b.changePercent
      else cmp = a.name.localeCompare(b.name)
      return sortDir === 'desc' ? -cmp : cmp
    })
    return list
  }, [data, sortKey, sortDir])

  if (error) return <p className="py-8 text-center text-sm text-destructive">미국 주식 데이터를 불러오지 못했습니다.</p>
  if (isLoading) return <LoadingSkeleton count={10} />

  return (
    <div className="max-h-[480px] divide-y divide-white/[0.03] overflow-y-auto">
      {sorted.map((item) => <UsStockRow key={item.code} item={item} />)}
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

/** 정렬 버튼 */
const SortButton = ({ label, active, dir, onClick }: { label: string; active: boolean; dir: SortDir; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={`text-xs transition-colors ${active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
  >
    {label} {active && (dir === 'asc' ? '↑' : '↓')}
  </button>
)

const StockTable = () => {
  const [tab, setTab] = useState<'kr' | 'us'>('kr')
  const [filter, setFilter] = useState<Filter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'name' ? 'asc' : 'desc')
    }
  }

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
              onClick={() => { setTab(t.value); setFilter('all') }}
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

      {/* 필터 (국내만) */}
      {tab === 'kr' && (
        <div className="flex gap-1.5 border-b border-white/[0.04] px-6 py-2">
          {([
            { value: 'all' as const, label: '전체' },
            { value: 'etf' as const, label: 'ETF/인버스' },
            { value: 'low' as const, label: '5천원 이하' },
            { value: 'mid' as const, label: '1만원 이하' },
          ]).map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all ${
                filter === f.value
                  ? 'bg-violet-500/20 text-violet-400'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* 컬럼 헤더 (정렬) */}
      <div className="flex items-center justify-between border-b border-white/[0.04] px-4 py-2 text-xs text-muted-foreground">
        <span className="flex-1">
          <SortButton label="종목명" active={sortKey === 'name'} dir={sortDir} onClick={() => toggleSort('name')} />
        </span>
        <div className="flex items-center gap-4 text-right">
          <span className="w-28">
            <SortButton label="현재가" active={sortKey === 'price'} dir={sortDir} onClick={() => toggleSort('price')} />
          </span>
          <span className="w-20">
            <SortButton label="등락률" active={sortKey === 'change'} dir={sortDir} onClick={() => toggleSort('change')} />
          </span>
          <span className="hidden w-24 sm:block">{tab === 'kr' ? '전일대비' : '거래대금'}</span>
          {tab === 'kr' && <span className="hidden w-16 lg:block">거래량</span>}
        </div>
      </div>

      {/* 컨텐츠 */}
      <div className="p-2">
        {tab === 'kr'
          ? <KrStockContent filter={filter} sortKey={sortKey} sortDir={sortDir} />
          : <UsStockContent sortKey={sortKey} sortDir={sortDir} />
        }
      </div>
    </div>
  )
}

export default StockTable
