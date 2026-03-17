// 자동매매 엔진
import type { KisBalance } from '@/types/kis'
import { getKisBalance, getKisDailyPrices, placeKisOrder } from './kis-api'
import type { TradingStrategy, SafetyConfig, TradeLogEntry, StrategySignal } from './strategies/types'
import { DEFAULT_SAFETY, signalToOrder } from './strategies/types'
import rsiStrategy from './strategies/rsi-strategy'
import macdCrossoverStrategy from './strategies/macd-crossover'
import momentumStrategy from './strategies/momentum'

/** 사용 가능한 전략 목록 */
export const STRATEGIES: Record<string, TradingStrategy> = {
  rsi: rsiStrategy,
  macd: macdCrossoverStrategy,
  momentum: momentumStrategy,
}

/** 장 운영시간 체크 (KST 09:00 ~ 15:30) */
export const isMarketOpen = (): boolean => {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const hours = kst.getUTCHours()
  const minutes = kst.getUTCMinutes()
  const day = kst.getUTCDay()

  // 주말 제외
  if (day === 0 || day === 6) return false

  const time = hours * 100 + minutes
  return time >= 900 && time <= 1530
}

/** 일일 주문 카운터 */
let dailyOrderCount = 0
let lastResetDate = ''

const resetDailyCounterIfNeeded = () => {
  const today = new Date().toISOString().split('T')[0] ?? ''
  if (today !== lastResetDate) {
    dailyOrderCount = 0
    lastResetDate = today
  }
}

/** 매매 로그 (메모리) */
const tradeLogs: TradeLogEntry[] = []

export const getTradeLogs = (): TradeLogEntry[] => [...tradeLogs].reverse()

/** 안전 검사 */
const checkSafety = (
  signal: StrategySignal,
  balance: KisBalance,
  safety: SafetyConfig
): { pass: boolean; reason?: string } => {
  resetDailyCounterIfNeeded()

  // 일일 주문 수 제한
  if (dailyOrderCount >= safety.maxDailyOrders) {
    return { pass: false, reason: `일일 최대 주문 수(${safety.maxDailyOrders}회) 도달` }
  }

  if (signal.action === 'BUY') {
    // 투자금 충분한지 확인
    if (balance.cashBalance < safety.investPerTrade) {
      return { pass: false, reason: `예수금 부족 (${balance.cashBalance.toLocaleString()}원)` }
    }

    // 포지션 한도 체크
    const totalEval = balance.totalEvaluation
    if (totalEval > 0) {
      const positionPercent = (safety.investPerTrade / totalEval) * 100
      if (positionPercent > safety.maxPositionPercent) {
        return { pass: false, reason: `포지션 한도(${safety.maxPositionPercent}%) 초과` }
      }
    }
  }

  if (signal.action === 'SELL') {
    // 보유 종목 확인
    const holding = balance.holdings.find((h) => h.code === signal.code)
    if (!holding || holding.quantity <= 0) {
      return { pass: false, reason: '보유 종목 없음' }
    }

    // 손절 체크 (이미 손실이 손절선 이하이면 강제 매도 허용)
    if (holding.profitLossPercent < -safety.stopLossPercent) {
      return { pass: true } // 손절은 항상 허용
    }
  }

  // 일일 손실 한도 체크
  if (balance.totalEvaluation > 0) {
    const dailyLossPercent = (balance.totalProfitLoss / balance.totalEvaluation) * -100
    if (dailyLossPercent >= safety.maxDailyLossPercent && signal.action === 'BUY') {
      return { pass: false, reason: `일일 손실 한도(${safety.maxDailyLossPercent}%) 도달` }
    }
  }

  return { pass: true }
}

/** 자동매매 1회 실행 */
export const executeAutoTrade = async (
  targetStocks: { code: string; name: string }[],
  strategyName: string,
  safety: SafetyConfig = DEFAULT_SAFETY
): Promise<TradeLogEntry[]> => {
  const strategy = STRATEGIES[strategyName]
  if (!strategy) throw new Error(`전략을 찾을 수 없습니다: ${strategyName}`)

  const balance = await getKisBalance()
  const newLogs: TradeLogEntry[] = []

  for (const stock of targetStocks) {
    try {
      const data = await getKisDailyPrices(stock.code, 100)
      if (data.length < 30) continue

      // 보유 수량 확인
      const holding = balance.holdings.find((h) => h.code === stock.code)
      const currentHoldings = holding?.quantity ?? 0

      // 전략 분석
      const signal = strategy.analyze(stock.code, stock.name, data, currentHoldings)
      if (signal.action === 'HOLD') continue

      // 매수 시 수량 자동 계산
      if (signal.action === 'BUY' && signal.quantity === 0) {
        const currentPrice = data[data.length - 1]?.close ?? 0
        if (currentPrice > 0) {
          signal.quantity = Math.floor(safety.investPerTrade / currentPrice)
        }
        if (signal.quantity <= 0) continue
      }

      // 안전 검사
      const safetyCheck = checkSafety(signal, balance, safety)
      if (!safetyCheck.pass) {
        const log: TradeLogEntry = {
          id: `${Date.now()}-${stock.code}`,
          timestamp: new Date().toISOString(),
          strategy: strategy.name,
          action: signal.action,
          code: stock.code,
          name: stock.name,
          quantity: signal.quantity,
          price: data[data.length - 1]?.close ?? 0,
          reason: signal.reason,
          result: 'failed',
          message: safetyCheck.reason,
        }
        tradeLogs.push(log)
        newLogs.push(log)
        continue
      }

      // 주문 실행
      const order = signalToOrder(signal)
      if (!order) continue

      const result = await placeKisOrder(order)
      dailyOrderCount++

      const log: TradeLogEntry = {
        id: `${Date.now()}-${stock.code}`,
        timestamp: new Date().toISOString(),
        strategy: strategy.name,
        action: signal.action,
        code: stock.code,
        name: stock.name,
        quantity: signal.quantity,
        price: data[data.length - 1]?.close ?? 0,
        reason: signal.reason,
        result: result.status === 'executed' ? 'success' : 'failed',
        message: result.message,
      }
      tradeLogs.push(log)
      newLogs.push(log)
    } catch (error) {
      const msg = error instanceof Error ? error.message : '알 수 없는 오류'
      tradeLogs.push({
        id: `${Date.now()}-${stock.code}`,
        timestamp: new Date().toISOString(),
        strategy: strategy.name,
        action: 'BUY',
        code: stock.code,
        name: stock.name,
        quantity: 0,
        price: 0,
        reason: '분석 오류',
        result: 'failed',
        message: msg,
      })
    }
  }

  // 로그 최대 500개 유지
  while (tradeLogs.length > 500) tradeLogs.shift()

  return newLogs
}
