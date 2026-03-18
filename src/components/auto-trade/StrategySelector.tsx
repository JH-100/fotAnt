'use client'

// 자율 스캘핑은 복합 지표 분석 — 개별 전략 선택 없음 (참고용 컴포넌트)

const StrategySelector = () => {
  return (
    <div className="glass rounded-2xl p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="h-5 w-1 rounded-full bg-gradient-to-b from-violet-400 to-purple-500" />
        <h3 className="font-semibold">분석 지표</h3>
      </div>

      <div className="space-y-2">
        {[
          { name: 'RSI', desc: '과매수/과매도 판단 (30↓ 매수, 70↑ 매도)', color: 'from-blue-400 to-cyan-400' },
          { name: 'MACD', desc: '골든크로스/데드크로스 감지', color: 'from-violet-400 to-purple-400' },
          { name: '볼린저밴드', desc: '하단 근접 시 반등 기대', color: 'from-amber-400 to-orange-400' },
          { name: '거래량', desc: '평균 대비 급증 시 추세 확인', color: 'from-emerald-400 to-green-400' },
          { name: '이동평균선', desc: '5일/20일 골든크로스 감지', color: 'from-rose-400 to-pink-400' },
        ].map((s) => (
          <div
            key={s.name}
            className="w-full rounded-xl border border-white/10 bg-white/[0.05] p-3 text-left"
          >
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full bg-gradient-to-r ${s.color}`} />
              <span className="text-sm font-medium">{s.name}</span>
            </div>
            <p className="mt-1 pl-4 text-[11px] text-muted-foreground">{s.desc}</p>
          </div>
        ))}
      </div>

      <p className="mt-3 text-center text-[10px] text-muted-foreground">
        5개 지표를 종합 분석하여 매수/매도 결정
      </p>
    </div>
  )
}

export default StrategySelector
