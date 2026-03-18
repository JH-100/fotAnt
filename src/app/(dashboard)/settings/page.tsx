'use client'

// 설정 페이지 — 듀얼 모드 지원
import { useState, useEffect } from 'react'

const SettingsPage = () => {
  const [realStatus, setRealStatus] = useState<'loading' | 'connected' | 'disconnected'>('loading')
  const [mockStatus, setMockStatus] = useState<'loading' | 'connected' | 'disconnected'>('loading')

  useEffect(() => {
    // 실전 API 연결 확인
    fetch('/api/kis/balance?mode=real')
      .then((res) => setRealStatus(res.ok ? 'connected' : 'disconnected'))
      .catch(() => setRealStatus('disconnected'))

    // 모의 API 연결 확인
    fetch('/api/kis/balance?mode=mock')
      .then((res) => setMockStatus(res.ok ? 'connected' : 'disconnected'))
      .catch(() => setMockStatus('disconnected'))
  }, [])

  const StatusBadge = ({ status }: { status: 'loading' | 'connected' | 'disconnected' }) => (
    <div className="flex items-center gap-2">
      <div
        className={`h-2.5 w-2.5 rounded-full ${
          status === 'loading'
            ? 'animate-pulse bg-amber-400'
            : status === 'connected'
              ? 'bg-emerald-400'
              : 'bg-rose-400'
        }`}
      />
      <span className="text-sm">
        {status === 'loading' ? '확인 중...' : status === 'connected' ? '연결됨' : '미연결'}
      </span>
    </div>
  )

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-2">
        <h1 className="bg-gradient-to-r from-slate-400 via-blue-400 to-violet-400 bg-clip-text text-4xl font-bold tracking-tight text-transparent">
          설정
        </h1>
        <p className="text-sm text-muted-foreground">
          API 연결 상태 및 환경 설정
        </p>
      </header>

      {/* KIS API 연결 상태 */}
      <div className="glass rounded-2xl p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="h-5 w-1 rounded-full bg-gradient-to-b from-blue-400 to-cyan-500" />
          <h3 className="font-semibold">한국투자증권 API</h3>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl bg-white/[0.03] p-4">
            <div>
              <p className="text-sm font-medium">실전투자</p>
              <p className="text-xs text-muted-foreground">KIS_REAL_APP_KEY / KIS_REAL_ACCOUNT_NO</p>
            </div>
            <StatusBadge status={realStatus} />
          </div>

          <div className="flex items-center justify-between rounded-xl bg-white/[0.03] p-4">
            <div>
              <p className="text-sm font-medium">모의투자</p>
              <p className="text-xs text-muted-foreground">KIS_MOCK_APP_KEY / KIS_MOCK_ACCOUNT_NO</p>
            </div>
            <StatusBadge status={mockStatus} />
          </div>

          <div className="flex items-center justify-between rounded-xl bg-white/[0.03] p-4">
            <div>
              <p className="text-sm font-medium">주문 비밀번호</p>
              <p className="text-xs text-muted-foreground">실전투자 주문 시 필수 (TRADING_PASSWORD)</p>
            </div>
            <span className="rounded-full bg-rose-500/20 px-3 py-1 text-xs font-medium text-rose-400">
              🔒 보호됨
            </span>
          </div>
        </div>
      </div>

      {/* 환경변수 설정 가이드 */}
      <div className="glass rounded-2xl p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="h-5 w-1 rounded-full bg-gradient-to-b from-amber-400 to-orange-500" />
          <h3 className="font-semibold">설정 가이드</h3>
        </div>

        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs">.env.local</code> 파일에 다음 환경변수를 설정하세요:
          </p>

          <div className="rounded-xl bg-white/[0.03] p-4 font-mono text-xs">
            <div className="space-y-1 text-muted-foreground">
              <p className="text-[10px] text-amber-400/60"># ━━ 실전투자 ━━</p>
              <p><span className="text-blue-400">KIS_REAL_APP_KEY</span>=실전_앱키</p>
              <p><span className="text-blue-400">KIS_REAL_APP_SECRET</span>=실전_시크릿</p>
              <p><span className="text-blue-400">KIS_REAL_ACCOUNT_NO</span>=계좌번호-01</p>
              <p className="mt-2 text-[10px] text-amber-400/60"># ━━ 모의투자 ━━</p>
              <p><span className="text-blue-400">KIS_MOCK_APP_KEY</span>=모의_앱키</p>
              <p><span className="text-blue-400">KIS_MOCK_APP_SECRET</span>=모의_시크릿</p>
              <p><span className="text-blue-400">KIS_MOCK_ACCOUNT_NO</span>=모의계좌-01</p>
              <p className="mt-2 text-[10px] text-amber-400/60"># ━━ 보안 ━━</p>
              <p><span className="text-rose-400">TRADING_PASSWORD</span>=실전주문비밀번호</p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground">API 키 발급 방법</h4>
            <ol className="list-inside list-decimal space-y-1 text-xs text-muted-foreground">
              <li>한국투자증권 API 포털 접속 (apiportal.koreainvestment.com)</li>
              <li>회원가입 후 한국투자증권 계좌 연결</li>
              <li>&ldquo;API 신청&rdquo; 메뉴에서 App Key / App Secret 발급</li>
              <li>실전 + 모의투자 각각 별도 발급</li>
              <li><code className="rounded bg-white/[0.06] px-1 py-0.5">.env.local</code>에 키 입력 후 서버 재시작</li>
            </ol>
          </div>

          <div className="mt-4 rounded-xl bg-rose-500/10 p-3">
            <p className="text-xs text-rose-400">
              ⚠️ 같은 네트워크의 사용자도 모의투자는 자유롭게 사용 가능하지만,
              실전투자 주문은 반드시 비밀번호를 알아야 실행됩니다.
            </p>
          </div>
        </div>
      </div>

      {/* 데이터 소스 */}
      <div className="glass rounded-2xl p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="h-5 w-1 rounded-full bg-gradient-to-b from-emerald-400 to-teal-500" />
          <h3 className="font-semibold">데이터 소스</h3>
        </div>

        <div className="space-y-2">
          {[
            { name: '환율', source: 'Frankfurter (ECB)', status: 'active' },
            { name: '국내주식', source: '토스증권 비공식 API', status: 'active' },
            { name: '랭킹', source: '토스증권 랭킹 API', status: 'active' },
            { name: '실전매매', source: 'KIS OpenAPI (실전)', status: realStatus === 'connected' ? 'active' : 'inactive' },
            { name: '모의매매', source: 'KIS OpenAPI (모의)', status: mockStatus === 'connected' ? 'active' : 'inactive' },
          ].map((ds) => (
            <div key={ds.name} className="flex items-center justify-between rounded-lg px-3 py-2">
              <div>
                <span className="text-sm">{ds.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">{ds.source}</span>
              </div>
              <div className={`h-2 w-2 rounded-full ${ds.status === 'active' ? 'bg-emerald-400' : 'bg-white/20'}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default SettingsPage
