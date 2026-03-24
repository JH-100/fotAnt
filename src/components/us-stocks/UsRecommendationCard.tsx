'use client'

// 미장 추천 종목 카드 — 매수/매도/홀드 시그널 표시

interface UsRecommendation {
  symbol: string
  name: string
  exchange: string
  price: number
  priceKrw: number
  change: number
  score: number
  signal: 'BUY' | 'SELL' | 'HOLD'
  reasons: string[]
  timestamp: string
}

interface Props {
  rec: UsRecommendation
}

const signalStyles: Record<string, { border: string; badge: string; badgeText: string; glow: string }> = {
  BUY: {
    border: 'border-emerald-400/40',
    badge: 'bg-emerald-500/20 text-emerald-400',
    badgeText: 'BUY',
    glow: 'shadow-[0_0_24px_-4px_rgba(52,211,153,0.25)]',
  },
  SELL: {
    border: 'border-rose-400/40',
    badge: 'bg-rose-500/20 text-rose-400',
    badgeText: 'SELL',
    glow: 'shadow-[0_0_24px_-4px_rgba(251,113,133,0.25)]',
  },
  HOLD: {
    border: 'border-white/10',
    badge: 'bg-white/10 text-muted-foreground',
    badgeText: 'HOLD',
    glow: '',
  },
}

const formatTimestamp = (ts: string) => {
  const d = new Date(ts)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${mm}/${dd} ${hh}:${min}`
}

const UsRecommendationCard = ({ rec }: Props) => {
  const style = signalStyles[rec.signal] ?? signalStyles.HOLD

  return (
    <div className={`glass rounded-2xl border p-6 transition-all ${style.border} ${style.glow}`}>
      {/* 상단: 심볼 + 시그널 배지 */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight">{rec.symbol}</span>
            <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {rec.exchange}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{rec.name}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${style.badge}`}>
          {style.badgeText}
        </span>
      </div>

      {/* 가격 정보 */}
      <div className="mb-4 space-y-1">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-2xl font-bold">
            ${rec.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className={`font-mono text-sm font-medium ${
            rec.change >= 0 ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {rec.change >= 0 ? '+' : ''}{rec.change.toFixed(2)}%
          </span>
        </div>
        <p className="font-mono text-xs text-muted-foreground">
          {rec.priceKrw.toLocaleString('ko-KR')}원
        </p>
      </div>

      {/* 스코어 바 */}
      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground">AI Score</span>
          <span className="font-mono font-bold">{rec.score}/100</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className={`h-full rounded-full transition-all ${
              rec.score >= 70 ? 'bg-emerald-400' : rec.score >= 40 ? 'bg-amber-400' : 'bg-rose-400'
            }`}
            style={{ width: `${Math.min(rec.score, 100)}%` }}
          />
        </div>
      </div>

      {/* 근거 태그 */}
      {rec.reasons.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {rec.reasons.map((reason, i) => (
            <span
              key={i}
              className="rounded-md bg-white/[0.04] px-2 py-0.5 text-[10px] text-muted-foreground"
            >
              {reason}
            </span>
          ))}
        </div>
      )}

      {/* 타임스탬프 */}
      <p className="text-right text-[10px] text-muted-foreground/60">
        {formatTimestamp(rec.timestamp)}
      </p>
    </div>
  )
}

export default UsRecommendationCard
