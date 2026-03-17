# StockAuto - 주식자동화 서비스

실시간 환율, 국내/미국 주식 모니터링, AI 기술지표 추천, 자동매매까지 지원하는 풀스택 주식 자동화 대시보드.

## 주요 기능

### 대시보드 (`/`)
- 실시간 환율 (USD, JPY, EUR, CNY) — 양방향 환산
- 국내/미국 주식 모니터링
- 토스증권 실시간 랭킹 (거래대금, 거래량, 급상승, 급하락)
- AI 기술지표 기반 종목 추천

### 매매 (`/trading`)
- 한국투자증권 계좌 잔고 조회
- 보유종목 현황 (평가손익, 수익률)
- 매수/매도 주문 (시장가/지정가)

### 자동매매 (`/auto-trade`)
- 3가지 전략: RSI 역추세, MACD 교차, 모멘텀
- 안전장치: 손절선, 일일 손실 한도, 포지션 한도, 일일 주문 수 제한
- 대상 종목 커스텀 설정
- 5분 간격 자동 실행 (장중 09:00~15:30)
- 매매 로그 실시간 기록

### 설정 (`/settings`)
- API 연결 상태 확인
- 환경변수 설정 가이드
- 데이터 소스 현황

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
| 국내주식 시세 | 토스증권 비공식 API | 불필요 |
| 랭킹 | 토스증권 랭킹 API | 불필요 |
| 매매/잔고/시세 | 한국투자증권 OpenAPI | 필요 |

## 시작하기

### 1. 설치

```bash
npm install
```

### 2. 환경변수 설정

`.env.local` 파일을 생성하고 아래 내용을 입력:

```env
# 한국투자증권 OpenAPI (매매 기능 사용 시 필수)
KIS_APP_KEY=발급받은_앱키
KIS_APP_SECRET=발급받은_시크릿
KIS_ACCOUNT_NO=계좌번호-상품코드
KIS_MOCK_MODE=true
```

> KIS API 키는 [한국투자증권 API 포털](https://apiportal.koreainvestment.com)에서 발급받을 수 있습니다.
>
> KIS API 없이도 대시보드(환율, 주식, 랭킹)는 정상 동작합니다.

### 3. 실행

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) 접속

## KIS API 키 발급 방법

1. [apiportal.koreainvestment.com](https://apiportal.koreainvestment.com) 접속 및 회원가입
2. 한국투자증권 계좌 연결
3. "API 신청" 메뉴에서 App Key / App Secret 발급
4. 모의투자 신청 (실전투자 전 테스트용)
5. `.env.local`에 키 입력 후 서버 재시작

## 프로젝트 구조

```
src/
├── app/
│   ├── (dashboard)/          # 페이지 (대시보드, 매매, 자동매매, 설정)
│   └── api/                  # API 라우트
│       ├── exchange-rate/    # 환율
│       ├── stocks/           # 주식 시세
│       ├── ranking/          # 랭킹
│       ├── kis/              # KIS (잔고, 주문, 내역)
│       ├── recommendations/  # AI 추천
│       └── auto-trade/       # 자동매매
├── components/
│   ├── dashboard/            # 대시보드 컴포넌트
│   ├── trading/              # 매매 컴포넌트
│   ├── auto-trade/           # 자동매매 컴포넌트
│   ├── layout/               # 네비게이션
│   └── ui/                   # shadcn/ui
├── lib/
│   ├── kis-api.ts            # KIS API 클라이언트
│   ├── frankfurter.ts        # 환율 API
│   ├── toss-invest.ts        # 토스증권 API
│   ├── indicators.ts         # 기술지표 (RSI, MACD, SMA, EMA, 볼린저밴드)
│   ├── recommendation-engine.ts  # 추천 엔진
│   ├── auto-trader.ts        # 자동매매 엔진
│   └── strategies/           # 매매 전략
├── hooks/                    # TanStack Query 훅
├── store/                    # Zustand 스토어
├── types/                    # TypeScript 타입
└── constants/                # 상수
```

## 주의사항

- **모의투자를 충분히 테스트한 후** 실전투자로 전환하세요 (`KIS_MOCK_MODE=false`)
- 자동매매는 장중(평일 09:00~15:30 KST)에만 실행됩니다
- 투자에 대한 최종 판단과 책임은 사용자 본인에게 있습니다

## License

MIT
