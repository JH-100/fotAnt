'use client'

// 매매 로그
import useAutoTradeStore from '@/store/auto-trade-store'

const TradeLog = () => {
  const { logs } = useAutoTradeStore()

  return (
    <div className="glass rounded-2xl">
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-6 py-4">
        <div className="h-5 w-1 rounded-full bg-gradient-to-b from-cyan-400 to-blue-500" />
        <h3 className="font-semibold">매매 로그</h3>
        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-muted-foreground">
          {logs.length}건
        </span>
      </div>

      <div className="max-h-[480px] overflow-y-auto p-2">
        {logs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            아직 매매 기록이 없습니다.
          </p>
        ) : (
          <div className="divide-y divide-white/[0.03]">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-3 px-4 py-3">
                {/* 상태 아이콘 */}
                <div
                  className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                    log.result === 'success' ? 'bg-emerald-400' : 'bg-rose-400'
                  }`}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        log.action === 'BUY'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-rose-500/20 text-rose-400'
                      }`}
                    >
                      {log.action === 'BUY' ? '매수' : '매도'}
                    </span>
                    <span className="text-sm font-medium">{log.name}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{log.code}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{log.reason}</p>
                  {log.message && (
                    <p className={`mt-0.5 text-[10px] ${log.result === 'success' ? 'text-emerald-400/70' : 'text-rose-400/70'}`}>
                      {log.message}
                    </p>
                  )}
                </div>

                <div className="shrink-0 text-right">
                  <p className="font-mono text-xs">{log.quantity}주</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {log.price.toLocaleString()}원
                  </p>
                  <p className="text-[9px] text-muted-foreground">
                    {new Date(log.timestamp).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })} {new Date(log.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default TradeLog
