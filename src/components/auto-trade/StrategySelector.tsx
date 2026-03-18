'use client'

// 자율 스캘핑은 분봉 단기 지표 복합 분석 — 참고용 컴포넌트

const StrategySelector = () => {
  return (
    <div className="glass rounded-2xl p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="h-5 w-1 rounded-full bg-gradient-to-b from-violet-400 to-purple-500" />
        <h3 className="font-semibold">분봉 단기 지표</h3>
        <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-medium text-violet-400">
          5분봉 기반
        </span>
      </div>

      <div className="space-y-2">
        {[
          { name: 'RSI(7)', desc: '5분봉 7기간 RSI — 빠른 과매수/과매도 감지', color: 'from-blue-400 to-cyan-400', weight: '±30' },
          { name: '거래량 급등', desc: '직전 3분 vs 평균 20분 거래량 비교', color: 'from-emerald-400 to-green-400', weight: '+30' },
          { name: 'VWAP 괴리', desc: '당일 거래량가중평균가격 대비 위치', color: 'from-amber-400 to-orange-400', weight: '±20' },
          { name: 'MACD(6,13,5)', desc: '단기 MACD 골든/데드크로스', color: 'from-violet-400 to-purple-400', weight: '±20' },
          { name: '눌림목 패턴', desc: '급등 후 소폭 조정 → 재진입 기회', color: 'from-rose-400 to-pink-400', weight: '+20' },
          { name: 'BB(10,1.5)', desc: '5분봉 볼린저밴드 하단/상단 접근', color: 'from-sky-400 to-blue-400', weight: '±15' },
          { name: '체결강도', desc: '매수봉 vs 매도봉 거래량 비율', color: 'from-teal-400 to-emerald-400', weight: '±10' },
          { name: '이평선(3/7)', desc: '5분봉 3봉/7봉 골든/데드크로스', color: 'from-orange-400 to-red-400', weight: '±12' },
        ].map((s) => (
          <div
            key={s.name}
            className="w-full rounded-xl border border-white/10 bg-white/[0.05] p-3 text-left"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full bg-gradient-to-r ${s.color}`} />
                <span className="text-sm font-medium">{s.name}</span>
              </div>
              <span className="font-mono text-[10px] text-muted-foreground">{s.weight}점</span>
            </div>
            <p className="mt-1 pl-4 text-[11px] text-muted-foreground">{s.desc}</p>
          </div>
        ))}
      </div>

      <p className="mt-3 text-center text-[10px] text-muted-foreground">
        8개 단기 지표를 종합 분석하여 스캘핑 매수/매도 결정 (합산 25점↑ 매수)
      </p>
    </div>
  )
}

export default StrategySelector
