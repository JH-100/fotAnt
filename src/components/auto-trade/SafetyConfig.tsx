'use client'

// 스캘핑 설정 패널 — 봇이 익절/손절 자동 결정
import useAutoTradeStore from '@/store/auto-trade-store'
import useTradingStore from '@/store/trading-store'

/** 숫자 스텝 컨트롤 */
const StepControl = ({
  label, value, format, step, min, max, disabled, onChange,
}: {
  label: string; value: number; format: (v: number) => string
  step: number; min: number; max: number; disabled: boolean
  onChange: (v: number) => void
}) => (
  <div className="flex items-center justify-between rounded-xl bg-white/[0.03] px-4 py-3">
    <span className="text-xs text-muted-foreground">{label}</span>
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - step))}
        className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 text-sm transition-colors hover:bg-white/[0.06] disabled:opacity-30"
      >-</button>
      <span className="w-16 text-center font-mono text-sm font-medium tabular-nums">
        {format(value)}
      </span>
      <button
        type="button"
        disabled={disabled || value >= max}
        onClick={() => onChange(Math.min(max, value + step))}
        className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 text-sm transition-colors hover:bg-white/[0.06] disabled:opacity-30"
      >+</button>
    </div>
  </div>
)

const ScalpingConfigPanel = () => {
  const { config, setConfig, isRunning } = useAutoTradeStore()
  const setDashboardMode = useTradingStore((s) => s.setMode)

  return (
    <div className="glass rounded-2xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="h-5 w-1 rounded-full bg-gradient-to-b from-rose-400 to-orange-500" />
        <h3 className="font-semibold">스캘핑 설정</h3>
      </div>

      <div className="space-y-3">
        {/* 모드 선택 */}
        <div className="rounded-xl bg-white/[0.03] px-4 py-3">
          <label className="mb-2 block text-xs text-muted-foreground">매매 모드</label>
          <div className="flex gap-2">
            <button
              disabled={isRunning}
              onClick={() => { setConfig({ mode: 'mock' }); setDashboardMode('mock') }}
              className={`flex-1 rounded-lg py-2 text-xs font-medium transition-all ${
                config.mode === 'mock'
                  ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30'
                  : 'text-muted-foreground hover:bg-white/[0.05]'
              } disabled:opacity-40`}
            >
              모의투자
            </button>
            <button
              disabled={isRunning}
              onClick={() => { setConfig({ mode: 'real' }); setDashboardMode('real') }}
              className={`flex-1 rounded-lg py-2 text-xs font-medium transition-all ${
                config.mode === 'real'
                  ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30'
                  : 'text-muted-foreground hover:bg-white/[0.05]'
              } disabled:opacity-40`}
            >
              🔒 실전투자
            </button>
          </div>
        </div>

        {/* 총 투자 한도 */}
        <div className="rounded-xl bg-white/[0.03] px-4 py-3">
          <label className="mb-1.5 block text-xs text-muted-foreground">총 투자 한도</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={config.budget}
              disabled={isRunning}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10)
                if (!isNaN(v) && v >= 10000) setConfig({ budget: v })
              }}
              min={10000} max={100000000} step={100000}
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-sm outline-none focus:border-white/20 disabled:opacity-40"
            />
            <span className="shrink-0 text-xs text-muted-foreground">원</span>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">봇이 사용할 수 있는 최대 금액</p>
        </div>

        {/* 건당 최대 금액 */}
        <div className="rounded-xl bg-white/[0.03] px-4 py-3">
          <label className="mb-1.5 block text-xs text-muted-foreground">건당 최대 금액</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={config.maxPerTrade}
              disabled={isRunning}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10)
                if (!isNaN(v) && v >= 500) setConfig({ maxPerTrade: v })
              }}
              min={500} max={10000000} step={10000}
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-sm outline-none focus:border-white/20 disabled:opacity-40"
            />
            <span className="shrink-0 text-xs text-muted-foreground">원</span>
          </div>
        </div>

        <StepControl
          label="동시 보유 종목"
          value={config.maxPositions}
          format={(v) => v + '종목'}
          step={1} min={1} max={10}
          disabled={isRunning}
          onChange={(v) => setConfig({ maxPositions: v })}
        />

        <StepControl
          label="일일 최대 주문"
          value={config.maxDailyOrders}
          format={(v) => v + '건'}
          step={1} min={1} max={50}
          disabled={isRunning}
          onChange={(v) => setConfig({ maxDailyOrders: v })}
        />

        <StepControl
          label="최소 매수 점수"
          value={config.minScore}
          format={(v) => v + '점'}
          step={5} min={10} max={80}
          disabled={isRunning}
          onChange={(v) => setConfig({ minScore: v })}
        />
      </div>

      {/* 공격 모드 토글 */}
      <div className="mt-4 rounded-xl border border-white/10 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium">공격 모드</p>
            <p className="text-[10px] text-muted-foreground">높은 수익 · 높은 리스크</p>
          </div>
          <button
            type="button"
            disabled={isRunning}
            onClick={() => setConfig({
              riskLevel: config.riskLevel === 'aggressive' ? 'normal' : 'aggressive'
            })}
            className={`relative h-7 w-14 rounded-full transition-all ${
              config.riskLevel === 'aggressive'
                ? 'bg-gradient-to-r from-orange-500 to-rose-500 shadow-lg shadow-rose-500/20'
                : 'bg-white/10'
            } disabled:opacity-40`}
          >
            <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${
              config.riskLevel === 'aggressive' ? 'left-[30px]' : 'left-0.5'
            }`} />
          </button>
        </div>

        {config.riskLevel === 'aggressive' && (
          <div className="mt-3 space-y-2">
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="rounded-lg bg-orange-500/10 px-2 py-1.5">
                <span className="text-orange-300">건당 금액</span>
                <span className="float-right font-mono text-orange-400">{Math.round(config.maxPerTrade * 1.5).toLocaleString()}</span>
              </div>
              <div className="rounded-lg bg-orange-500/10 px-2 py-1.5">
                <span className="text-orange-300">최소 점수</span>
                <span className="float-right font-mono text-orange-400">{Math.max(10, config.minScore - 10)}점</span>
              </div>
              <div className="rounded-lg bg-orange-500/10 px-2 py-1.5">
                <span className="text-orange-300">최대 종목</span>
                <span className="float-right font-mono text-orange-400">{config.maxPositions + 3}종목</span>
              </div>
              <div className="rounded-lg bg-orange-500/10 px-2 py-1.5">
                <span className="text-orange-300">익절/손절</span>
                <span className="float-right font-mono text-orange-400">x1.5</span>
              </div>
            </div>
            <p className="text-center text-[10px] text-rose-400">
              예상 일 변동폭: ±{Math.round(config.maxPerTrade * 1.5 * (config.maxPositions + 3) * 0.03 / 10000)}만원
            </p>
          </div>
        )}
      </div>

      {/* 봇 자율 판단 설명 */}
      <div className="mt-4 space-y-2">
        <div className="rounded-xl bg-emerald-500/10 p-3">
          <p className="mb-1 text-[11px] font-medium text-emerald-300">🎯 익절 — 봇이 자동 결정</p>
          <p className="text-[10px] text-emerald-300/70">
            5분봉 ATR(평균진폭) 기반으로 종목별 단기 변동성을 분석하여 익절 목표를 설정합니다.
            변동성 큰 종목은 넓게(~4%), 안정적 종목은 좁게(~0.5%) 잡습니다.
            강한 매수 신호일수록 더 높은 익절 목표를 설정합니다.
          </p>
        </div>
        <div className="rounded-xl bg-rose-500/10 p-3">
          <p className="mb-1 text-[11px] font-medium text-rose-300">🛑 손절 — 봇이 자동 결정</p>
          <p className="text-[10px] text-rose-300/70">
            분봉 ATR 기반으로 종목별 손절선을 설정합니다 (0.3%~2.5%).
            매수 점수가 낮았던 종목은 -1%만 하락해도 조기 탈출합니다.
          </p>
        </div>
        <div className="rounded-xl bg-violet-500/10 p-3">
          <p className="mb-1 text-[11px] font-medium text-violet-300">🔍 종목 탐색 — 분봉 단기지표 + AI 추천</p>
          <p className="text-[10px] text-violet-300/70">
            KIS 거래량 상위 30종목 + AI 추천 종목(최대 5개)의 분봉 데이터를 실시간 분석합니다.
            5분봉 RSI(7) · 단기MACD(6,13,5) · VWAP · 거래량급등 · 체결강도 · 눌림목 패턴 ·
            볼린저밴드(10) · 단기이평선(3/7)으로 점수를 매기고, 기준 점수 이상인 종목만 매수합니다.
            AI 추천은 일봉 기술분석으로 거래량순위 밖의 우량 종목을 추가 발굴합니다.
          </p>
        </div>
      </div>
    </div>
  )
}

export default ScalpingConfigPanel
