'use client'

// 매매 로그 — 날짜별 그룹 + 최신순 정렬
import useAutoTradeStore from '@/store/auto-trade-store'
import { useMemo } from 'react'

const formatDate = (iso: string) => {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${y}.${m}.${dd} (${days[d.getDay()]})`
}

const formatTime = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

const getDateKey = (iso: string) => new Date(iso).toISOString().slice(0, 10)

const TradeLog = () => {
  const { logs } = useAutoTradeStore()

  // 최신순 정렬 + 날짜별 그룹핑
  const grouped = useMemo(() => {
    const sorted = [...logs].sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )

    const groups: { date: string; label: string; items: typeof sorted }[] = []
    let currentDate = ''

    for (const log of sorted) {
      const dateKey = getDateKey(log.timestamp)
      if (dateKey !== currentDate) {
        currentDate = dateKey
        groups.push({ date: dateKey, label: formatDate(log.timestamp), items: [] })
      }
      groups[groups.length - 1].items.push(log)
    }

    return groups
  }, [logs])

  // 오늘 날짜
  const today = getDateKey(new Date().toISOString())

  return (
    <div className="glass rounded-2xl">
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-6 py-4">
        <div className="h-5 w-1 rounded-full bg-gradient-to-b from-cyan-400 to-blue-500" />
        <h3 className="font-semibold">매매 로그</h3>
        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-muted-foreground">
          {logs.length}건
        </span>
      </div>

      <div className="max-h-[600px] overflow-y-auto p-2">
        {logs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            아직 매매 기록이 없습니다.
          </p>
        ) : (
          grouped.map((group) => (
            <div key={group.date}>
              {/* 날짜 구분 헤더 */}
              <div className="sticky top-0 z-10 flex items-center gap-2 bg-background/80 px-4 py-2 backdrop-blur-sm">
                <div className="h-px flex-1 bg-white/[0.06]" />
                <span className="text-[11px] font-medium text-muted-foreground">
                  {group.date === today ? `오늘 — ${group.label}` : group.label}
                </span>
                <span className="rounded-full bg-white/[0.05] px-1.5 py-0.5 text-[9px] text-muted-foreground">
                  {group.items.length}건
                </span>
                <div className="h-px flex-1 bg-white/[0.06]" />
              </div>

              {/* 해당 날짜의 로그들 */}
              <div className="divide-y divide-white/[0.03]">
                {group.items.map((log) => (
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
                        {formatTime(log.timestamp)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default TradeLog
