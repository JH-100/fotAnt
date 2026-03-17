'use client'

// 설정 페이지
import { useState, useEffect } from 'react'

const SettingsPage = () => {
  const [status, setStatus] = useState<'loading' | 'connected' | 'disconnected'>('loading')
  const [mockMode, setMockMode] = useState(true)

  useEffect(() => {
    // KIS API 연결 상태 확인
    fetch('/api/kis/balance')
      .then((res) => {
        setStatus(res.ok ? 'connected' : 'disconnected')
      })
      .catch(() => setStatus('disconnected'))

    // 모의투자 모드 확인
    setMockMode(true) // 서버 환경변수이므로 클라이언트에서는 기본값
  }, [])

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

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl bg-white/[0.03] p-4">
            <div>
              <p className="text-sm font-medium">연결 상태</p>
              <p className="text-xs text-muted-foreground">KIS OpenAPI 인증</p>
            </div>
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
          </div>

          <div className="flex items-center justify-between rounded-xl bg-white/[0.03] p-4">
            <div>
              <p className="text-sm font-medium">모의투자 모드</p>
              <p className="text-xs text-muted-foreground">실전투자 전 테스트용</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${
              mockMode ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'
            }`}>
              {mockMode ? '모의투자' : '실전투자'}
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
              <p><span className="text-blue-400">KIS_APP_KEY</span>=발급받은_앱키</p>
              <p><span className="text-blue-400">KIS_APP_SECRET</span>=발급받은_시크릿</p>
              <p><span className="text-blue-400">KIS_ACCOUNT_NO</span>=계좌번호-상품코드</p>
              <p><span className="text-blue-400">KIS_MOCK_MODE</span>=true</p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground">API 키 발급 방법</h4>
            <ol className="list-inside list-decimal space-y-1 text-xs text-muted-foreground">
              <li>한국투자증권 API 포털 접속 (apiportal.koreainvestment.com)</li>
              <li>회원가입 후 한국투자증권 계좌 연결</li>
              <li>&ldquo;API 신청&rdquo; 메뉴에서 App Key / App Secret 발급</li>
              <li>모의투자 신청 (실전투자 전 테스트용)</li>
              <li><code className="rounded bg-white/[0.06] px-1 py-0.5">.env.local</code>에 키 입력 후 서버 재시작</li>
            </ol>
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
            { name: '매매', source: 'KIS OpenAPI', status: status === 'connected' ? 'active' : 'inactive' },
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
