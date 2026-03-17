'use client'

// 자동매매 제어판 페이지
import AutoTradeControl from '@/components/auto-trade/AutoTradeControl'
import StrategySelector from '@/components/auto-trade/StrategySelector'
import SafetyConfig from '@/components/auto-trade/SafetyConfig'
import TradeLog from '@/components/auto-trade/TradeLog'

const AutoTradePage = () => {
  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-2">
        <h1 className="bg-gradient-to-r from-orange-400 via-rose-400 to-violet-400 bg-clip-text text-4xl font-bold tracking-tight text-transparent">
          자동매매
        </h1>
        <p className="text-sm text-muted-foreground">
          기술지표 기반 전략 · 안전장치 내장 · 자동 실행
        </p>
      </header>

      {/* 제어 + 전략 */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <AutoTradeControl />
          <StrategySelector />
        </div>
        <div className="lg:col-span-2">
          <SafetyConfig />
        </div>
      </div>

      {/* 매매 로그 */}
      <TradeLog />
    </div>
  )
}

export default AutoTradePage
