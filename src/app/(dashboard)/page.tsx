'use client'

// 대시보드 메인 — 실전/모의 탭 + 모니터링 통합
import { Suspense } from 'react'
import ExchangeRateCard from '@/components/dashboard/ExchangeRateCard'
import StockTable from '@/components/dashboard/StockTable'
import RankingTable from '@/components/dashboard/RankingTable'
import RecommendationPanel from '@/components/dashboard/RecommendationPanel'
import BalanceCard from '@/components/trading/BalanceCard'
import OrderForm from '@/components/trading/OrderForm'
import PositionsTable from '@/components/trading/PositionsTable'
import useTradingStore from '@/store/trading-store'

const DashboardPage = () => {
  const { mode, setMode } = useTradingStore()

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-8 sm:px-6 lg:px-8">
      {/* 헤더 */}
      <header className="space-y-2">
        <h1 className="bg-gradient-to-r from-blue-400 via-violet-400 to-emerald-400 bg-clip-text text-4xl font-bold tracking-tight text-transparent">
          주식자동화
        </h1>
        <p className="text-sm text-muted-foreground">
          실시간 환율 · 국내주식 · KIS 거래량 랭킹 모니터링
        </p>
      </header>

      {/* 실전/모의 모드 탭 */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setMode('real')}
          className={`rounded-full px-5 py-2 text-sm font-medium transition-all ${
            mode === 'real'
              ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.05]'
          }`}
        >
          실전투자
        </button>
        <button
          onClick={() => setMode('mock')}
          className={`rounded-full px-5 py-2 text-sm font-medium transition-all ${
            mode === 'mock'
              ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.05]'
          }`}
        >
          모의투자
        </button>
        <span className="ml-2 text-[10px] text-muted-foreground">
          {mode === 'real' ? '🔒 실전 주문은 비밀번호 필요' : '자유롭게 연습하세요'}
        </span>
      </div>

      {/* 잔고 + 주문폼 */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <BalanceCard mode={mode} />
          <PositionsTable mode={mode} />
        </div>
        <div>
          <Suspense>
            <OrderForm mode={mode} />
          </Suspense>
        </div>
      </div>

      {/* 환율 섹션 */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-5 w-1 rounded-full bg-gradient-to-b from-blue-400 to-violet-500" />
          <h2 className="text-lg font-semibold">환율</h2>
        </div>
        <ExchangeRateCard />
      </section>

      {/* 국내 주식 + 랭킹 */}
      <div className="grid gap-6 xl:grid-cols-2">
        <section>
          <StockTable />
        </section>
        <section>
          <RankingTable />
        </section>
      </div>

      {/* AI 추천 */}
      <section>
        <RecommendationPanel />
      </section>
    </div>
  )
}

export default DashboardPage
