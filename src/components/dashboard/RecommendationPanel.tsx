'use client'

// 주식 추천 패널
import { Skeleton } from '@/components/ui/skeleton'
import useRecommendations from '@/hooks/use-recommendations'
import type { StockRecommendation } from '@/types/kis'

const SignalBadge = ({ signal }: { signal: 'BUY' | 'SELL' | 'HOLD' }) => {
  const styles = {
    BUY: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    SELL: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
    HOLD: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  }
  const labels = { BUY: '매수', SELL: '매도', HOLD: '관망' }

  return (
    <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${styles[signal]}`}>
      {labels[signal]}
    </span>
  )
}

const ConfidenceBar = ({ value }: { value: number }) => (
  <div className="flex items-center gap-2">
    <div className="h-1.5 flex-1 rounded-full bg-white/[0.06]">
      <div
        className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all"
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
    <span className="font-mono text-[10px] text-muted-foreground">{value}%</span>
  </div>
)

const RecommendationRow = ({ rec }: { rec: StockRecommendation }) => {
  const formatMoney = (v: number) => new Intl.NumberFormat('ko-KR').format(v) + '원'

  return (
    <div className="rounded-xl px-4 py-3 transition-colors hover:bg-white/[0.03]">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium">{rec.name}</p>
            <SignalBadge signal={rec.overallSignal} />
          </div>
          <p className="text-xs text-muted-foreground">
            {rec.code} · {formatMoney(rec.currentPrice)}
          </p>
        </div>
        <div className="w-28">
          <ConfidenceBar value={rec.confidence} />
        </div>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{rec.summary}</p>
      <div className="mt-2 flex gap-1">
        {rec.signals.map((sig) => (
          <span
            key={sig.indicator}
            className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
              sig.signal === 'BUY'
                ? 'bg-emerald-500/10 text-emerald-400'
                : sig.signal === 'SELL'
                  ? 'bg-rose-500/10 text-rose-400'
                  : 'bg-white/[0.05] text-muted-foreground'
            }`}
          >
            {sig.indicator} {sig.value}
          </span>
        ))}
      </div>
    </div>
  )
}

const RecommendationPanel = () => {
  const { data: recommendations, isLoading, error } = useRecommendations()

  return (
    <div className="glass rounded-2xl">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="h-5 w-1 rounded-full bg-gradient-to-b from-amber-400 to-orange-500" />
          <h3 className="font-semibold">AI 추천</h3>
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-muted-foreground">
            5분 갱신
          </span>
        </div>
      </div>

      <div className="p-2">
        {isLoading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            KIS API 연결 후 추천 데이터를 확인할 수 있습니다.
          </p>
        ) : !recommendations || recommendations.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            추천 데이터가 없습니다.
          </p>
        ) : (
          <div className="divide-y divide-white/[0.03]">
            {recommendations.map((rec) => (
              <RecommendationRow key={rec.code} rec={rec} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default RecommendationPanel
