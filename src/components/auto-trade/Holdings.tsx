'use client'

// 보유종목 현황 — 산가격, 수량, 총금액, 수익률 표시
import { useCallback, useEffect, useState } from 'react'

interface Holding {
  code: string
  name: string
  quantity: number
  avgPrice: number
  currentPrice: number
  profitLoss: number
  profitLossPercent: number
  evalAmount: number
  totalInvested: number
}

const Holdings = () => {
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [loading, setLoading] = useState(true)

  const fetchHoldings = useCallback(async () => {
    try {
      const res = await fetch('/api/auto-trade')
      const data = await res.json()
      if (data.holdings) {
        setHoldings(data.holdings)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchHoldings()
    const id = setInterval(fetchHoldings, 10_000) // 10초 폴링
    return () => clearInterval(id)
  }, [fetchHoldings])

  const totalInvested = holdings.reduce((s, h) => s + h.totalInvested, 0)
  const totalEval = holdings.reduce((s, h) => s + h.evalAmount, 0)
  const totalPnL = holdings.reduce((s, h) => s + h.profitLoss, 0)
  const totalPnLPercent = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0

  return (
    <div className="glass rounded-2xl">
      {/* 헤더 */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="h-5 w-1 rounded-full bg-gradient-to-b from-emerald-400 to-teal-500" />
          <h3 className="font-semibold">보유종목</h3>
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-muted-foreground">
            {holdings.length}종목
          </span>
        </div>
        {holdings.length > 0 && (
          <div className="text-right">
            <p className={`font-mono text-sm font-bold ${totalPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {totalPnL >= 0 ? '+' : ''}{totalPnL.toLocaleString()}원
              <span className="ml-1 text-[10px] font-normal">
                ({totalPnLPercent >= 0 ? '+' : ''}{totalPnLPercent.toFixed(2)}%)
              </span>
            </p>
            <p className="font-mono text-[10px] text-muted-foreground">
              평가 {totalEval.toLocaleString()}원 / 매입 {totalInvested.toLocaleString()}원
            </p>
          </div>
        )}
      </div>

      {/* 종목 리스트 */}
      <div className="max-h-[400px] overflow-y-auto">
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">불러오는 중...</p>
        ) : holdings.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            보유종목이 없습니다
          </p>
        ) : (
          <div className="divide-y divide-white/[0.03]">
            {holdings.map((h) => (
              <div key={h.code} className="px-6 py-3">
                {/* 상단: 종목명 + 손익 */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{h.name}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{h.code}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`font-mono text-sm font-bold ${h.profitLoss >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {h.profitLoss >= 0 ? '+' : ''}{h.profitLoss.toLocaleString()}원
                    </span>
                    <span className={`ml-1 font-mono text-[10px] ${h.profitLoss >= 0 ? 'text-emerald-400/70' : 'text-rose-400/70'}`}>
                      ({h.profitLossPercent >= 0 ? '+' : ''}{h.profitLossPercent.toFixed(2)}%)
                    </span>
                  </div>
                </div>

                {/* 하단: 매수단가 / 현재가 / 수량 / 금액 */}
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[10px]">
                  <span className="text-muted-foreground">
                    매수 <span className="font-mono text-white/70">{h.avgPrice.toLocaleString()}원</span>
                  </span>
                  <span className="text-muted-foreground">
                    현재 <span className={`font-mono ${h.profitLoss >= 0 ? 'text-emerald-400/80' : 'text-rose-400/80'}`}>{h.currentPrice.toLocaleString()}원</span>
                  </span>
                  <span className="text-muted-foreground">
                    수량 <span className="font-mono text-white/70">{h.quantity}주</span>
                  </span>
                  <span className="text-muted-foreground">
                    매입금 <span className="font-mono text-white/70">{h.totalInvested.toLocaleString()}원</span>
                  </span>
                  <span className="text-muted-foreground">
                    평가금 <span className="font-mono text-white/70">{h.evalAmount.toLocaleString()}원</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Holdings
