'use client'

// 주문 폼 — 실전/모의 모드 + 비밀번호 보호
import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import useTrade from '@/hooks/use-trade'
import useTradingStore from '@/store/trading-store'
import useStocks from '@/hooks/use-stocks'
import useRanking from '@/hooks/use-ranking'
import type { KisOrderRequest } from '@/types/kis'

const OrderForm = ({ mode = 'real' }: { mode?: 'real' | 'mock' }) => {
  const searchParams = useSearchParams()
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [code, setCode] = useState('')
  const [stockName, setStockName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'pre-market' | 'after-close' | 'after-hours'>('market')
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [password, setPassword] = useState('')
  const [showPasswordInput, setShowPasswordInput] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  const trade = useTrade(mode)
  const { openConfirm, isConfirmOpen, pendingOrder, closeConfirm } = useTradingStore()

  const { data: stocks } = useStocks()
  const { data: ranking } = useRanking({ category: '토스증권 거래대금', market: 'kr' })

  // URL 파라미터에서 종목코드
  useEffect(() => {
    const paramCode = searchParams.get('code')
    const paramName = searchParams.get('name')
    if (paramCode) {
      setCode(paramCode)
      if (paramName) setStockName(paramName)
    }
  }, [searchParams])

  // 검색 외부 클릭 닫기
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearch(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // 결과 메시지 5초 후 리셋
  useEffect(() => {
    if (trade.isSuccess || trade.isError) {
      const timer = setTimeout(() => trade.reset(), 5000)
      return () => clearTimeout(timer)
    }
  }, [trade.isSuccess, trade.isError, trade])

  // 검색 결과
  const searchResults = (() => {
    const items: { code: string; name: string; price: number }[] = []
    stocks?.forEach((s) => items.push({ code: s.code, name: s.name, price: s.price }))
    ranking?.items.forEach((r) => {
      if (!items.find((i) => i.code === r.code)) {
        items.push({ code: r.code, name: r.name, price: r.price })
      }
    })
    if (!searchQuery) return items.slice(0, 10)
    const q = searchQuery.toLowerCase()
    return items.filter(
      (i) => i.name.toLowerCase().includes(q) || i.code.includes(q)
    ).slice(0, 10)
  })()

  const selectStock = (stockCode: string, name: string) => {
    setCode(stockCode)
    setStockName(name)
    setSearchQuery('')
    setShowSearch(false)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!code || !quantity) return
    trade.reset()

    const order: KisOrderRequest = {
      side,
      code,
      quantity: parseInt(quantity, 10),
      price: (orderType === 'limit' || orderType === 'after-hours') ? parseInt(price, 10) : undefined,
      orderType,
    }

    // 실전투자는 비밀번호 필요 → 확인 다이얼로그에서 입력
    openConfirm(order)
    if (mode === 'real') setShowPasswordInput(true)
  }

  const handleConfirm = () => {
    if (!pendingOrder) return
    trade.mutate({ order: pendingOrder, mode, password: mode === 'real' ? password : undefined })
    closeConfirm()
    setShowPasswordInput(false)
    setPassword('')
  }

  const handleCancelConfirm = () => {
    closeConfirm()
    setShowPasswordInput(false)
    setPassword('')
  }

  const isReal = mode === 'real'

  return (
    <>
      <div className="glass rounded-2xl p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className={`h-5 w-1 rounded-full bg-gradient-to-b ${
            isReal ? 'from-emerald-400 to-blue-500' : 'from-amber-400 to-orange-500'
          }`} />
          <h3 className="font-semibold">주문</h3>
          {isReal && (
            <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-medium text-rose-400">
              🔒 비밀번호 필요
            </span>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 매수/매도 토글 */}
          <div className="flex gap-1 rounded-xl bg-white/[0.03] p-1">
            <button
              type="button"
              onClick={() => setSide('buy')}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
                side === 'buy' ? 'bg-emerald-500/20 text-emerald-400' : 'text-muted-foreground'
              }`}
            >
              매수
            </button>
            <button
              type="button"
              onClick={() => setSide('sell')}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
                side === 'sell' ? 'bg-rose-500/20 text-rose-400' : 'text-muted-foreground'
              }`}
            >
              매도
            </button>
          </div>

          {/* 종목 검색 */}
          <div ref={searchRef} className="relative">
            <label className="mb-1 block text-xs text-muted-foreground">종목</label>
            <div
              onClick={() => setShowSearch(true)}
              className={`flex items-center gap-2 rounded-lg border bg-white/[0.03] px-3 py-2 transition-colors ${
                showSearch ? 'border-white/20' : 'border-white/10'
              }`}
            >
              {code && !showSearch ? (
                <div className="flex flex-1 items-center justify-between">
                  <span className="text-sm">
                    {stockName || code}
                    <span className="ml-2 font-mono text-[10px] text-muted-foreground">{code}</span>
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setCode('')
                      setStockName('')
                      setShowSearch(true)
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <input
                  type="text"
                  value={showSearch ? searchQuery : ''}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setShowSearch(true)}
                  placeholder="종목명 또는 코드 검색"
                  className="flex-1 bg-transparent text-sm outline-none"
                />
              )}
            </div>

            {showSearch && (
              <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-[oklch(0.15_0.02_270)] shadow-xl backdrop-blur-xl">
                {searchResults.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-muted-foreground">결과 없음</p>
                ) : (
                  searchResults.map((item) => (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => selectStock(item.code, item.name)}
                      className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-white/[0.06]"
                    >
                      <div>
                        <span className="text-sm font-medium">{item.name}</span>
                        <span className="ml-2 font-mono text-[10px] text-muted-foreground">{item.code}</span>
                      </div>
                      <span className="font-mono text-xs text-muted-foreground">
                        {new Intl.NumberFormat('ko-KR').format(item.price)}원
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* 주문유형 — 정규장 */}
          <div>
            <label className="mb-1 block text-[10px] text-muted-foreground">정규장 (09:00~15:30)</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: 'market' as const, label: '시장가' },
                { value: 'limit' as const, label: '지정가' },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setOrderType(opt.value)}
                  className={`rounded-lg border py-1.5 text-center text-xs font-medium transition-all ${
                    orderType === opt.value ? 'border-white/20 bg-white/10' : 'border-white/5 text-muted-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 주문유형 — 시간외 */}
          <div>
            <label className="mb-1 block text-[10px] text-muted-foreground">시간외</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: 'pre-market' as const, label: '장전시간외', desc: '08:20~08:40' },
                { value: 'after-close' as const, label: '시간외종가', desc: '15:40~16:00' },
                { value: 'after-hours' as const, label: '시간외단일가', desc: '16:00~18:00' },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setOrderType(opt.value)}
                  className={`rounded-lg border py-1.5 text-center transition-all ${
                    orderType === opt.value ? 'border-white/20 bg-white/10' : 'border-white/5 text-muted-foreground'
                  }`}
                >
                  <span className="block text-[11px] font-medium">{opt.label}</span>
                  <span className="block text-[9px] text-muted-foreground">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 수량 */}
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">수량</label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="1"
              min="1"
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-sm outline-none transition-colors focus:border-white/20"
            />
          </div>

          {/* 가격 (지정가 또는 시간외단일가) */}
          {(orderType === 'limit' || orderType === 'after-hours') && (
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">가격</label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="70000"
                min="1"
                className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-sm outline-none transition-colors focus:border-white/20"
              />
            </div>
          )}

          {/* 주문 버튼 */}
          <button
            type="submit"
            disabled={!code || !quantity || trade.isPending}
            className={`w-full rounded-xl py-3 text-sm font-semibold transition-all disabled:opacity-40 ${
              side === 'buy'
                ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                : 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
            }`}
          >
            {trade.isPending ? '주문 중...' : side === 'buy' ? '매수 주문' : '매도 주문'}
          </button>

          {/* 결과 메시지 */}
          {trade.isSuccess && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2">
              <span className="text-xs">✓</span>
              <p className="text-xs text-emerald-400">
                주문 완료: {trade.data?.message}
              </p>
            </div>
          )}
          {trade.isError && (
            <div className="flex items-center gap-2 rounded-lg bg-rose-500/10 px-3 py-2">
              <span className="text-xs">✕</span>
              <p className="text-xs text-rose-400">
                주문 실패: {trade.error?.message}
              </p>
            </div>
          )}
        </form>
      </div>

      {/* 주문 확인 다이얼로그 */}
      {isConfirmOpen && pendingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="glass mx-4 w-full max-w-sm rounded-2xl p-6">
            <h3 className="mb-4 text-lg font-semibold">주문 확인</h3>
            <div className="mb-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">모드</span>
                <span className={isReal ? 'text-emerald-400' : 'text-amber-400'}>
                  {isReal ? '실전투자' : '모의투자'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">구분</span>
                <span className={pendingOrder.side === 'buy' ? 'text-emerald-400' : 'text-rose-400'}>
                  {pendingOrder.side === 'buy' ? '매수' : '매도'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">종목</span>
                <span>
                  {stockName && <span className="mr-1">{stockName}</span>}
                  <span className="font-mono text-xs text-muted-foreground">{pendingOrder.code}</span>
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">수량</span>
                <span className="font-mono">{pendingOrder.quantity}주</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">유형</span>
                <span>{
                  pendingOrder.orderType === 'market' ? '시장가' :
                  pendingOrder.orderType === 'limit' ? `지정가 ${pendingOrder.price?.toLocaleString()}원` :
                  pendingOrder.orderType === 'pre-market' ? '장전시간외 (08:20~08:40)' :
                  pendingOrder.orderType === 'after-close' ? '시간외종가 (15:40~16:00)' :
                  `시간외단일가 ${pendingOrder.price?.toLocaleString()}원 (16:00~18:00)`
                }</span>
              </div>
            </div>

            {/* 실전투자 비밀번호 입력 */}
            {isReal && showPasswordInput && (
              <div className="mb-4">
                <label className="mb-1 block text-xs text-muted-foreground">
                  실전투자 비밀번호
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호 입력"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && password) {
                      e.preventDefault()
                      handleConfirm()
                    }
                  }}
                  className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm outline-none transition-colors focus:border-rose-400/50"
                />
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleCancelConfirm}
                className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-medium transition-colors hover:bg-white/[0.05]"
              >
                취소
              </button>
              <button
                onClick={handleConfirm}
                disabled={isReal && !password}
                className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all disabled:opacity-40 ${
                  pendingOrder.side === 'buy'
                    ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
                }`}
              >
                {isReal ? '🔒 주문 실행' : '주문 실행'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default OrderForm
