// 자율 종목 스캐너 — KIS 거래량순위 + 기술적 분석
import { getKisDailyPrices, getKisVolumeRank } from './kis-api'
import type { TradingMode } from './kis-api'
import { calcRSI, calcMACD, calcSMA, calcBollingerBands, calcATR } from './indicators'
import type { DailyPrice } from '@/types/kis'

export interface ScanResult {
  code: string
  name: string
  price: number
  change: number           // 등락률 %
  volume: number
  volumeRatio: number      // 평균 대비 거래량 배수
  rsi: number
  macdHist: number
  macdPrevHist: number
  bbPosition: number       // 볼린저밴드 내 위치 (0~1, 0=하단, 1=상단)
  atr: number              // ATR (평균진폭, 원)
  atrPercent: number       // ATR% (가격 대비 변동성)
  takeProfitPercent: number // 봇이 계산한 익절% (변동성 기반)
  stopLossPercent: number   // 봇이 계산한 손절% (변동성 기반)
  score: number            // 종합 점수 (-100 ~ +100)
  signal: 'BUY' | 'SELL' | 'HOLD'
  reasons: string[]
}

// ETF / 레버리지 / 인버스 필터 (스캘핑에 부적합)
const ETF_PREFIXES = ['KODEX', 'TIGER', 'KOSEF', 'KBSTAR', 'ARIRANG', 'SOL', 'ACE', 'HANARO']
const isETF = (name: string): boolean =>
  ETF_PREFIXES.some(p => name.startsWith(p)) || name.includes('레버리지') || name.includes('인버스')

/** 개별 종목 분석 */
const analyzeStock = async (
  code: string,
  name: string,
  price: number,
  change: number,
  mode?: TradingMode
): Promise<ScanResult | null> => {
  try {
    const data = await getKisDailyPrices(code, 60, mode)
    if (data.length < 30) return null

    const closes = data.map((d) => d.close)
    const volumes = data.map((d) => d.volume)

    // RSI
    const rsiArr = calcRSI(closes, 14)
    const rsi = rsiArr[rsiArr.length - 1] ?? 50

    // MACD
    const { histogram } = calcMACD(closes)
    const macdHist = histogram[histogram.length - 1] ?? 0
    const macdPrevHist = histogram[histogram.length - 2] ?? 0

    // 볼린저밴드
    const bb = calcBollingerBands(closes, 20, 2)
    const upper = bb.upper[bb.upper.length - 1] ?? 0
    const lower = bb.lower[bb.lower.length - 1] ?? 0
    const bbPosition = upper !== lower ? (price - lower) / (upper - lower) : 0.5

    // 거래량 비율
    const latestVol = volumes[volumes.length - 1] ?? 0
    const avgVol = volumes.slice(-20, -1).reduce((a, b) => a + b, 0) / Math.max(volumes.slice(-20, -1).length, 1)
    const volumeRatio = avgVol > 0 ? latestVol / avgVol : 1

    // SMA 추세
    const sma5 = calcSMA(closes, 5)
    const sma20 = calcSMA(closes, 20)
    const latest5 = sma5[sma5.length - 1] ?? 0
    const latest20 = sma20[sma20.length - 1] ?? 0
    const prev5 = sma5[sma5.length - 2] ?? 0
    const prev20 = sma20[sma20.length - 2] ?? 0

    // ─── 스캘핑 점수 계산 ───
    let score = 0
    const reasons: string[] = []

    // RSI 과매도 → 매수 기회 (+30)
    if (rsi < 30) {
      score += 30
      reasons.push(`RSI ${rsi.toFixed(0)} 과매도`)
    } else if (rsi < 40) {
      score += 15
      reasons.push(`RSI ${rsi.toFixed(0)} 저평가`)
    } else if (rsi > 70) {
      score -= 25
      reasons.push(`RSI ${rsi.toFixed(0)} 과매수`)
    } else if (rsi > 60) {
      score -= 10
    }

    // MACD 골든크로스 (+25)
    if (macdHist > 0 && macdPrevHist <= 0) {
      score += 25
      reasons.push('MACD 골든크로스')
    } else if (macdHist < 0 && macdPrevHist >= 0) {
      score -= 20
      reasons.push('MACD 데드크로스')
    } else if (macdHist > macdPrevHist && macdHist > 0) {
      score += 10
      reasons.push('MACD 상승세')
    }

    // 볼린저 하단 근접 → 반등 기대 (+20)
    if (bbPosition < 0.1) {
      score += 20
      reasons.push('볼린저 하단 근접')
    } else if (bbPosition < 0.25) {
      score += 10
      reasons.push('볼린저 하단부')
    } else if (bbPosition > 0.9) {
      score -= 15
      reasons.push('볼린저 상단 돌파')
    }

    // 거래량 급증 + 상승 → 강매수 (+20)
    if (volumeRatio > 2 && change > 0) {
      score += 20
      reasons.push(`거래량 ${volumeRatio.toFixed(1)}배 급증`)
    } else if (volumeRatio > 1.5 && change > 0) {
      score += 10
      reasons.push(`거래량 ${volumeRatio.toFixed(1)}배`)
    }

    // 골든크로스 (5일선 > 20일선 전환)
    if (prev5 <= prev20 && latest5 > latest20) {
      score += 15
      reasons.push('이평선 골든크로스')
    } else if (prev5 >= prev20 && latest5 < latest20) {
      score -= 15
      reasons.push('이평선 데드크로스')
    }

    // 당일 급락 종목 → 반등 스캘핑
    if (change < -3 && rsi < 40) {
      score += 15
      reasons.push(`당일 ${change.toFixed(1)}% 급락 반등 기대`)
    }

    // ─── ATR 기반 변동성 계산 ───
    const atrArr = calcATR(data, 14)
    const atr = atrArr[atrArr.length - 1] ?? 0
    const atrPercent = price > 0 ? (atr / price) * 100 : 2

    // ─── 동적 익절/손절 결정 ───
    let takeProfitPercent = Math.max(1, Math.min(8, atrPercent * 1.8))
    let stopLossPercent = Math.max(1.5, Math.min(5, atrPercent * 1.2))

    if (score >= 50) {
      takeProfitPercent *= 1.3
      reasons.push(`강신호 → 익절 ${takeProfitPercent.toFixed(1)}%`)
    } else if (score < 35) {
      takeProfitPercent *= 0.7
      stopLossPercent *= 0.8
    }

    if (volumeRatio > 2) {
      takeProfitPercent *= 1.2
    }

    takeProfitPercent = Math.round(takeProfitPercent * 10) / 10
    stopLossPercent = Math.round(stopLossPercent * 10) / 10

    // 신호 결정
    let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD'
    if (score >= 25) signal = 'BUY'
    else if (score <= -20) signal = 'SELL'

    return {
      code, name, price, change,
      volume: latestVol, volumeRatio,
      rsi, macdHist, macdPrevHist, bbPosition,
      atr, atrPercent, takeProfitPercent, stopLossPercent,
      score, signal, reasons,
    }
  } catch {
    return null
  }
}

/** 시장 전체 스캔 — KIS 거래량순위 + 기술적 분석 */
export const scanMarket = async (mode?: TradingMode): Promise<ScanResult[]> => {
  // 1. KIS 거래량 순위에서 인기 종목 가져오기
  let trending: { code: string; name: string; price: number; change: number }[]
  try {
    const rank = await getKisVolumeRank(mode)
    // ETF/레버리지/인버스 제외, 가격 500원 이상만
    trending = rank
      .filter(r => !isETF(r.name) && r.price >= 500)
      .slice(0, 30)
      .map(r => ({ code: r.code, name: r.name, price: r.price, change: r.change }))
    console.log(`[스캐너] KIS 거래량순위 ${rank.length}종목 중 ${trending.length}종목 분석 대상 (ETF/저가 제외)`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.log(`[스캐너] KIS 거래량순위 조회 실패: ${msg}`)
    return []
  }

  if (trending.length === 0) return []

  // 2. 병렬로 기술적 분석 (3개씩 배치 — rate limit 안전)
  const results: ScanResult[] = []
  let failCount = 0
  const batchSize = 3
  for (let i = 0; i < trending.length; i += batchSize) {
    const batch = trending.slice(i, i + batchSize)
    const batchResults = await Promise.allSettled(
      batch.map((s) => analyzeStock(s.code, s.name, s.price, s.change, mode))
    )
    for (const r of batchResults) {
      if (r.status === 'fulfilled' && r.value) {
        results.push(r.value)
      } else {
        failCount++
      }
    }
    // KIS API rate limit 방지 (초당 20회 제한)
    if (i + batchSize < trending.length) {
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
  }

  if (failCount > 0) {
    console.log(`[스캐너] ${failCount}/${trending.length}종목 분석 실패 (데이터 부족 또는 API 오류)`)
  }

  const sorted = results.sort((a, b) => b.score - a.score)
  const buyCount = sorted.filter(s => s.signal === 'BUY').length
  console.log(`[스캐너] 분석 완료: ${results.length}종목 / BUY ${buyCount}개 / 최고점 ${sorted[0]?.score ?? 0}점(${sorted[0]?.name ?? '-'})`)
  return sorted
}
