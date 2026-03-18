# StockAuto - 주식자동화 서비스

실시간 환율, 국내/미국 주식 모니터링, AI 기술지표 분석, 자율 스캘핑 봇까지 지원하는 풀스택 주식 자동화 대시보드.

## 주요 기능

### 대시보드 (`/`)
- **실전투자 / 모의투자** 탭 전환 (런타임 듀얼 모드)
- 실시간 환율 (USD, JPY, EUR, CNY) — 양방향 환산
- 국내/미국 주식 모니터링
- KIS API 거래량 상위 종목 랭킹
- AI 기술지표 기반 종목 추천 (RSI, MACD, 볼린저밴드, 이평선, 거래량)
- 잔고/보유종목/주문 통합 표시

### 매매 (대시보드 통합)
- 한국투자증권 계좌 잔고 조회 (실전/모의 분리)
- 보유종목 현황 (평가손익, 수익률)
- 매수/매도 주문 — 5가지 주문 유형:
  - 시장가 (09:00~15:30)
  - 지정가
  - 장전시간외 (08:20~08:40)
  - 시간외종가 (15:40~16:00)
  - 시간외단일가 (16:00~18:00)
- **실전투자 비밀번호 보호** — 실전 주문 시 비밀번호 필수

### 자율 스캘핑 (`/auto-trade`)
- **완전 자율 운영** — 종목 탐색, 매수/매도, 익절/손절 전부 봇이 결정
- **서버사이드 실행** — Node.js 서버에서 3분 간격 자동 실행, 브라우저 꺼도 유지
- KIS 거래량 상위 30종목 자동 스캔 (ETF/인버스 자동 제외)
- 5대 기술지표 종합 분석 (RSI, MACD, 볼린저밴드, 거래량, 이동평균선)
- ATR 기반 동적 익절/손절 (변동성 높은 종목은 넓게, 안정적 종목은 좁게)
- 실전투자 스캘핑도 비밀번호 보호
- 실시간 진단 정보 (장 상태, 스캔 종목수, 매수 신호, 마지막 사이클)

### 설정 (`/settings`)
- 실전/모의 API 연결 상태 분리 확인
- 환경변수 설정 가이드
- 비밀번호 보호 안내

## 기술 스택

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Language**: TypeScript (strict)
- **Styling**: Tailwind CSS v4, Dark Glassmorphism, Ambient UI
- **State**: Zustand v5 (client), TanStack Query v5 (server)
- **UI**: shadcn/ui

## 데이터 소스

| 데이터 | 소스 | API 키 |
|--------|------|--------|
| 환율 | Frankfurter (ECB) | 불필요 |
| 주식 시세/거래량순위 | 한국투자증권 OpenAPI | 필요 |
| 매매/잔고/주문 | 한국투자증권 OpenAPI | 필요 |

> 모든 주식 데이터는 한국투자증권(KIS) OpenAPI를 사용합니다.

## 시작하기

### 1. 설치

```bash
npm install
```

### 2. 환경변수 설정

`.env.local` 파일을 생성하고 아래 내용을 입력:

```env
# ========== 실전투자 ==========
KIS_REAL_APP_KEY=발급받은_앱키
KIS_REAL_APP_SECRET=발급받은_시크릿
KIS_REAL_ACCOUNT_NO=계좌번호-상품코드   # 예: 64605609-01

# ========== 모의투자 ==========
KIS_MOCK_APP_KEY=발급받은_모의_앱키
KIS_MOCK_APP_SECRET=발급받은_모의_시크릿
KIS_MOCK_ACCOUNT_NO=모의계좌번호-상품코드  # 예: 50177280-01

# ========== 실전투자 주문 비밀번호 ==========
TRADING_PASSWORD=원하는비밀번호
```

> KIS API 키는 [한국투자증권 API 포털](https://apiportal.koreainvestment.com)에서 발급받을 수 있습니다.
>
> 실전과 모의는 별도의 App Key/Secret이 필요합니다.

### 3. 실행

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) 접속

같은 네트워크의 다른 기기에서 접속 시 `http://서버IP:3000`으로 접근 가능합니다.

## KIS API 키 발급 방법

1. [apiportal.koreainvestment.com](https://apiportal.koreainvestment.com) 접속 및 회원가입
2. 한국투자증권 계좌 연결
3. "API 신청" 메뉴에서 App Key / App Secret 발급 (**실전용, 모의용 각각**)
4. 모의투자 신청 (실전투자 전 테스트용)
5. `.env.local`에 키 입력 후 서버 재시작

## 프로젝트 구조

```
src/
├── app/
│   ├── (dashboard)/          # 페이지 (대시보드, 자동매매, 설정)
│   └── api/
│       ├── exchange-rate/    # 환율
│       ├── stocks/           # 주식 시세
│       ├── ranking/          # 랭킹
│       ├── kis/              # KIS (잔고, 주문, 내역, 연결테스트)
│       ├── recommendations/  # AI 추천
│       └── auto-trade/       # 자율 스캘핑 스케줄러
├── components/
│   ├── dashboard/            # 대시보드 (환율, 주식, 랭킹, 추천)
│   ├── trading/              # 매매 (잔고, 보유종목, 주문폼)
│   ├── auto-trade/           # 자율 스캘핑 (제어, 설정, 스캔결과, 로그)
│   ├── layout/               # 네비게이션
│   └── ui/                   # shadcn/ui
├── lib/
│   ├── kis-api.ts            # KIS API 클라이언트 (듀얼 모드, 토큰 관리)
│   ├── scalping-engine.ts    # 자율 스캘핑 엔진 (매수/매도/익절/손절)
│   ├── server-scheduler.ts   # 서버사이드 스케줄러 (3분 간격)
│   ├── stock-scanner.ts      # 종목 스캐너 (KIS 거래량순위 + 기술분석)
│   ├── indicators.ts         # 기술지표 (RSI, MACD, SMA, EMA, 볼린저밴드, ATR)
│   ├── frankfurter.ts        # 환율 API
│   ├── recommendation-engine.ts  # 추천 엔진
│   └── strategies/           # 매매 전략 타입
├── hooks/                    # TanStack Query 훅
├── store/                    # Zustand 스토어 (trading, auto-trade)
├── types/                    # TypeScript 타입
└── constants/                # 상수
```

## 보안

- **실전투자 주문**: `TRADING_PASSWORD` 환경변수로 비밀번호 보호 (수동 매매 + 자동 스캘핑 모두)
- **모의투자**: 비밀번호 없이 자유롭게 사용 가능 (같은 네트워크 접속자도)
- **API 키**: 서버사이드에서만 사용, 브라우저에 노출되지 않음
- **토큰 관리**: 모드별 분리 캐시, 중복 발급 방지 (KIS 1분당 1회 제한 대응)

## 주의사항

- **모의투자를 충분히 테스트한 후** 실전투자로 전환하세요
- 자율 스캘핑은 장중(평일 07:00~18:00 KST)에 실행됩니다
- 서버사이드 스케줄러는 브라우저를 닫아도 계속 실행됩니다 (서버 재시작 시 초기화)
- 투자에 대한 최종 판단과 책임은 사용자 본인에게 있습니다

## License

MIT
