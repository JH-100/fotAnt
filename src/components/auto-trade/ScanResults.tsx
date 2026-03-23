'use client'

// 스캔 결과 — 봇이 탐색한 종목 + 동적 익절/손절
import useAutoTradeStore from '@/store/auto-trade-store'

const ScanResults = () => {
  const { scanResults, selectedChartCode, setSelectedChartCode } = useAutoTradeStore()

  return (
    <div className="glass rounded-2xl">
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-6 py-4">
        <div className="h-5 w-1 rounded-full bg-gradient-to-b from-violet-400 to-purple-500" />
        <h3 className="font-semibold">봇 탐색 결과</h3>
        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-muted-foreground">
          {scanResults.length}종목
        </span>
      </div>

      <div className="max-h-[500px] overflow-y-auto p-2">
        {scanResults.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            스캘핑을 시작하면 봇이 자동으로 종목을 탐색합니다
          </p>
        ) : (
          <div className="divide-y divide-white/[0.03]">
            {scanResults.map((item) => (
              <div
                key={item.code}
                className={`cursor-pointer px-4 py-3 transition-colors hover:bg-white/[0.03] ${
                  selectedChartCode === item.code ? 'bg-blue-500/10 ring-1 ring-blue-500/20' : ''
                }`}
                onClick={() => setSelectedChartCode(selectedChartCode === item.code ? null : item.code)}
              >
                <div className="flex items-start gap-3">
                  {/* 신호 뱃지 */}
                  <div className="mt-0.5 shrink-0">
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        item.signal === 'BUY'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : item.signal === 'SELL'
                            ? 'bg-rose-500/20 text-rose-400'
                            : 'bg-white/10 text-muted-foreground'
                      }`}
                    >
                      {item.signal === 'BUY' ? '매수' : item.signal === 'SELL' ? '매도' : '관망'}
                    </span>
                  </div>

                  {/* 종목 정보 */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{item.name}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{item.code}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {item.reasons.map((r, i) => (
                        <span key={i} className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[9px] text-muted-foreground">
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* 점수 + 가격 */}
                  <div className="shrink-0 text-right">
                    <div className={`font-mono text-sm font-bold ${
                      item.score > 0 ? 'text-emerald-400' : item.score < 0 ? 'text-rose-400' : 'text-muted-foreground'
                    }`}>
                      {item.score > 0 ? '+' : ''}{item.score}
                    </div>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {item.price.toLocaleString()}원
                    </p>
                    <p className={`font-mono text-[10px] ${
                      item.change > 0 ? 'text-emerald-400' : item.change < 0 ? 'text-rose-400' : 'text-muted-foreground'
                    }`}>
                      {item.change > 0 ? '+' : ''}{item.change.toFixed(1)}%
                    </p>
                  </div>
                </div>

                {/* 봇 판단 — 익절/손절/변동성 */}
                {item.signal === 'BUY' && (
                  <div className="mt-2 flex items-center gap-3 pl-7 text-[9px]">
                    <span className="text-muted-foreground">RSI {item.rsi.toFixed(0)}</span>
                    <span className="text-muted-foreground">변동성 {item.atrPercent.toFixed(1)}%</span>
                    <span className="text-emerald-400">🎯 익절 +{item.takeProfitPercent}%</span>
                    <span className="text-rose-400">🛑 손절 -{item.stopLossPercent}%</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default ScanResults
