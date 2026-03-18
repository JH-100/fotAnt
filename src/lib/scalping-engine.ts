// 자율 스캘핑 엔진 — 종목 탐색 + 동적 익절/손절 전부 봇이 결정
import type { KisBalance } from '@/types/kis'
import { getKisBalance, getKisMinutePrices, aggregateMinuteBars, placeKisOrder, getKisCurrentPrice } from './kis-api'
import type { TradingMode } from './kis-api'
import { scanMarket, type ScanResult } from './stock-scanner'
import { calcMinuteATR } from './indicators'
import type { TradeLogEntry } from './strategies/types'

// ETF/레버리지/인버스 필터 (파생상품 ETF 거래신청 필요 → 매수 차단)
const ETF_PREFIXES = ['KODEX', 'TIGER', 'KOSEF', 'KBSTAR', 'ARIRANG', 'SOL', 'ACE', 'HANARO']
const isETF = (name: string): boolean =>
  ETF_PREFIXES.some(p => name.startsWith(p)) || name.includes('레버리지') || name.includes('인버스')

export interface ScalpingConfig {
  budget: number              // 총 투자 한도 (원)
  maxPerTrade: number         // 건당 최대 금액 (원)
  maxPositions: number        // 동시 보유 종목 수
  maxDailyOrders: number      // 일일 최대 주문
  minScore: number            // 최소 매수 점수 (기본 25)
  mode: TradingMode           // 실전/모의
}

export const DEFAULT_SCALPING: ScalpingConfig = {
  budget: 500000,
  maxPerTrade: 100000,
  maxPositions: 5,
  maxDailyOrders: 20,
  minScore: 25,
  mode: 'mock',
}

// ─── 포지션별 익절/손절 기준 (매수 시 스캔결과에서 저장) ──
interface PositionMeta {
  takeProfitPercent: number
  stopLossPercent: number
  buyScore: number
  buyReasons: string[]
}
const positionMetas: Record<string, PositionMeta> = {}

// ─── 엔진 상태 (메모리) ────────────────────────────
let dailyOrderCount = 0
let lastResetDate = ''
let dailyPnL = 0
const tradeLogs: TradeLogEntry[] = []
let lastScanResults: ScanResult[] = []
let cycleRunning = false  // 동시실행 방지 플래그

// 외부에서 로그/통계 복원용 (서버 스케줄러가 파일에서 읽어서 주입)
export const restoreLogs = (logs: TradeLogEntry[]) => {
  tradeLogs.length = 0
  tradeLogs.push(...logs)
}
export const restoreStats = (stats: { orders: number; pnl: number; date: string }) => {
  dailyOrderCount = stats.orders
  dailyPnL = stats.pnl
  lastResetDate = stats.date
}

const resetDailyIfNeeded = () => {
  const today = new Date().toISOString().split('T')[0] ?? ''
  if (today !== lastResetDate) {
    dailyOrderCount = 0
    dailyPnL = 0
    lastResetDate = today
    // 전일 positionMetas 중 현재 미보유 종목 정리 (보유 중인 건 유지)
    for (const code of Object.keys(positionMetas)) {
      // 일일 리셋 시 오래된 메타 정리 — 보유 확인은 잔고 조회 후에 하므로 여기선 전부 리셋
      delete positionMetas[code]
    }
  }
}

export const getScalpingLogs = (): TradeLogEntry[] => [...tradeLogs].reverse()
export const getLastScan = (): ScanResult[] => lastScanResults
export const getDailyStats = () => ({ orders: dailyOrderCount, pnl: dailyPnL })

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
      return {
        tp: Math.max(0.5, Math.min(4, atrPct * 3)),
        sl: Math.max(0.3, Math.min(2.5, atrPct * 2)),
      }
    }
  } catch { /* fallback */ }

  // 기본값 (스캘핑용 타이트)
  return { tp: 1.5, sl: 1 }
}

/** 잔고 조회 (최대 2회 재시도) */
const getBalanceSafe = async (mode: TradingMode): Promise<KisBalance | null> => {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await getKisBalance(mode)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`[스캘핑] 잔고 조회 실패 (${attempt}/2): ${msg}`)
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
  resetDailyIfNeeded()
  const newLogs: TradeLogEntry[] = []

  // 일일 손실 한도 체크 (-5% 이상 손실 시 거래 중지)
  const maxDailyLoss = config.budget * -0.05
  if (dailyPnL < maxDailyLoss) {
    console.log(`[스캘핑] 🛑 일일 손실 한도 도달 (${dailyPnL.toLocaleString()}원 < ${maxDailyLoss.toLocaleString()}원) — 거래 중지`)
    return { logs: [], scan: lastScanResults }
  }

  // 1. 잔고 조회 (실패해도 스캔은 계속)
  const balance = await getBalanceSafe(config.mode)

  // 2. 보유종목 → 동적 익절/손절 판단
  if (balance) {
    for (const holding of balance.holdings) {
      if (dailyOrderCount >= config.maxDailyOrders) break
      if (holding.quantity <= 0) continue

      const pnlPercent = holding.profitLossPercent
      let { tp, sl } = await getExitThresholds(holding.code, holding.currentPrice, config.mode)
      // 에프터마켓: 스프레드 넓으므로 익절/손절 기준 1.5배로 확대
      if (isAfterMarketTime()) { tp *= 1.5; sl *= 1.5 }

      // 익절
      if (pnlPercent >= tp) {
        const log = await executeSell(
          holding.code, holding.name, holding.quantity, holding.currentPrice,
          `🎯 익절 ${pnlPercent.toFixed(1)}% (목표 ${tp.toFixed(1)}%, ATR 기반)`,
          config
        )
        if (log) {
          newLogs.push(log)
          if (log.result === 'success') {
            dailyPnL += holding.profitLoss
            delete positionMetas[holding.code]
          }
        }
      }
      // 손절
      else if (pnlPercent <= -sl) {
        const log = await executeSell(
          holding.code, holding.name, holding.quantity, holding.currentPrice,
          `🛑 손절 ${pnlPercent.toFixed(1)}% (한도 -${sl.toFixed(1)}%, ATR 기반)`,
          config
        )
        if (log) {
          newLogs.push(log)
          if (log.result === 'success') {
            dailyPnL += holding.profitLoss
            delete positionMetas[holding.code]
          }
        }
      }
      // 추세 악화 시 조기 매도
      else if (pnlPercent < 0 && pnlPercent > -sl) {
        const meta = positionMetas[holding.code]
        if (meta && meta.buyScore < 35 && pnlPercent < -1) {
          const log = await executeSell(
            holding.code, holding.name, holding.quantity, holding.currentPrice,
            `⚠️ 약매수 + 하락 → 조기 탈출 (${pnlPercent.toFixed(1)}%)`,
            config
          )
          if (log) {
            newLogs.push(log)
            if (log.result === 'success') {
              dailyPnL += holding.profitLoss
              delete positionMetas[holding.code]
            }
          }
        }
      }
    }
  }

  // 3. 시장 스캔 — 매수 기회 탐색
  const scanResults = await scanMarket(config.mode)
  lastScanResults = scanResults

  // 4. 매수 실행 (잔고 조회 필요)
  const freshBalance = balance ?? await getBalanceSafe(config.mode)

  // ─── 에프터마켓 보정 ───
  // 에프터마켓 보정: 최소점수만 올리고, 건당금액은 사용자 설정 그대로 유지
  const afterMarket = isAfterMarketTime()
  const effectiveMinScore = afterMarket ? Math.max(config.minScore + 10, 35) : config.minScore
  const effectiveMaxPerTrade = config.maxPerTrade  // 사용자 설정 존중
  const effectiveMaxPositions = afterMarket ? Math.min(config.maxPositions, 3) : config.maxPositions

  if (afterMarket) {
    console.log(`[스캘핑] 에프터마켓 보정 — 최소점수 ${effectiveMinScore}점, 최대 ${effectiveMaxPositions}종목 (건당 ${effectiveMaxPerTrade.toLocaleString()}원 유지)`)
  }

  if (freshBalance) {
    const currentPositionCount = freshBalance.holdings.filter(h => h.quantity > 0).length
    let positionSlots = effectiveMaxPositions - currentPositionCount
    let freshCash = Math.min(freshBalance.cashBalance, config.budget)

    // ─── 4A. 신규 매수 ───
    const buySignals = scanResults.filter(s => s.signal === 'BUY' && s.score >= effectiveMinScore)
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
          console.log(`[스캘핑] ${s.name}(${s.score}점) 추가매수 불가 — 이미 ${totalInvested.toLocaleString()}원 투자 (한도 ${maxPerStock.toLocaleString()}원)`)
        } else if (s.score >= 40 && alreadyHeld.profitLossPercent > 0) {
          // 불타기: 강한 신호 + 수익 중 → 추세 추종
          console.log(`[스캘핑] ${s.name}(${s.score}점) 🔥 불타기 대상 — 수익 ${alreadyHeld.profitLossPercent.toFixed(1)}% + 강매수 신호`)
          addBuyTargets.push({ scan: s, holding: alreadyHeld })
        } else if (s.score >= 35 && alreadyHeld.profitLossPercent < -1 && alreadyHeld.profitLossPercent > -3) {
          // 물타기: 소폭 하락(-1%~-3%) + 강한 매수 신호 → 평단가 낮추기
          console.log(`[스캘핑] ${s.name}(${s.score}점) 💧 물타기 대상 — 하락 ${alreadyHeld.profitLossPercent.toFixed(1)}% + 매수 신호 유지`)
          addBuyTargets.push({ scan: s, holding: alreadyHeld })
        } else {
          console.log(`[스캘핑] ${s.name}(${s.score}점) 보유 중(${alreadyHeld.quantity}주, ${alreadyHeld.profitLossPercent.toFixed(1)}%) — 추가매수 조건 미달`)
        }
      } else {
        newBuyTargets.push(s)
      }
    }

    if (positionSlots <= 0 && newBuyTargets.length > 0) {
      console.log(`[스캘핑] 포지션 슬롯 없음 (${currentPositionCount}/${effectiveMaxPositions} 보유 중) — 신규 매수 불가`)
    }
    if (freshCash < effectiveMaxPerTrade * 0.3) {
      console.log(`[스캘핑] 현금 부족 (${freshCash.toLocaleString()}원 < 최소 ${Math.round(effectiveMaxPerTrade * 0.3).toLocaleString()}원)`)
    }

    // 신규 종목 매수
    for (const target of newBuyTargets) {
      if (dailyOrderCount >= config.maxDailyOrders) {
        console.log(`[스캘핑] 일일 주문 한도 도달 (${dailyOrderCount}/${config.maxDailyOrders})`)
        break
      }
      if (positionSlots <= 0) break
      if (freshCash < effectiveMaxPerTrade * 0.3) break

      // ETF/레버리지/인버스 매수 차단
      if (isETF(target.name)) {
        console.log(`[스캘핑] ${target.name} — ETF/레버리지/인버스 매수 차단`)
        continue
      }

      // 투자금 배분: maxPerTrade 우선, 단 남은 현금의 50%는 넘지 않도록
      const investAmount = Math.min(effectiveMaxPerTrade, freshCash * 0.5)
      const quantity = Math.floor(investAmount / target.price)
      if (quantity <= 0) {
        console.log(`[스캘핑] ${target.name} 수량 0 — 가격 ${target.price.toLocaleString()}원 > 투자금 ${investAmount.toLocaleString()}원`)
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
          freshCash -= quantity * target.price  // 매수 성공 시 잔고 차감
          positionMetas[target.code] = {
            takeProfitPercent: target.takeProfitPercent,
            stopLossPercent: target.stopLossPercent,
            buyScore: target.score,
            buyReasons: target.reasons,
          }
        }
      }
    }

    // ─── 4B. 추가 매수 (불타기/물타기) ───
    for (const { scan: target, holding } of addBuyTargets) {
      if (dailyOrderCount >= config.maxDailyOrders) break
      if (freshCash < config.maxPerTrade * 0.3) break
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
            }
          }
        }
      }
    }
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

  try {
    const result = await placeKisOrder({
      side: 'buy', code, quantity,
      price: needsPrice ? price : undefined,
      orderType: orderType as 'market' | 'limit' | 'pre-market' | 'after-close' | 'after-hours',
    }, config.mode)

    const isSuccess = result.status === 'executed'
    if (isSuccess) dailyOrderCount++
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
        console.log(`[스캘핑] ${name} KRX 시간외 불가 → NXT 지정가(현재가 ${nxtPrice}원, ${nxtQty}주)로 재시도`)

        const nxtResult = await placeKisOrder({
          side: 'buy', code, quantity: nxtQty,
          price: nxtPrice,
          orderType: 'limit',
          exchange: 'NXT',
        }, config.mode)

        const nxtSuccess = nxtResult.status === 'executed'
        if (nxtSuccess) dailyOrderCount++
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
        console.log(`[스캘핑] ${name} NXT도 실패: ${nxtMsg}`)
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
    if (sellSuccess) dailyOrderCount++
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
        console.log(`[스캘핑] ${name} 매도 KRX 불가 → NXT 지정가(현재가 ${nxtPrice}원)로 재시도`)
        const nxtResult = await placeKisOrder({
          side: 'sell', code, quantity,
          price: nxtPrice,
          orderType: 'limit',
          exchange: 'NXT',
        }, config.mode)

        const nxtSellOk = nxtResult.status === 'executed'
        if (nxtSellOk) dailyOrderCount++
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
