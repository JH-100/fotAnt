// 자율 스캘핑 엔진 — 종목 탐색 + 동적 익절/손절 전부 봇이 결정
// 로그 타임스탬프 헬퍼 (MM/DD HH:mm)
const logTime = () => {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}/${dd} ${hh}:${mi}`
}

import type { KisBalance } from '@/types/kis'
import { getKisBalance, getKisMinutePrices, aggregateMinuteBars, placeKisOrder, getKisCurrentPrice, getKisOrderableCash } from './kis-api'
import type { TradingMode } from './kis-api'
import { scanMarket, type ScanResult } from './stock-scanner'
import { calcMinuteATR } from './indicators'
import type { TradeLogEntry } from './strategies/types'

// ETF/레버리지/인버스 필터 (파생상품 ETF 거래신청 필요 → 매수 차단)
const ETF_PREFIXES = ['KODEX', 'TIGER', 'KOSEF', 'KBSTAR', 'ARIRANG', 'SOL', 'ACE', 'HANARO']
const isETF = (name: string): boolean =>
  ETF_PREFIXES.some(p => name.startsWith(p)) || name.includes('레버리지') || name.includes('인버스')

export type RiskLevel = 'normal' | 'aggressive'
export type TradingMode2 = 'scalping' | 'trend'  // 스캘핑(초단타) / 추세추종(중기)

export interface ScalpingConfig {
  budget: number              // 총 투자 한도 (원)
  maxPerTrade: number         // 건당 최대 금액 (원)
  maxPositions: number        // 동시 보유 종목 수
  maxDailyOrders: number      // 일일 최대 주문
  minScore: number            // 최소 매수 점수
  mode: TradingMode           // 실전/모의
  riskLevel: RiskLevel        // 위험도 (normal/aggressive)
  tradingMode?: TradingMode2  // 'scalping' | 'trend' (기본 trend — 상승장 적합)
}

// 왕복 거래비용 (%) — 매수수수료 + 매도수수료 + 매도세(0.18%) + 슬리피지
// 목표가/손절가 판정 시 이 마진을 반드시 넘어야 실제 수익 가능
export const ROUND_TRIP_COST_PCT = 0.5

export const DEFAULT_SCALPING: ScalpingConfig = {
  budget: 500000,
  maxPerTrade: 100000,
  maxPositions: 3,      // 5→3: 집중 + 수수료 절감
  maxDailyOrders: 20,   // 50→20: 과매매 방지
  minScore: 40,         // 25→40: 약한 신호 매수 차단 (승률 8% 사태 방지)
  mode: 'mock',
  riskLevel: 'normal',
  tradingMode: 'scalping', // 기본: 스캘핑 (분봉 기반, 3분 사이클, -3% 하드스탑)
}

// 추세추종 모드 전용 기본값 (일봉 기반, 중기 보유)
export const DEFAULT_TREND: Partial<ScalpingConfig> = {
  maxPositions: 2,      // 집중 투자 (2종목)
  maxPerTrade: 300000,  // 1종목당 최대 30만원
  maxDailyOrders: 5,    // 추세는 빈번한 매매 불필요
  minScore: 60,         // 확신 있는 신호만
  tradingMode: 'trend',
}

// ─── 포지션별 익절/손절 기준 (매수 시 스캔결과에서 저장) ──
interface PositionMeta {
  takeProfitPercent: number
  stopLossPercent: number
  buyScore: number
  buyReasons: string[]
  // 트레일링 스탑 & 분할 익절
  highWaterMark: number     // 매수 후 최고가
  buyPrice: number          // 매수 단가
  firstPartialSold: boolean // 1차 분할익절 완료 여부
  atrPercent: number        // ATR% (변동성 기반 포지션 사이징용)
  buyTimestamp: number      // 매수 시각 (Date.now())
  // 러너 모드 (1차 익절 후 나머지 추세 추종)
  priceTarget: number       // 1차 목표가 절대가격 (저항선 기반)
  runnerActive: boolean     // 러너 모드 진행 중
  runnerTrailStop: number   // 러너 트레일링 스탑 가격
  // 추세 모드 전용
  ma5: number               // 매수 시점 5일선 (추세 청산 판단용, 주기적 갱신)
}
const positionMetas: Record<string, PositionMeta> = {}

// ─── 섹터 분류 (동일 섹터 동시보유 제한용) ────────
const SECTOR_MAP: Record<string, string> = {
  // 반도체
  '005930': '반도체', '000660': '반도체', '042700': '반도체', '403870': '반도체',
  // 바이오
  '068270': '바이오', '207940': '바이오', '009420': '바이오', '145020': '바이오',
  '326030': '바이오', '328130': '바이오', '196170': '바이오', '141080': '바이오',
  // 자동차
  '005380': '자동차', '000270': '자동차', '012330': '자동차',
  // 배터리/2차전지
  '373220': '2차전지', '006400': '2차전지', '051910': '2차전지',
  // 금융
  '055550': '금융', '105560': '금융', '316140': '금융',
  // 방산
  '012450': '방산', '047810': '방산', '001340': '방산',
  // 플랫폼/IT
  '035420': 'IT', '035720': 'IT', '036570': 'IT', '259960': 'IT',
  // 엔터
  '352820': '엔터', '041510': '엔터', '122870': '엔터',
  // 철강/소재
  '005490': '소재', '010130': '소재', '011170': '소재',
}
const MAX_PER_SECTOR = 2 // 동일 섹터 최대 보유 종목 수

// ─── 손실 레벨 (단계별 리스크 관리) ────────────────
export type LossLevel = 'normal' | 'conservative' | 'recovery' | 'full-stop'

// 손실 레벨은 절대금액 기준 (예산 비율 아님)
const LOSS_LABELS: Record<LossLevel, string> = {
  'normal':       '정상 모드',
  'conservative': '보수적 모드 (일손익 -10만원)',
  'recovery':     '복구 모드 (일손익 -20만원)',
  'full-stop':    '완전 중단 (일손익 -30만원, 매도만 허용)',
}

const determineLossLevel = (pnl: number, _budget: number): LossLevel => {
  if (pnl <= -300000) return 'full-stop'    // -30만원: 매수 완전 차단
  if (pnl <= -200000) return 'recovery'     // -20만원: 최소 매수 (수급 필수)
  if (pnl <= -100000) return 'conservative' // -10만원: 보수적 매수
  return 'normal'
}

// ─── 엔진 상태 (메모리) ────────────────────────────
// 모드별 독립 통계 (모의/실전 손익이 서로 영향 안 줌)
interface ModeStats { orderCount: number; pnl: number; lossLevel: LossLevel; resetDate: string }
const modeStats: Record<string, ModeStats> = {
  mock: { orderCount: 0, pnl: 0, lossLevel: 'normal', resetDate: '' },
  real: { orderCount: 0, pnl: 0, lossLevel: 'normal', resetDate: '' },
}
const getMS = (mode: string) => modeStats[mode] ?? modeStats['mock']!

// 하위호환용 (getDailyStats, resetDailyStats에서 사용)
let _activeMode = 'mock'

const tradeLogs: TradeLogEntry[] = []
let lastScanResults: ScanResult[] = []
let cycleRunning = false  // 동시실행 방지 플래그

// ─── 손절 쿨다운 (30분) ────────────────────────────
const lossCooldown: Record<string, number> = {}  // code → 마지막 손절 timestamp
const LOSS_COOLDOWN_MS = 30 * 60 * 1000          // 30분

// 외부에서 로그/통계 복원용 (서버 스케줄러가 파일에서 읽어서 주입)
export const restoreLogs = (logs: TradeLogEntry[]) => {
  tradeLogs.length = 0
  tradeLogs.push(...logs)
}
export const restoreStats = (stats: { orders: number; pnl: number; date: string; mode?: string }) => {
  const mode = stats.mode ?? 'mock'
  const ms = getMS(mode)
  ms.orderCount = stats.orders
  ms.pnl = stats.pnl
  ms.resetDate = stats.date
}

// ─── 거래 성과 학습 (reason별 승률 추적) ────────
interface ReasonStats { wins: number; losses: number; totalPnl: number }
const reasonPerformance: Record<string, ReasonStats> = {}

/** 거래 결과를 reason별로 기록 (매도 시 호출) */
const recordTradeOutcome = (reasons: string[], pnl: number) => {
  const isWin = pnl > 0
  for (const reason of reasons) {
    // 점수/숫자 부분 제거하여 패턴별로 그룹핑
    const key = reason.replace(/[\d.]+/g, '#').trim()
    if (!reasonPerformance[key]) reasonPerformance[key] = { wins: 0, losses: 0, totalPnl: 0 }
    const stat = reasonPerformance[key]!
    if (isWin) stat.wins++; else stat.losses++
    stat.totalPnl += pnl
  }
}

/** 특정 reason 조합의 역사적 승률 조회 (0~1) */
const getReasonWinRate = (reasons: string[]): number | null => {
  let totalWins = 0, totalTrades = 0
  for (const reason of reasons) {
    const key = reason.replace(/[\d.]+/g, '#').trim()
    const stat = reasonPerformance[key]
    if (stat) {
      totalWins += stat.wins
      totalTrades += stat.wins + stat.losses
    }
  }
  return totalTrades >= 5 ? totalWins / totalTrades : null // 최소 5건 이상 데이터 필요
}

export const getReasonPerformance = () => ({ ...reasonPerformance })

// ─── 자동 손익 리포트 (파일 기반, 서버 전용) ─────────
const getReportDir = () => {
  if (typeof window !== 'undefined') return ''
  const path = require('path') as typeof import('path')
  return path.join(process.cwd(), '.trading-reports')
}

interface DailyReport {
  date: string
  totalOrders: number
  buyCount: number
  sellCount: number
  wins: number
  losses: number
  totalPnL: number
  winRate: number
  bestTrade: { code: string; name: string; pnl: number } | null
  worstTrade: { code: string; name: string; pnl: number } | null
  topReasons: { reason: string; wins: number; losses: number; winRate: number }[]
}

/** 일일 리포트 생성 및 저장 */
export const generateDailyReport = (): DailyReport => {
  const today = new Date().toISOString().split('T')[0] ?? ''
  const todayLogs = tradeLogs.filter(l => l.timestamp.startsWith(today))

  const buys = todayLogs.filter(l => l.action === 'BUY' && l.result === 'success')
  const sells = todayLogs.filter(l => l.action === 'SELL' && l.result === 'success')

  // 매도 결과에서 손익 추정 (reason에서 % 추출)
  let wins = 0, losses = 0, totalPnL = 0
  let bestTrade: DailyReport['bestTrade'] = null
  let worstTrade: DailyReport['worstTrade'] = null

  for (const sell of sells) {
    const meta = positionMetas[sell.code]
    const pnl = meta ? (sell.price - meta.buyPrice) * sell.quantity : 0
    totalPnL += pnl
    if (pnl > 0) wins++; else losses++
    if (!bestTrade || pnl > bestTrade.pnl) bestTrade = { code: sell.code, name: sell.name, pnl }
    if (!worstTrade || pnl < worstTrade.pnl) worstTrade = { code: sell.code, name: sell.name, pnl }
  }

  // reason별 성과 요약 (상위 10개)
  const topReasons = Object.entries(reasonPerformance)
    .map(([reason, stat]) => ({
      reason,
      wins: stat.wins,
      losses: stat.losses,
      winRate: (stat.wins + stat.losses) > 0 ? stat.wins / (stat.wins + stat.losses) : 0,
    }))
    .filter(r => r.wins + r.losses >= 2)
    .sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses))
    .slice(0, 10)

  const report: DailyReport = {
    date: today,
    totalOrders: todayLogs.filter(l => l.result === 'success').length,
    buyCount: buys.length,
    sellCount: sells.length,
    wins, losses,
    totalPnL: Math.round(totalPnL),
    winRate: (wins + losses) > 0 ? Math.round((wins / (wins + losses)) * 100) : 0,
    bestTrade, worstTrade,
    topReasons,
  }

  // 파일로 저장 (서버 전용)
  if (typeof window === 'undefined') {
    try {
      const fs = require('fs') as typeof import('fs')
      const reportDir = getReportDir()
      if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true })
      const filePath = require('path').join(reportDir, `${today}.json`)
      fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf-8')
      console.log(`[리포트] 일일 리포트 저장: ${filePath}`)
    } catch (err) {
      console.log(`[리포트] 저장 실패: ${err}`)
    }
  }

  return report
}

/** 주간 리포트 조회 (최근 7일) */
export const getWeeklyReport = (): { days: DailyReport[]; summary: { totalPnL: number; avgWinRate: number; totalOrders: number } } => {
  const days: DailyReport[] = []
  if (typeof window !== 'undefined') return { days: [], summary: { totalPnL: 0, avgWinRate: 0, totalOrders: 0 } }
  try {
    const fs = require('fs') as typeof import('fs')
    const pathMod = require('path') as typeof import('path')
    const reportDir = getReportDir()
    if (!fs.existsSync(reportDir)) return { days: [], summary: { totalPnL: 0, avgWinRate: 0, totalOrders: 0 } }
    const files = fs.readdirSync(reportDir)
      .filter((f: string) => f.endsWith('.json'))
      .sort()
      .slice(-7)

    for (const file of files) {
      const raw = fs.readFileSync(pathMod.join(reportDir, file), 'utf-8')
      days.push(JSON.parse(raw))
    }
  } catch { /* 무시 */ }

  const totalPnL = days.reduce((s, d) => s + d.totalPnL, 0)
  const totalOrders = days.reduce((s, d) => s + d.totalOrders, 0)
  const avgWinRate = days.length > 0
    ? Math.round(days.reduce((s, d) => s + d.winRate, 0) / days.length)
    : 0

  return { days, summary: { totalPnL, avgWinRate, totalOrders } }
}

const resetDailyIfNeeded = (mode: string) => {
  const ms = getMS(mode)
  const today = new Date().toISOString().split('T')[0] ?? ''
  if (today !== ms.resetDate) {
    // ★ 전일 리포트 자동 생성 (리셋 전에)
    if (ms.resetDate && tradeLogs.length > 0) {
      try { generateDailyReport() } catch (e) { console.log(`[리포트] 전일 리포트 생성 실패: ${e}`) }
    }
    ms.orderCount = 0
    ms.pnl = 0
    ms.lossLevel = 'normal'
    ms.resetDate = today
    for (const code of Object.keys(positionMetas)) delete positionMetas[code]
    for (const code of Object.keys(lossCooldown)) delete lossCooldown[code]
  }
}

export const getScalpingLogs = (): TradeLogEntry[] => [...tradeLogs].reverse()
export const getLastScan = (): ScanResult[] => lastScanResults
export const getDailyStats = () => {
  const ms = getMS(_activeMode)
  return { orders: ms.orderCount, pnl: ms.pnl, lossLevel: ms.lossLevel }
}
export const resetDailyStats = (mode?: string) => {
  const ms = getMS(mode ?? _activeMode)
  ms.orderCount = 0
  ms.pnl = 0
  ms.lossLevel = 'normal'
  for (const code of Object.keys(positionMetas)) delete positionMetas[code]
}

/** 장 운영시간 체크 (장전시간외 08:20 ~ 시간외단일가 18:00, NXT 포함) */
export const isMarketOpen = (): boolean => {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const hours = kst.getUTCHours()
  const minutes = kst.getUTCMinutes()
  const day = kst.getUTCDay()
  if (day === 0 || day === 6) return false
  const time = hours * 100 + minutes
  return time >= 820 && time <= 1800  // 08:20(장전시간외) ~ 18:00(시간외단일가)
}

/** 현재 시장 구간에 맞는 주문 유형 결정 */
const getOrderType = (): string => {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const time = kst.getUTCHours() * 100 + kst.getUTCMinutes()

  if (time >= 820 && time < 840) return 'pre-market'
  if (time >= 900 && time <= 1530) return 'market'
  if (time >= 1540 && time < 1600) return 'after-close'
  if (time >= 1600 && time <= 1800) return 'after-hours'
  return 'market'
}

/** 현재 KST 시각 (HHMM 정수) */
const getKSTTime = (): number => {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return kst.getUTCHours() * 100 + kst.getUTCMinutes()
}

/** 장 개시 첫 10분 (09:00~09:10) — 가격발견 구간, 변동성 극심 */
const isOpeningVolatility = (): boolean => {
  const time = getKSTTime()
  return time >= 900 && time < 910
}

/** 점심시간 (13:00~13:50) — 거래량 급감, 낮은 신호 품질 */
const isLunchTime = (): boolean => {
  const time = getKSTTime()
  return time >= 1300 && time < 1350
}

/** 장 마감 30분 (14:50~15:20) — 마감 물량 정리 구간 */
const isClosingPeriod = (): boolean => {
  const time = getKSTTime()
  return time >= 1450 && time <= 1520
}

/** 시간대별 점수 보정값 반환 */
const getTimeAdjustment = (): { scoreBonus: number; label: string } => {
  if (isOpeningVolatility()) return { scoreBonus: 10, label: '장개시10분(+10점)' }
  if (isLunchTime()) return { scoreBonus: 15, label: '점심시간(+15점)' }
  return { scoreBonus: 0, label: '' }
}

/** 에프터마켓 여부 (장후종가 + 시간외단일가 + NXT 애프터) */
const isAfterMarketTime = (): boolean => {
  const ot = getOrderType()
  return ot === 'after-close' || ot === 'after-hours'
}

/** 보유종목의 동적 익절/손절 기준 실시간 계산 (매수 시 저장값 없으면 분봉 ATR로) */
const getExitThresholds = async (code: string, currentPrice: number, mode?: TradingMode): Promise<{ tp: number; sl: number }> => {
  // 매수 시 저장한 기준이 있으면 사용
  const meta = positionMetas[code]
  if (meta) {
    return { tp: meta.takeProfitPercent, sl: meta.stopLossPercent }
  }

  // 없으면 분봉 ATR로 실시간 계산
  try {
    const rawBars = await getKisMinutePrices(code, mode)
    if (rawBars.length >= 15) {
      const bars5 = aggregateMinuteBars(rawBars, 5)
      const atr = calcMinuteATR(bars5, 10)
      const atrPct = currentPrice > 0 ? (atr / currentPrice) * 100 : 1
      const sl = Math.max(0.8, Math.min(1.5, atrPct * 1.5))  // 손절: 0.8~1.5%
      const tp = Math.max(sl * 1.5, Math.min(5, atrPct * 3), 2.0)  // 익절: 손절의 1.5배+, 최소 2%
      return { tp, sl }
    }
  } catch { /* fallback */ }

  // 기본값
  return { tp: 2.5, sl: 1.5 }
}

/** 잔고 조회 (최대 2회 재시도) */
const getBalanceSafe = async (mode: TradingMode): Promise<KisBalance | null> => {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await getKisBalance(mode)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`[스캘핑 ${logTime()}] 잔고 조회 실패 (${attempt}/2): ${msg}`)
      if (attempt < 2) await new Promise(r => setTimeout(r, 2000))
    }
  }
  return null
}

/** 자율 스캘핑 1사이클 실행 */
export const executeScalpingCycle = async (
  config: ScalpingConfig = DEFAULT_SCALPING,
  password?: string
): Promise<{ logs: TradeLogEntry[]; scan: ScanResult[] }> => {
  // 동시실행 방지
  if (cycleRunning) {
    console.log('[스캘핑] 이전 사이클 실행 중 — 스킵')
    return { logs: [], scan: lastScanResults }
  }
  cycleRunning = true

  try {
  return await _executeScalpingCycleInner(config, password)
  } finally {
    cycleRunning = false
  }
}

const _executeScalpingCycleInner = async (
  config: ScalpingConfig,
  password?: string
): Promise<{ logs: TradeLogEntry[]; scan: ScanResult[] }> => {
  _activeMode = config.mode ?? 'mock'
  const ms = getMS(_activeMode)
  resetDailyIfNeeded(_activeMode)
  const newLogs: TradeLogEntry[] = []

  // 일일 손실 레벨 판단 (단계별 리스크 관리 — 매도는 항상 실행)
  const prevLevel = ms.lossLevel
  ms.lossLevel = determineLossLevel(ms.pnl, config.budget)
  if (ms.lossLevel !== prevLevel) {
    console.log(`[스캘핑 ${logTime()}] 모드 전환: ${LOSS_LABELS[prevLevel]} → ${LOSS_LABELS[ms.lossLevel]} (일손익 ${ms.pnl.toLocaleString()}원)`)
  }
  if (ms.lossLevel !== 'normal') {
    console.log(`[스캘핑 ${logTime()}] 현재 ${LOSS_LABELS[ms.lossLevel]} — 일손익 ${ms.pnl.toLocaleString()}원`)
  }

  // 1. 잔고 조회 (실패해도 스캔은 계속)
  const balance = await getBalanceSafe(config.mode)

  // ─── 추세추종 모드 전용 청산 로직 ───
  const isTrendMode = config.tradingMode === 'trend'
  if (isTrendMode && balance) {
    for (const holding of balance.holdings) {
      if (holding.quantity <= 0) continue
      if (ms.orderCount >= config.maxDailyOrders) break

      const pnlPercent = holding.profitLossPercent
      const meta = positionMetas[holding.code]

      // 매수 메타가 없으면 현재가 기준으로 초기화 (수동 매수/재시작 후 대응)
      if (!meta) {
        positionMetas[holding.code] = {
          takeProfitPercent: 15, stopLossPercent: 7,
          buyScore: 0, buyReasons: [],
          highWaterMark: Math.max(holding.currentPrice, holding.avgPrice),
          buyPrice: holding.avgPrice,
          firstPartialSold: false, atrPercent: 2,
          buyTimestamp: Date.now(),
          priceTarget: 0, runnerActive: false, runnerTrailStop: 0, ma5: 0,
        }
      }
      const m = positionMetas[holding.code]!

      // 최고가 갱신 (trailing stop용)
      if (holding.currentPrice > m.highWaterMark) m.highWaterMark = holding.currentPrice

      // 1) 하드 손절: -7% 넘으면 강제 청산
      if (pnlPercent <= -7.0) {
        console.log(`[추세 ${logTime()}] ${holding.name} 하드 손절 ${pnlPercent.toFixed(1)}%`)
        const log = await executeSell(
          holding.code, holding.name, holding.quantity, holding.currentPrice,
          `🛑 추세 하드손절 ${pnlPercent.toFixed(1)}% (-7% 한도)`, config
        )
        if (log) { newLogs.push(log); if (log.result === 'success') { ms.pnl += holding.profitLoss; delete positionMetas[holding.code]; lossCooldown[holding.code] = Date.now() } }
        continue
      }

      // 2) 5일선 이탈 청산: 매수 후 수익 났다가 5일선 아래로 떨어지면 추세 종료
      //    (매수가 기준 -2% 이상 수익 경험 후 현재 5일선 하회 시만 적용 — 노이즈 필터)
      if (m.highWaterMark > m.buyPrice * 1.02 && m.ma5 > 0 && holding.currentPrice < m.ma5) {
        const ma5Pct = ((holding.currentPrice - m.ma5) / m.ma5 * 100).toFixed(1)
        console.log(`[추세 ${logTime()}] ${holding.name} 5일선 이탈 — 현재가 ${holding.currentPrice.toLocaleString()} < 5일선 ${m.ma5.toLocaleString()} (${ma5Pct}%) → 추세 종료`)
        const log = await executeSell(
          holding.code, holding.name, holding.quantity, holding.currentPrice,
          `📊 추세 종료 — 5일선(${m.ma5.toLocaleString()}원) 이탈 ${ma5Pct}%`, config
        )
        if (log) { newLogs.push(log); if (log.result === 'success') { ms.pnl += holding.profitLoss; delete positionMetas[holding.code]; lossCooldown[holding.code] = Date.now() } }
        continue
      }

      // 3) Trailing Stop: 최고가 대비 -5% 하락 시 청산 (추세 종료 신호)
      //    단, 매수가보다 +3% 이상 올랐을 때만 trailing 작동 (노이즈 필터)
      const peakGain = ((m.highWaterMark - m.buyPrice) / m.buyPrice) * 100
      const drawdownFromPeak = m.highWaterMark > 0
        ? ((m.highWaterMark - holding.currentPrice) / m.highWaterMark) * 100 : 0
      if (peakGain >= 3.0 && drawdownFromPeak >= 5.0) {
        console.log(`[추세 ${logTime()}] ${holding.name} 트레일링 스탑 — 최고 +${peakGain.toFixed(1)}% → 현재 +${pnlPercent.toFixed(1)}% (고점대비 -${drawdownFromPeak.toFixed(1)}%)`)
        const log = await executeSell(
          holding.code, holding.name, holding.quantity, holding.currentPrice,
          `📉 추세 트레일링 스탑 — 최고 +${peakGain.toFixed(1)}%에서 -${drawdownFromPeak.toFixed(1)}%`, config
        )
        if (log) { newLogs.push(log); if (log.result === 'success') { ms.pnl += holding.profitLoss; delete positionMetas[holding.code] } }
        continue
      }

      // 3) 큰 수익 확보 (+20% 이상 + 고점대비 -3%)
      if (peakGain >= 20 && drawdownFromPeak >= 3.0) {
        const log = await executeSell(
          holding.code, holding.name, holding.quantity, holding.currentPrice,
          `💰 추세 대박 확보 +${pnlPercent.toFixed(1)}% (고점 +${peakGain.toFixed(1)}%에서 -${drawdownFromPeak.toFixed(1)}%)`, config
        )
        if (log) { newLogs.push(log); if (log.result === 'success') { ms.pnl += holding.profitLoss; delete positionMetas[holding.code] } }
        continue
      }

      // 그 외: 홀드 (추세 지속 시 수익 극대화)
    }
  }

  // 2. 보유종목 → 트레일링 스탑 + 분할 익절 + 동적 익절/손절 (스캘핑 모드 전용)
  if (!isTrendMode && balance) {
    for (const holding of balance.holdings) {
      if (ms.orderCount >= config.maxDailyOrders) break
      if (holding.quantity <= 0) continue

      const pnlPercent = holding.profitLossPercent
      const meta = positionMetas[holding.code]
      let { tp, sl } = await getExitThresholds(holding.code, holding.currentPrice, config.mode)
      // 에프터마켓: 스프레드 넓으므로 익절/손절 기준 1.5배로 확대
      if (isAfterMarketTime()) { tp *= 1.5; sl *= 1.5 }

      // ★ 하드 손절: 어떤 경우에도 -3% 넘으면 즉시 매도 (갭 하락 보호)
      const HARD_STOP = -3.0
      if (pnlPercent <= HARD_STOP) {
        console.log(`[스캘핑 ${logTime()}] ${holding.name} 하드 손절 발동 — ${pnlPercent.toFixed(1)}% (한도 ${HARD_STOP}%)`)
        const log = await executeSell(
          holding.code, holding.name, holding.quantity, holding.currentPrice,
          `하드 손절 ${pnlPercent.toFixed(1)}% (갭 하락 보호 ${HARD_STOP}%)`,
          config
        )
        if (log) {
          newLogs.push(log)
          if (log.result === 'success') {
            ms.pnl += holding.profitLoss
            delete positionMetas[holding.code]
            lossCooldown[holding.code] = Date.now()
            console.log(`[쿨다운] ${holding.name} 하드손절 후 30분 재진입 차단`)
          }
        }
        continue
      }

      // ★ 트레일링 스탑: 매수 후 최고가 갱신 추적
      if (meta) {
        if (holding.currentPrice > meta.highWaterMark) {
          meta.highWaterMark = holding.currentPrice
        }
        const drawdownFromPeak = meta.highWaterMark > 0
          ? ((meta.highWaterMark - holding.currentPrice) / meta.highWaterMark) * 100
          : 0
        const trailThreshold = Math.max(sl, meta.atrPercent * 2) // ATR 기반 트레일 폭

        // ★ 러너 모드: 1차 익절 후 나머지 70%는 상한 없이 추세 추종
        if (meta.runnerActive) {
          // 최고가 갱신 시 트레일링 스탑 갱신 (ATR×3 또는 2% 중 큰 것)
          const runnerTrailPct = Math.max(meta.atrPercent * 3, 2.0)
          const newTrailStop = holding.currentPrice * (1 - runnerTrailPct / 100)
          if (newTrailStop > meta.runnerTrailStop) {
            meta.runnerTrailStop = newTrailStop
          }
          // 트레일링 스탑 도달 시 잔량 전량 청산
          if (meta.runnerTrailStop > 0 && holding.currentPrice <= meta.runnerTrailStop) {
            const peakPnl = ((meta.highWaterMark - meta.buyPrice) / meta.buyPrice) * 100
            const log = await executeSell(
              holding.code, holding.name, holding.quantity, holding.currentPrice,
              `🚀 러너 청산 — 최고 +${peakPnl.toFixed(1)}% (현재 +${pnlPercent.toFixed(1)}%, 트레일 ${runnerTrailPct.toFixed(1)}%)`,
              config
            )
            if (log) {
              newLogs.push(log)
              if (log.result === 'success') { ms.pnl += holding.profitLoss; delete positionMetas[holding.code] }
            }
          }
          continue
        }

        // 트레일링 발동: 수익 중이었다가 최고가 대비 trailThreshold% 하락
        if (pnlPercent > 0 && drawdownFromPeak >= trailThreshold && meta.highWaterMark > meta.buyPrice) {
          const peakPnl = ((meta.highWaterMark - meta.buyPrice) / meta.buyPrice) * 100
          const log = await executeSell(
            holding.code, holding.name, holding.quantity, holding.currentPrice,
            `📉 트레일링 스탑 — 최고 +${peakPnl.toFixed(1)}%에서 -${drawdownFromPeak.toFixed(1)}% 하락 (현재 +${pnlPercent.toFixed(1)}%)`,
            config
          )
          if (log) {
            newLogs.push(log)
            if (log.result === 'success') { ms.pnl += holding.profitLoss; delete positionMetas[holding.code] }
          }
          continue
        }

        // ★ 1차 분할 익절: 저항선 목표가 도달 시 30% 매도 → 나머지 70% 러너 모드 전환
        if (!meta.firstPartialSold && pnlPercent >= tp && holding.quantity >= 2) {
          const partialQty = Math.floor(holding.quantity * 0.3)
          if (partialQty > 0) {
            const targetPrice = meta.priceTarget > 0 ? `(목표가 ${meta.priceTarget.toLocaleString()}원)` : ''
            console.log(`[스캘핑 ${logTime()}] ${holding.name} 1차 익절 + 러너 전환 — +${pnlPercent.toFixed(1)}% ${targetPrice} → ${partialQty}주 매도, ${holding.quantity - partialQty}주 러너`)
            const log = await executeSell(
              holding.code, holding.name, partialQty, holding.currentPrice,
              `🎯 1차 익절 +${pnlPercent.toFixed(1)}% (${partialQty}주 청산, 나머지 ${holding.quantity - partialQty}주 러너 추세 추종)`,
              config
            )
            if (log) {
              newLogs.push(log)
              if (log.result === 'success') {
                meta.firstPartialSold = true
                meta.runnerActive = true
                meta.runnerTrailStop = holding.currentPrice * (1 - Math.max(meta.atrPercent * 3, 2.0) / 100)
                ms.pnl += Math.round(holding.profitLoss * (partialQty / holding.quantity))
              }
            }
            continue
          }
        }
      }

      // 전량 익절: 1주만 보유 중이거나 러너 미활성 상태에서 tp 도달
      if (pnlPercent >= tp && !(meta?.runnerActive)) {
        const log = await executeSell(
          holding.code, holding.name, holding.quantity, holding.currentPrice,
          `${meta?.firstPartialSold ? '2차 ' : ''}익절 +${pnlPercent.toFixed(1)}% (목표 +${tp.toFixed(1)}%)`,
          config
        )
        if (log) {
          newLogs.push(log)
          if (log.result === 'success') {
            ms.pnl += holding.profitLoss
            delete positionMetas[holding.code]
          }
        }
      }
      // 손절 (ATR 기반, 하드스탑 전)
      else if (pnlPercent <= -sl) {
        const log = await executeSell(
          holding.code, holding.name, holding.quantity, holding.currentPrice,
          `🛑 손절 ${pnlPercent.toFixed(1)}% (한도 -${sl.toFixed(1)}%, ATR 기반)`,
          config
        )
        if (log) {
          newLogs.push(log)
          if (log.result === 'success') {
            ms.pnl += holding.profitLoss
            delete positionMetas[holding.code]
            lossCooldown[holding.code] = Date.now()
            console.log(`[쿨다운] ${holding.name} 손절 후 30분 재진입 차단`)
          }
        }
      }
      // 추세 악화 시 조기 매도 (최소 10분 보유 후에만)
      else if (pnlPercent < 0 && pnlPercent > -sl) {
        const meta = positionMetas[holding.code]
        if (meta && meta.buyScore < 35 && pnlPercent <= -1.5) {
          const holdMs = Date.now() - (meta.buyTimestamp || 0)
          const holdMinutes = Math.floor(holdMs / 60000)
          if (holdMs >= 10 * 60 * 1000) {
            const log = await executeSell(
              holding.code, holding.name, holding.quantity, holding.currentPrice,
              `⚠️ 약매수 + 하락 → 조기 탈출 (${pnlPercent.toFixed(1)}%, 보유 ${holdMinutes}분)`,
              config
            )
            if (log) {
              newLogs.push(log)
              if (log.result === 'success') {
                ms.pnl += holding.profitLoss
                delete positionMetas[holding.code]
                lossCooldown[holding.code] = Date.now()
              }
            }
          } else {
            console.log(`[스캘핑 ${logTime()}] ${holding.name} 홀딩 유지 — 보유 ${holdMinutes}분 (최소 10분)`)
          }
        }
      }
    }
  }

  // 3. 시장 스캔 — 매수 기회 탐색
  const scanResults = await scanMarket(config.mode, config.tradingMode ?? 'scalping')
  lastScanResults = scanResults

  // 4. 매수 실행 (잔고 조회 필요)
  const freshBalance = balance ?? await getBalanceSafe(config.mode)

  // ─── 최소점수 고정 (시간대 보정 없음) ───
  const afterMarket = isAfterMarketTime()
  let effectiveMinScore = config.minScore  // 항상 25점 고정
  let effectiveMaxPerTrade = config.maxPerTrade
  let effectiveMaxPositions = afterMarket ? Math.min(config.maxPositions, 3) : config.maxPositions

  if (afterMarket) {
    console.log(`[스캘핑 ${logTime()}] 에프터마켓 — 최소점수 ${effectiveMinScore}점, 최대 ${effectiveMaxPositions}종목`)
  }

  // ─── 공격 모드 보정 ───
  const isAggressive = config.riskLevel === 'aggressive'
  if (isAggressive) {
    effectiveMinScore = Math.max(10, effectiveMinScore - 10)
    effectiveMaxPerTrade = Math.round(effectiveMaxPerTrade * 1.5)
    effectiveMaxPositions += 3
    console.log(`[스캘핑 ${logTime()}] 공격 모드 ON — 최소점수 ${effectiveMinScore}, 건당 ${effectiveMaxPerTrade.toLocaleString()}원, 최대 ${effectiveMaxPositions}종목`)
  }

  // ─── 손실 레벨별 매수 제한 ───
  let maxNewBuysThisCycle = Infinity
  let allowAddBuy = true
  if (ms.lossLevel === 'full-stop') {
    console.log(`[스캘핑 ${logTime()}] 완전 중단 모드 — 신규 매수 차단 (보유종목 매도/관리는 계속)`)
  } else if (ms.lossLevel === 'recovery') {
    effectiveMinScore += 20
    effectiveMaxPerTrade = Math.round(effectiveMaxPerTrade * 0.5)
    maxNewBuysThisCycle = 1
    allowAddBuy = false
    console.log(`[스캘핑 ${logTime()}] 복구 모드 매수 제한 — 최소점수 ${effectiveMinScore}, 건당 ${effectiveMaxPerTrade.toLocaleString()}원, 최대 1건, 추가매수 X`)
  } else if (ms.lossLevel === 'conservative') {
    effectiveMinScore += 10
    effectiveMaxPerTrade = Math.round(effectiveMaxPerTrade * 0.7)
    effectiveMaxPositions = Math.min(effectiveMaxPositions, 3)
    console.log(`[스캘핑 ${logTime()}] 보수적 모드 매수 제한 — 최소점수 ${effectiveMinScore}, 건당 ${effectiveMaxPerTrade.toLocaleString()}원, 최대 ${effectiveMaxPositions}종목`)
  }

  // ★ 마감 30분: 스캘핑 모드만 적용 — 추세 모드는 오버나이트 보유가 전략의 핵심
  if (!isTrendMode && isClosingPeriod() && balance) {
    for (const holding of balance.holdings) {
      if (holding.quantity <= 0 || ms.orderCount >= config.maxDailyOrders) continue
      const pct = holding.profitLossPercent
      if (pct >= 1.0) {
        // 충분한 수익 → 보유 (갭 상승 시 추가 수익)
        console.log(`[스캘핑 ${logTime()}] 장마감임박 — ${holding.name} +${pct.toFixed(1)}% 수익 보유 유지 (갭 상승 대기)`)
        continue
      }
      // 손실 or 소폭수익(<1%): 청산 — 수수료 고려 시 본전이하, 갭 하락 리스크 불필요
      const reason = pct >= 0
        ? `⏰ 장마감 청산 +${pct.toFixed(1)}% (수수료 미만, 갭 리스크 제거)`
        : `⏰ 장마감 손실 청산 ${pct.toFixed(1)}% (오버나이트 갭 하락 방지)`
      console.log(`[스캘핑 ${logTime()}] 장마감임박 — ${holding.name} ${pct.toFixed(1)}% → 청산`)
      const log = await executeSell(
        holding.code, holding.name, holding.quantity, holding.currentPrice,
        reason, config
      )
      if (log) { newLogs.push(log); if (log.result === 'success') { ms.pnl += holding.profitLoss; delete positionMetas[holding.code] } }
    }
  }

  if (freshBalance && ms.lossLevel !== 'full-stop') {
    const currentPositionCount = freshBalance.holdings.filter(h => h.quantity > 0).length
    let positionSlots = effectiveMaxPositions - currentPositionCount
    // 매수가능조회 API로 실제 주문가능금액 조회 (잔고조회의 예수금과 다를 수 있음)
    let freshCash = freshBalance.cashBalance
    try {
      const orderableAmt = await getKisOrderableCash(config.mode)
      if (orderableAmt > 0) freshCash = orderableAmt
    } catch { /* 실패 시 cashBalance 사용 */ }
    freshCash = Math.min(freshCash, config.budget)
    let newBuyCount = 0

    // ─── 4A. 신규 매수 ───
    // ★ 과거 성과 학습: 승률 낮은 패턴(< 40%) 감점 → 필터링
    let buySignals = scanResults
      .map(s => {
        const winRate = getReasonWinRate(s.reasons)
        if (winRate !== null && winRate < 0.4) {
          return { ...s, score: s.score - 10, reasons: [...s.reasons, `승률 ${(winRate * 100).toFixed(0)}% 감점`] }
        }
        if (winRate !== null && winRate > 0.7) {
          return { ...s, score: s.score + 5, reasons: [...s.reasons, `승률 ${(winRate * 100).toFixed(0)}% 가점`] }
        }
        return s
      })
      .filter(s => s.signal === 'BUY' && s.score >= effectiveMinScore)

    // ★ 복구 모드: 외국인/기관 순매수 종목만 허용
    if (ms.lossLevel === 'recovery') {
      buySignals = buySignals.filter(s => {
        const hasSupply = (s.foreignNetBuy ?? 0) > 0 || (s.institutionNetBuy ?? 0) > 0
        if (!hasSupply) console.log(`[스캘핑 ${logTime()}] 복구 모드 — ${s.name}(${s.score}점) 수급 미달로 제외`)
        return hasSupply
      })
    }

    const newBuyTargets: typeof scanResults = []
    const addBuyTargets: { scan: (typeof scanResults)[number]; holding: (typeof freshBalance.holdings)[number] }[] = []

    for (const s of buySignals) {
      const alreadyHeld = freshBalance.holdings.find(h => h.code === s.code && h.quantity > 0)
      if (alreadyHeld) {
        // 에프터마켓에서도 추가매수 허용 (조건은 동일)
        // 추가 매수 판단: 불타기 / 물타기
        const totalInvested = alreadyHeld.avgPrice * alreadyHeld.quantity
        const maxPerStock = config.maxPerTrade * 2 // 1종목 최대 건당금액의 2배
        const canAddMore = totalInvested < maxPerStock

        if (!canAddMore) {
          console.log(`[스캘핑 ${logTime()}] ${s.name}(${s.score}점) 추가매수 불가 — 이미 ${totalInvested.toLocaleString()}원 투자 (한도 ${maxPerStock.toLocaleString()}원)`)
        } else if (s.score >= 40 && alreadyHeld.profitLossPercent > 0) {
          // 불타기: 강한 신호 + 수익 중 → 추세 추종
          console.log(`[스캘핑 ${logTime()}] ${s.name}(${s.score}점) 🔥 불타기 대상 — 수익 ${alreadyHeld.profitLossPercent.toFixed(1)}% + 강매수 신호`)
          addBuyTargets.push({ scan: s, holding: alreadyHeld })
        } else if (s.score >= 35 && alreadyHeld.profitLossPercent < -1 && alreadyHeld.profitLossPercent > -3) {
          // 물타기: 소폭 하락(-1%~-3%) + 강한 매수 신호 → 평단가 낮추기
          console.log(`[스캘핑 ${logTime()}] ${s.name}(${s.score}점) 💧 물타기 대상 — 하락 ${alreadyHeld.profitLossPercent.toFixed(1)}% + 매수 신호 유지`)
          addBuyTargets.push({ scan: s, holding: alreadyHeld })
        } else {
          console.log(`[스캘핑 ${logTime()}] ${s.name}(${s.score}점) 보유 중(${alreadyHeld.quantity}주, ${alreadyHeld.profitLossPercent.toFixed(1)}%) — 추가매수 조건 미달`)
        }
      } else {
        newBuyTargets.push(s)
      }
    }

    if (positionSlots <= 0 && newBuyTargets.length > 0) {
      console.log(`[스캘핑 ${logTime()}] 포지션 슬롯 없음 (${currentPositionCount}/${effectiveMaxPositions} 보유 중) — 신규 매수 불가`)
    }
    if (freshCash < effectiveMaxPerTrade * 0.3) {
      console.log(`[스캘핑 ${logTime()}] 현금 부족 (${freshCash.toLocaleString()}원 < 최소 ${Math.round(effectiveMaxPerTrade * 0.3).toLocaleString()}원)`)
    }

    // 신규 종목 매수
    let balanceExhausted = false
    const failedCodes = new Set<string>()
    for (const target of newBuyTargets) {
      if (ms.orderCount >= config.maxDailyOrders) {
        console.log(`[스캘핑 ${logTime()}] 일일 주문 한도 도달 (${ms.orderCount}/${config.maxDailyOrders})`)
        break
      }
      if (positionSlots <= 0) break
      if (freshCash < effectiveMaxPerTrade * 0.3) break
      if (newBuyCount >= maxNewBuysThisCycle) {
        console.log(`[스캘핑 ${logTime()}] ${LOSS_LABELS[ms.lossLevel]} — 이번 사이클 매수 한도 도달 (${newBuyCount}건)`)
        break
      }

      // 잔고 부족 시 남은 매수 전부 스킵
      if (balanceExhausted) continue
      // 이미 실패한 종목은 재시도하지 않음
      if (failedCodes.has(target.code)) continue

      // ★ 손절 쿨다운 체크: 최근 30분 내 손절된 종목은 재진입 차단
      const lastLoss = lossCooldown[target.code]
      if (lastLoss && (Date.now() - lastLoss) < LOSS_COOLDOWN_MS) {
        const remainMin = Math.ceil((LOSS_COOLDOWN_MS - (Date.now() - lastLoss)) / 60000)
        console.log(`[스캘핑 ${logTime()}] ${target.name} 손절 쿨다운 중 (${remainMin}분 남음) — 재진입 대기`)
        continue
      }

      // ETF/레버리지/인버스 매수 차단
      if (isETF(target.name)) {
        console.log(`[스캘핑 ${logTime()}] ${target.name} — ETF/레버리지/인버스 매수 차단`)
        continue
      }

      // ★ 섹터 한도: 동일 섹터 MAX_PER_SECTOR 종목 초과 시 매수 제한
      const targetSector = SECTOR_MAP[target.code]
      if (targetSector) {
        const sectorCount = freshBalance.holdings.filter(h =>
          h.quantity > 0 && SECTOR_MAP[h.code] === targetSector
        ).length
        const sectorLimit = isAggressive ? MAX_PER_SECTOR + 1 : MAX_PER_SECTOR
      if (sectorCount >= sectorLimit) {
          console.log(`[스캘핑 ${logTime()}] ${target.name} — ${targetSector} 섹터 이미 ${sectorCount}종목 보유 (한도 ${MAX_PER_SECTOR})`)
          continue
        }
      }

      // ★ ATR 기반 포지션 사이징: 변동성 큰 종목은 투자금 축소
      // ★ 점수 기반 포지션 사이징 (추세 모드: 고확신일수록 더 투자)
      // 스캘핑 모드: 기존 maxPerTrade 상한 유지 / 추세 모드: 점수 비례로 가용 현금 비중 결정
      let investAmount: number
      if (isTrendMode) {
        const scoreRatio =
          target.score >= 90 ? 0.7 :
          target.score >= 80 ? 0.5 :
          target.score >= 70 ? 0.35 : 0.2
        investAmount = Math.floor(freshCash * scoreRatio)
        console.log(`[추세 ${logTime()}] ${target.name} 점수 ${target.score}점 → 가용 현금의 ${(scoreRatio * 100).toFixed(0)}% = ${investAmount.toLocaleString()}원 투자`)
      } else {
        const riskBudget = config.budget * 0.01
        const atrAdjustedMax = target.atrPercent > 0
          ? Math.min(effectiveMaxPerTrade, riskBudget / (target.atrPercent / 100))
          : effectiveMaxPerTrade
        investAmount = Math.min(atrAdjustedMax, freshCash * 0.5)
      }
      const quantity = Math.floor(investAmount / target.price)
      if (quantity <= 0) {
        console.log(`[스캘핑 ${logTime()}] ${target.name} 수량 0 — 가격 ${target.price.toLocaleString()}원 > 투자금 ${investAmount.toLocaleString()}원 (ATR ${target.atrPercent.toFixed(1)}%)`)
        continue
      }

      const log = await executeBuy(
        target.code, target.name, quantity, target.price,
        `[${target.score}점] ${target.reasons.join(' / ')} · 익절 ${target.takeProfitPercent}% 손절 -${target.stopLossPercent}%`,
        config
      )
      if (log) {
        newLogs.push(log)
        if (log.result === 'success') {
          positionSlots--
          newBuyCount++
          freshCash -= quantity * target.price
          // 공격 모드: 익절/손절 1.5배 확대
          const tpMult = isAggressive ? 1.5 : 1
          const slMult = isAggressive ? 1.5 : 1
          positionMetas[target.code] = {
            takeProfitPercent: Math.round(target.takeProfitPercent * tpMult * 10) / 10,
            stopLossPercent: Math.round(target.stopLossPercent * slMult * 10) / 10,
            buyScore: target.score,
            buyReasons: target.reasons,
            highWaterMark: target.price,
            buyPrice: target.price,
            firstPartialSold: false,
            atrPercent: target.atrPercent,
            buyTimestamp: Date.now(),
            priceTarget: target.priceTarget ?? Math.round(target.price * (1 + target.takeProfitPercent / 100)),
            runnerActive: false,
            runnerTrailStop: 0,
            ma5: target.vwap > 0 ? target.vwap : 0, // 추세 모드: 매수 시 vwap을 임시 5일선 대용 (이후 갱신)
          }
        } else {
          failedCodes.add(target.code)
          // 잔고 부족 에러 감지 → 남은 매수 전부 스킵
          const errMsg = log.message ?? ''
          if (errMsg.includes('주문가능금액') || errMsg.includes('주문 가능 금액')) {
            balanceExhausted = true
            console.log(`[스캘핑 ${logTime()}] 잔고 부족 — 남은 매수 스킵`)
          }
        }
      }
    }

    // ─── 4B. 추가 매수 (불타기/물타기) — 복구/완전중단 모드에서는 차단 ───
    if (!allowAddBuy && addBuyTargets.length > 0) {
      console.log(`[스캘핑 ${logTime()}] ${LOSS_LABELS[ms.lossLevel]} — 추가매수(불타기/물타기) 차단`)
    }
    for (const { scan: target, holding } of (allowAddBuy ? addBuyTargets : [])) {
      if (ms.orderCount >= config.maxDailyOrders) break
      if (freshCash < config.maxPerTrade * 0.3) break
      if (balanceExhausted) continue
      if (failedCodes.has(target.code)) continue
      if (isETF(target.name)) continue // ETF 추가매수도 차단

      const totalInvested = holding.avgPrice * holding.quantity
      const maxPerStock = config.maxPerTrade * 2
      const remainBudget = maxPerStock - totalInvested
      const investAmount = Math.min(config.maxPerTrade * 0.5, remainBudget, freshCash * 0.3) // 추가매수는 보수적 (50%)
      const quantity = Math.floor(investAmount / target.price)
      if (quantity <= 0) continue

      const isScaleUp = holding.profitLossPercent > 0
      const label = isScaleUp ? '🔥 불타기' : '💧 물타기'
      const log = await executeBuy(
        target.code, target.name, quantity, target.price,
        `${label} [${target.score}점] 기존 ${holding.quantity}주(${holding.profitLossPercent.toFixed(1)}%) + ${quantity}주 추가`,
        config
      )
      if (log) {
        newLogs.push(log)
        if (log.result === 'success') {
          freshCash -= quantity * target.price  // 추가매수 성공 시 잔고 차감
          // 추가매수 시 익절/손절 기준 업데이트 (더 강한 신호면 기준 갱신)
          const prevMeta = positionMetas[target.code]
          if (!prevMeta || target.score > prevMeta.buyScore) {
            positionMetas[target.code] = {
              takeProfitPercent: target.takeProfitPercent,
              stopLossPercent: target.stopLossPercent,
              buyScore: target.score,
              buyReasons: target.reasons,
              highWaterMark: prevMeta?.highWaterMark ?? target.price,
              buyPrice: prevMeta?.buyPrice ?? target.price,
              firstPartialSold: prevMeta?.firstPartialSold ?? false,
              atrPercent: target.atrPercent,
              buyTimestamp: prevMeta?.buyTimestamp ?? Date.now(),
              priceTarget: target.priceTarget ?? prevMeta?.priceTarget ?? 0,
              runnerActive: prevMeta?.runnerActive ?? false,
              runnerTrailStop: prevMeta?.runnerTrailStop ?? 0,
              ma5: prevMeta?.ma5 ?? 0,
            }
          }
        } else {
          failedCodes.add(target.code)
          const errMsg = log.message ?? ''
          if (errMsg.includes('주문가능금액') || errMsg.includes('주문 가능 금액')) {
            balanceExhausted = true
            console.log(`[스캘핑 ${logTime()}] 잔고 부족 — 남은 매수 스킵`)
          }
        }
      }
    }
  } else if (ms.lossLevel === 'full-stop') {
    console.log('[스캘핑] 완전 중단 모드 — 매수 차단, 보유종목 관리만 실행')
  } else {
    console.log('[스캘핑] 잔고 조회 불가 — 매수 건너뜀 (스캔 결과만 반환)')
  }

  while (tradeLogs.length > 500) tradeLogs.shift()

  return { logs: newLogs, scan: scanResults }
}

// ─── 매수/매도 실행 헬퍼 ────────────────────────────

/** NXT 재시도 가능한 에러인지 판별 (KRX 시간외단일가 불가 → NXT로 재시도) */
const isNxtRetryable = (errorMsg: string): boolean =>
  errorMsg.includes('NXT거래종목') || errorMsg.includes('시간외단일가 주문불가')

/** 현재 NXT 애프터마켓 시간인지 (15:30~20:00) */
const isNxtAfterMarket = (): boolean => {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const time = kst.getUTCHours() * 100 + kst.getUTCMinutes()
  return time >= 1530 && time <= 2000
}

const executeBuy = async (
  code: string, name: string, quantity: number, price: number,
  reason: string, config: ScalpingConfig
): Promise<TradeLogEntry | null> => {
  const orderType = getOrderType()
  const needsPrice = orderType === 'after-hours' || orderType === 'after-close'

  // 시간외 주문 시 현재가 조회 (스캔가격은 일봉 종가라 호가 범위 밖일 수 있음)
  let orderPrice = price
  let orderQty = quantity
  if (needsPrice) {
    try {
      const realPrice = await getKisCurrentPrice(code, config.mode)
      if (realPrice > 0) {
        const origInvest = quantity * price
        orderPrice = realPrice
        orderQty = Math.floor(origInvest / realPrice)
        if (orderQty <= 0) orderQty = 1
        console.log(`[시간외 ${logTime()}] ${name} 현재가 ${realPrice.toLocaleString()}원 → ${orderQty}주 × ${orderPrice.toLocaleString()}원 (투자금 ${origInvest.toLocaleString()}원)`)
      }
    } catch (e) {
      console.log(`[시간외 ${logTime()}] ${name} 현재가 조회 실패 → 스캔가격 ${price.toLocaleString()}원 사용: ${e instanceof Error ? e.message : e}`)
    }
  }

  try {
    const result = await placeKisOrder({
      side: 'buy', code, quantity: orderQty,
      price: needsPrice ? orderPrice : undefined,
      orderType: orderType as 'market' | 'limit' | 'pre-market' | 'after-close' | 'after-hours',
    }, config.mode)

    const isSuccess = result.status === 'executed'
    if (isSuccess) getMS(config.mode ?? 'mock').orderCount++
    const log: TradeLogEntry = {
      id: `${Date.now()}-${code}-buy`,
      timestamp: new Date().toISOString(),
      strategy: '자율 스캘핑',
      action: 'BUY', code, name, quantity, price, reason,
      result: isSuccess ? 'success' : 'failed',
      message: result.message,
    }
    tradeLogs.push(log)
    return log
  } catch (error) {
    const msg = error instanceof Error ? error.message : '주문 오류'

    // KRX 시간외단일가 불가 → NXT 애프터마켓으로 재시도 (실전만, 모의투자 NXT 불가)
    if (isNxtRetryable(msg) && isNxtAfterMarket() && config.mode === 'real') {
      try {
        // NXT 현재가 조회 → 정확한 가격으로 지정가 주문 (스캔가격은 KRX 기준이라 하한가 미달 가능)
        const nxtPrice = await getKisCurrentPrice(code, config.mode)
        // 원래 매수 수량 기준 유지 (maxPerTrade 전액 사용 방지)
        const nxtInvest = Math.min(quantity * price, config.maxPerTrade)
        const nxtQty = Math.floor(nxtInvest / nxtPrice)
        if (nxtQty <= 0) {
          throw new Error(`NXT 현재가 ${nxtPrice}원 > 투자금 ${nxtInvest}원`)
        }
        console.log(`[스캘핑 ${logTime()}] ${name} KRX 시간외 불가 → NXT 지정가(현재가 ${nxtPrice}원, ${nxtQty}주)로 재시도`)

        const nxtResult = await placeKisOrder({
          side: 'buy', code, quantity: nxtQty,
          price: nxtPrice,
          orderType: 'limit',
          exchange: 'NXT',
        }, config.mode)

        const nxtSuccess = nxtResult.status === 'executed'
        if (nxtSuccess) getMS(config.mode ?? 'mock').orderCount++
        const log: TradeLogEntry = {
          id: `${Date.now()}-${code}-buy-nxt`,
          timestamp: new Date().toISOString(),
          strategy: '자율 스캘핑',
          action: 'BUY', code, name, quantity: nxtQty, price: nxtPrice,
          reason: reason + ' (NXT)',
          result: nxtSuccess ? 'success' : 'failed',
          message: `[NXT] ${nxtResult.message}`,
        }
        tradeLogs.push(log)
        return log
      } catch (nxtErr) {
        const nxtMsg = nxtErr instanceof Error ? nxtErr.message : 'NXT 주문 오류'
        console.log(`[스캘핑 ${logTime()}] ${name} NXT도 실패: ${nxtMsg}`)
        const log: TradeLogEntry = {
          id: `${Date.now()}-${code}-buy-nxt-fail`,
          timestamp: new Date().toISOString(),
          strategy: '자율 스캘핑',
          action: 'BUY', code, name, quantity, price, reason,
          result: 'failed', message: `KRX: ${msg} → NXT: ${nxtMsg}`,
        }
        tradeLogs.push(log)
        return log
      }
    }

    const log: TradeLogEntry = {
      id: `${Date.now()}-${code}-buy-fail`,
      timestamp: new Date().toISOString(),
      strategy: '자율 스캘핑',
      action: 'BUY', code, name, quantity, price, reason,
      result: 'failed', message: msg,
    }
    tradeLogs.push(log)
    return log
  }
}

const executeSell = async (
  code: string, name: string, quantity: number, price: number,
  reason: string, config: ScalpingConfig
): Promise<TradeLogEntry | null> => {
  const orderType = getOrderType()
  const needsPrice = orderType === 'after-hours' || orderType === 'after-close'

  try {
    const result = await placeKisOrder({
      side: 'sell', code, quantity,
      price: needsPrice ? price : undefined,
      orderType: orderType as 'market' | 'limit' | 'pre-market' | 'after-close' | 'after-hours',
    }, config.mode)

    const sellSuccess = result.status === 'executed'
    if (sellSuccess) {
      getMS(config.mode ?? 'mock').orderCount++
      // ★ 거래 성과 학습: 매도 성공 시 매수 당시 reason별 승률 기록
      const meta = positionMetas[code]
      if (meta) {
        const pnl = (price - meta.buyPrice) * quantity
        recordTradeOutcome(meta.buyReasons, pnl)
      }
    }
    const log: TradeLogEntry = {
      id: `${Date.now()}-${code}-sell`,
      timestamp: new Date().toISOString(),
      strategy: '자율 스캘핑',
      action: 'SELL', code, name, quantity, price, reason,
      result: sellSuccess ? 'success' : 'failed',
      message: result.message,
    }
    tradeLogs.push(log)
    return log
  } catch (error) {
    const msg = error instanceof Error ? error.message : '주문 오류'

    // KRX 시간외단일가 불가 → NXT 애프터마켓으로 재시도
    if (isNxtRetryable(msg) && isNxtAfterMarket() && config.mode === 'real') {
      try {
        const nxtPrice = await getKisCurrentPrice(code, config.mode)
        console.log(`[스캘핑 ${logTime()}] ${name} 매도 KRX 불가 → NXT 지정가(현재가 ${nxtPrice}원)로 재시도`)
        const nxtResult = await placeKisOrder({
          side: 'sell', code, quantity,
          price: nxtPrice,
          orderType: 'limit',
          exchange: 'NXT',
        }, config.mode)

        const nxtSellOk = nxtResult.status === 'executed'
        if (nxtSellOk) getMS(config.mode ?? 'mock').orderCount++
        const log: TradeLogEntry = {
          id: `${Date.now()}-${code}-sell-nxt`,
          timestamp: new Date().toISOString(),
          strategy: '자율 스캘핑',
          action: 'SELL', code, name, quantity, price,
          reason: reason + ' (NXT)',
          result: nxtSellOk ? 'success' : 'failed',
          message: `[NXT] ${nxtResult.message}`,
        }
        tradeLogs.push(log)
        return log
      } catch (nxtErr) {
        const nxtMsg = nxtErr instanceof Error ? nxtErr.message : 'NXT 주문 오류'
        const log: TradeLogEntry = {
          id: `${Date.now()}-${code}-sell-nxt-fail`,
          timestamp: new Date().toISOString(),
          strategy: '자율 스캘핑',
          action: 'SELL', code, name, quantity, price, reason,
          result: 'failed', message: `KRX: ${msg} → NXT: ${nxtMsg}`,
        }
        tradeLogs.push(log)
        return log
      }
    }

    const log: TradeLogEntry = {
      id: `${Date.now()}-${code}-sell-fail`,
      timestamp: new Date().toISOString(),
      strategy: '자율 스캘핑',
      action: 'SELL', code, name, quantity, price, reason,
      result: 'failed', message: msg,
    }
    tradeLogs.push(log)
    return log
  }
}
