'use client'

// 자율 스캘핑 제어판
import AutoTradeControl from '@/components/auto-trade/AutoTradeControl'
import SafetyConfig from '@/components/auto-trade/SafetyConfig'
import ScanResults from '@/components/auto-trade/ScanResults'
import TradeLog from '@/components/auto-trade/TradeLog'

const AutoTradePage = () => {
  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-2">
        <h1 className="bg-gradient-to-r from-orange-400 via-rose-400 to-violet-400 bg-clip-text text-4xl font-bold tracking-tight text-transparent">
          자율 스캘핑
        </h1>
        <p className="text-sm text-muted-foreground">
          AI가 종목을 탐색하고 자동으로 매수/매도 · 익절/손절 자동 관리
        </p>
      </header>

      {/* 제어 + 설정 */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <AutoTradeControl />
        </div>
        <div className="lg:col-span-2">
          <SafetyConfig />
        </div>
      </div>

      {/* 스캔 결과 + 매매 로그 */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ScanResults />
        <TradeLog />
      </div>
    </div>
  )
}

export default AutoTradePage
