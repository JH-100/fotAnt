'use client'

// 안전 설정 패널
import useAutoTradeStore from '@/store/auto-trade-store'

const SafetyConfigPanel = () => {
  const { safety, setSafety, isRunning, targetStocks, setTargetStocks } = useAutoTradeStore()

  const configs = [
    {
      label: '건당 투자금액',
      key: 'investPerTrade' as const,
      value: safety.investPerTrade,
      suffix: '원',
      step: 50000,
      min: 10000,
      max: 10_000_000,
      format: (v: number) => v.toLocaleString() + '원',
    },
    {
      label: '포지션 한도',
      key: 'maxPositionPercent' as const,
      value: safety.maxPositionPercent,
      suffix: '%',
      step: 5,
      min: 5,
      max: 50,
      format: (v: number) => v + '%',
    },
    {
      label: '일일 손실 한도',
      key: 'maxDailyLossPercent' as const,
      value: safety.maxDailyLossPercent,
      suffix: '%',
      step: 1,
      min: 1,
      max: 10,
      format: (v: number) => v + '%',
    },
    {
      label: '손절선',
      key: 'stopLossPercent' as const,
      value: safety.stopLossPercent,
      suffix: '%',
      step: 1,
      min: 1,
      max: 20,
      format: (v: number) => '-' + v + '%',
    },
    {
      label: '일일 최대 주문',
      key: 'maxDailyOrders' as const,
      value: safety.maxDailyOrders,
      suffix: '회',
      step: 1,
      min: 1,
      max: 50,
      format: (v: number) => v + '회',
    },
  ]

  const handleRemoveStock = (code: string) => {
    setTargetStocks(targetStocks.filter((s) => s.code !== code))
  }

  const handleAddStock = () => {
    const code = prompt('종목코드 입력 (예: 005930)')
    const name = code ? prompt('종목명 입력 (예: 삼성전자)') : null
    if (code && name) {
      setTargetStocks([...targetStocks, { code, name }])
    }
  }

  return (
    <div className="glass rounded-2xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="h-5 w-1 rounded-full bg-gradient-to-b from-rose-400 to-orange-500" />
        <h3 className="font-semibold">안전 설정</h3>
      </div>

      {/* 안전 파라미터 */}
      <div className="space-y-4">
        {configs.map((c) => (
          <div key={c.key}>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs text-muted-foreground">{c.label}</label>
              <span className="font-mono text-xs font-medium">{c.format(c.value)}</span>
            </div>
            <input
              type="range"
              min={c.min}
              max={c.max}
              step={c.step}
              value={c.value}
              disabled={isRunning}
              onChange={(e) => setSafety({ [c.key]: Number(e.target.value) })}
              className="w-full accent-violet-500"
            />
          </div>
        ))}
      </div>

      {/* 대상 종목 */}
      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-medium text-muted-foreground">대상 종목</h4>
          <button
            onClick={handleAddStock}
            disabled={isRunning}
            className="rounded-lg border border-white/10 px-2 py-1 text-[10px] transition-colors hover:bg-white/[0.05] disabled:opacity-40"
          >
            + 추가
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {targetStocks.map((s) => (
            <span
              key={s.code}
              className="group flex items-center gap-1 rounded-lg bg-white/[0.06] px-2.5 py-1 text-xs"
            >
              <span className="font-mono text-[10px] text-muted-foreground">{s.code}</span>
              <span>{s.name}</span>
              {!isRunning && (
                <button
                  onClick={() => handleRemoveStock(s.code)}
                  className="ml-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100"
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export default SafetyConfigPanel
