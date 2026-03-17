'use client'

// 전략 선택
import useAutoTradeStore from '@/store/auto-trade-store'

const strategies = [
  {
    key: 'rsi',
    name: 'RSI 역추세',
    desc: 'RSI 30↓ 매수, 70↑ 매도',
    color: 'from-blue-400 to-cyan-400',
  },
  {
    key: 'macd',
    name: 'MACD 교차',
    desc: '히스토그램 부호 전환 매매',
    color: 'from-violet-400 to-purple-400',
  },
  {
    key: 'momentum',
    name: '모멘텀',
    desc: '골든크로스 + 거래량 급증',
    color: 'from-amber-400 to-orange-400',
  },
]

const StrategySelector = () => {
  const { strategy, setStrategy, isRunning } = useAutoTradeStore()

  return (
    <div className="glass rounded-2xl p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="h-5 w-1 rounded-full bg-gradient-to-b from-violet-400 to-purple-500" />
        <h3 className="font-semibold">전략</h3>
      </div>

      <div className="space-y-2">
        {strategies.map((s) => (
          <button
            key={s.key}
            onClick={() => !isRunning && setStrategy(s.key)}
            disabled={isRunning}
            className={`w-full rounded-xl border p-3 text-left transition-all ${
              strategy === s.key
                ? 'border-white/20 bg-white/[0.08]'
                : 'border-white/5 hover:border-white/10 hover:bg-white/[0.03]'
            } disabled:opacity-50`}
          >
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full bg-gradient-to-r ${s.color}`} />
              <span className="text-sm font-medium">{s.name}</span>
            </div>
            <p className="mt-1 pl-4 text-[11px] text-muted-foreground">{s.desc}</p>
          </button>
        ))}
      </div>

      {isRunning && (
        <p className="mt-3 text-center text-[10px] text-muted-foreground">
          실행 중에는 전략을 변경할 수 없습니다
        </p>
      )}
    </div>
  )
}

export default StrategySelector
