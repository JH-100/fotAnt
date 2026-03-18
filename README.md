<div align="center">
<br/>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://capsule-render.vercel.app/api?type=venom&color=0:0d0d0d,50:1a1a2e,100:16213e&height=160&section=header&text=forAnt&fontSize=52&fontColor=e2e8f0&fontAlignY=45&desc=AI%20Autonomous%20Scalping%20Platform&descSize=14&descColor=94a3b8&descAlignY=68">
  <img src="https://capsule-render.vercel.app/api?type=venom&color=0:0d0d0d,50:1a1a2e,100:16213e&height=160&section=header&text=forAnt&fontSize=52&fontColor=e2e8f0&fontAlignY=45&desc=AI%20Autonomous%20Scalping%20Platform&descSize=14&descColor=94a3b8&descAlignY=68" width="100%"/>
</picture>

<br/>

<p>
  <img src="https://img.shields.io/badge/Next.js_16-0d0d0d?style=flat-square&logo=next.js&logoColor=white"/>
  <img src="https://img.shields.io/badge/TypeScript-0d0d0d?style=flat-square&logo=typescript&logoColor=3178c6"/>
  <img src="https://img.shields.io/badge/Tailwind_v4-0d0d0d?style=flat-square&logo=tailwindcss&logoColor=06b6d4"/>
  <img src="https://img.shields.io/badge/KIS_OpenAPI-0d0d0d?style=flat-square&logoColor=white"/>
</p>

<sub>개미는 작지만, 함께하면 강하다</sub>

<br/><br/>

</div>

## Overview

AI가 종목을 탐색하고, 매수/매도 타이밍을 판단하고, 익절/손절까지 자동으로 관리하는 풀스택 트레이딩 플랫폼.
브라우저를 꺼도 서버에서 3분 간격으로 계속 실행됩니다.

<br/>

## Features

<details>
<summary><b>Dashboard</b> — 시세 · 환율 · 랭킹 · AI 추천</summary>
<br/>

- 실전투자 / 모의투자 듀얼 모드 (런타임 전환)
- 실시간 환율 (USD, JPY, EUR, CNY) — 양방향 환산
- KIS API 거래량 상위 종목 랭킹 (국내/미국)
- AI 기술지표 기반 종목 추천
- 잔고 · 보유종목 · 주문내역 통합 표시

</details>

<details>
<summary><b>Trading</b> — 5가지 주문 유형</summary>
<br/>

| 주문 유형 | 시간 |
|-----------|------|
| 시장가 | 09:00 — 15:30 |
| 지정가 | 09:00 — 15:30 |
| 장전시간외 | 08:20 — 08:40 |
| 시간외종가 | 15:40 — 16:00 |
| 시간외단일가 | 16:00 — 18:00 |

실전투자 주문은 비밀번호 보호 적용.

</details>

<details>
<summary><b>Autonomous Scalping</b> — 핵심 기능</summary>
<br/>

서버사이드에서 3분 간격으로 자동 실행되는 자율 스캘핑 봇.

```
스캔 → 분석 → 매수 판단 → 보유 관리 → 익절/손절 → 리포트
```

**스캔**: KIS 거래량 상위 30종목 자동 스캔 (ETF/인버스 제외)
**분석**: 12종 기술지표 + 수급 + 패턴 인식으로 종합 점수 산출
**매수**: 점수 기준 충족 시 ATR 기반 포지션 사이징으로 매수
**관리**: 트레일링 스탑 + 분할 익절 + 시간대별 전략으로 보유 관리
**학습**: 매매 사유별 승률을 추적해서 다음 판단에 반영

</details>

<details>
<summary><b>NXT Exchange</b> — 대체거래소 자동 전환</summary>
<br/>

KRX 시간외단일가 불가 종목 → NXT(넥스트레이드, 08:00~20:00) 자동 재시도.
NXT 주문 시 실시간 현재가를 조회해서 가격 에러 방지.

</details>

<details>
<summary><b>Daily Report</b> — 자동 손익 리포트</summary>
<br/>

```
GET /api/trading-report?type=daily    → 오늘 리포트
GET /api/trading-report?type=weekly   → 7일 합산
GET /api/trading-report?type=reasons  → 전략별 승률
```

`.trading-reports/` 폴더에 일별 JSON 자동 저장.

</details>

<br/>

## Analysis Engine

### Indicators

기본 지표와 고급 지표를 조합해서 종목별 종합 점수를 산출합니다.

| 기본 | 고급 |
|------|------|
| RSI (14) | Williams %R |
| MACD | Keltner Channel |
| Bollinger Bands | Volatility Squeeze |
| SMA / EMA | Volume Profile (POC/VAH/VAL) |
| ATR | Price Pattern (쌍바닥 · 불플래그 · 역헤숄) |
| OBV | Multi-Timeframe Alignment |

### Risk Management

| 기능 | 동작 |
|------|------|
| Trailing Stop | 고점 대비 ATR×2 하락 시 자동 매도 |
| Partial Take-Profit | 익절가 60% 도달 → 절반 매도, 나머지 트레일링 |
| ATR Position Sizing | 변동성 비례 포지션 크기 자동 계산 |
| Sector Limit | 동일 섹터 최대 2종목 |
| Time-based Strategy | 장 초반(+10) · 점심(+15) · 마감(자동 익절) |
| Adaptive Learning | 매매 사유별 승률 추적 → 점수 자동 보정 |
| Daily Loss Limit | 설정 금액 초과 시 자동 중단 |

### Supply & Demand

외국인 · 기관 · 개인 순매수 데이터를 KIS 투자자별 매매동향 API로 실시간 반영.
외국인+기관 동시 순매수 시 가점, 동시 순매도 시 감점.

<br/>

## Stack

```
Framework    Next.js 16 · App Router · Turbopack
Language     TypeScript (strict)
Styling      Tailwind CSS v4 · Dark Glassmorphism · Ambient Glow
State        Zustand v5 (client) · TanStack Query v5 (server)
UI           shadcn/ui · Radix Primitives
API          KIS OpenAPI · Frankfurter ECB · NXT Exchange
```

<br/>

## Getting Started

```bash
git clone https://github.com/JH-100/fotAnt.git
cd fotAnt && npm install
```

`.env.local` 생성 :

```env
# 실전투자
KIS_REAL_APP_KEY=
KIS_REAL_APP_SECRET=
KIS_REAL_ACCOUNT_NO=          # 64605609-01

# 모의투자
KIS_MOCK_APP_KEY=
KIS_MOCK_APP_SECRET=
KIS_MOCK_ACCOUNT_NO=          # 50177280-01

# 주문 비밀번호
TRADING_PASSWORD=
```

> KIS API 키 발급 → [apiportal.koreainvestment.com](https://apiportal.koreainvestment.com)

```bash
npm run dev
```

`http://localhost:3000` — 같은 네트워크 내 다른 기기에서도 접속 가능.

<br/>

## Structure

```
src/
├─ app/
│  ├─ (dashboard)/                 페이지
│  └─ api/
│     ├─ exchange-rate/            환율
│     ├─ stocks/                   시세
│     ├─ ranking/                  랭킹
│     ├─ kis/                      잔고 · 주문 · 내역
│     ├─ recommendations/          AI 추천
│     ├─ auto-trade/               자율 스캘핑
│     └─ trading-report/           리포트
├─ components/
│  ├─ dashboard/                   대시보드 UI
│  ├─ trading/                     매매 UI
│  ├─ auto-trade/                  스캘핑 UI
│  └─ ui/                          shadcn/ui
├─ lib/
│  ├─ kis-api.ts                   KIS API 클라이언트
│  ├─ scalping-engine.ts           스캘핑 엔진
│  ├─ server-scheduler.ts          서버 스케줄러
│  ├─ stock-scanner.ts             종목 스캐너
│  ├─ indicators.ts                기술 지표 (12종)
│  └─ strategies/                  매매 전략
├─ hooks/                          TanStack Query
├─ store/                          Zustand
└─ types/                          TypeScript 타입
```

<br/>

## Security

- 실전 주문 → `TRADING_PASSWORD` 필수
- 모의투자 → 비밀번호 없이 사용
- API 키 → 서버사이드 전용, 브라우저 미노출
- 토큰 → 모드별 분리 캐시, 중복 발급 방지

<br/>

## Notes

- 모의투자를 충분히 테스트한 후 실전으로 전환하세요
- 서버 스케줄러는 브라우저를 닫아도 계속 실행됩니다
- 서버 재시작 시 스케줄러 상태 초기화 (로그는 파일로 보존)
- **투자에 대한 최종 판단과 책임은 사용자 본인에게 있습니다**

<br/>

---

<div align="center">
<sub>MIT License</sub>
</div>
