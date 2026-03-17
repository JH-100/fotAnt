'use client'

// 매매 페이지
import BalanceCard from '@/components/trading/BalanceCard'
import PositionsTable from '@/components/trading/PositionsTable'
import OrderForm from '@/components/trading/OrderForm'

const TradingPage = () => {
  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-2">
        <h1 className="bg-gradient-to-r from-emerald-400 via-blue-400 to-violet-400 bg-clip-text text-4xl font-bold tracking-tight text-transparent">
          매매
        </h1>
        <p className="text-sm text-muted-foreground">
          한국투자증권 OpenAPI · 잔고 조회 및 주문 실행
        </p>
      </header>

      {/* 잔고 + 주문폼 */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <BalanceCard />
        </div>
        <div>
          <OrderForm />
        </div>
      </div>

      {/* 보유종목 */}
      <PositionsTable />
    </div>
  )
}

export default TradingPage
