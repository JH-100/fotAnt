// 뉴스 스캐너 — 네이버 뉴스 키워드 스캔 + 급등 종목 우선분석 + 섹터 모멘텀 감지

const logTime = () => {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}/${dd} ${hh}:${mi}`
}

// ─── Types ────────────────────────────────────────────────────────────
export interface NewsHotStock {
  code: string
  name: string
  newsCount: number
  keywords: string[]
  latestTitle: string
}

export interface SectorMomentum {
  sector: string
  avgChange: number
  stockCount: number
  isHot: boolean
}

// ─── Sector Map (로컬 정의 — 순환 import 방지) ──────────────────────
const SECTOR_MAP: Record<string, string> = {
  '005930': '반도체', '000660': '반도체', '042700': '반도체', '403870': '반도체',
  '068270': '바이오', '207940': '바이오', '009420': '바이오', '145020': '바이오',
  '326030': '바이오', '328130': '바이오', '196170': '바이오',
  '005380': '자동차', '000270': '자동차', '012330': '자동차',
  '373220': '2차전지', '006400': '2차전지', '051910': '2차전지',
  '055550': '금융', '105560': '금융', '316140': '금융',
  '012450': '방산', '047810': '방산',
  '035420': 'IT', '035720': 'IT', '036570': 'IT', '259960': 'IT',
  '352820': '엔터', '041510': '엔터',
  '005490': '소재', '010130': '소재',
}

// ─── Constants ────────────────────────────────────────────────────────
const NEWS_KEYWORDS = ['급등', '수주', '실적', '상한가', 'FDA', '계약', '흑자전환', '신고가', '대규모']
const NAVER_API_URL = 'https://openssl.naver.com/v1/search/news.json'
const NEWS_CACHE_TTL = 5 * 60 * 1000       // 5분
const NEWS_HOT_THRESHOLD = 2               // 2건 이상이면 hot
const NEWS_TIME_WINDOW = 30 * 60 * 1000    // 30분

// ─── Cache ────────────────────────────────────────────────────────────
interface CacheEntry {
  data: NewsHotStock[]
  timestamp: number
}
let newsCache: CacheEntry | null = null

// ─── 1. Naver News Keyword Scanning ──────────────────────────────────

interface NaverNewsItem {
  title: string
  description: string
  pubDate: string
  link: string
}

interface NaverNewsResponse {
  items: NaverNewsItem[]
  total: number
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

function isWithinTimeWindow(pubDate: string): boolean {
  try {
    const published = new Date(pubDate).getTime()
    const now = Date.now()
    return now - published <= NEWS_TIME_WINDOW
  } catch {
    return false
  }
}

async function searchNaverNews(keyword: string): Promise<NaverNewsItem[]> {
  if (typeof window !== 'undefined') return []

  const clientId = process.env.NAVER_CLIENT_ID
  const clientSecret = process.env.NAVER_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    console.log(`${logTime()} [뉴스] Naver API 키 미설정 — NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 필요`)
    return []
  }

  try {
    const params = new URLSearchParams({
      query: keyword,
      display: '20',
      sort: 'date',
    })

    const res = await fetch(`${NAVER_API_URL}?${params.toString()}`, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
    })

    if (!res.ok) {
      console.log(`${logTime()} [뉴스] Naver API 오류: ${res.status} ${res.statusText}`)
      return []
    }

    const data: NaverNewsResponse = await res.json()
    return data.items || []
  } catch (err) {
    console.log(`${logTime()} [뉴스] Naver API 요청 실패: ${err}`)
    return []
  }
}

export async function scanNewsForStocks(
  stockNames: { code: string; name: string }[]
): Promise<NewsHotStock[]> {
  try {
    // 캐시 확인
    if (newsCache && Date.now() - newsCache.timestamp < NEWS_CACHE_TTL) {
      console.log(`${logTime()} [뉴스] 캐시 사용 (${newsCache.data.length}건)`)
      return newsCache.data
    }

    if (typeof window !== 'undefined') return []
    if (!stockNames.length) return []

    console.log(`${logTime()} [뉴스] 뉴스 스캔 시작 — 종목 ${stockNames.length}개, 키워드 ${NEWS_KEYWORDS.length}개`)

    // 종목별 뉴스 매칭 집계
    const stockHits: Record<string, { count: number; keywords: Set<string>; latestTitle: string }> = {}

    for (const keyword of NEWS_KEYWORDS) {
      const articles = await searchNaverNews(keyword)
      const recentArticles = articles.filter(a => isWithinTimeWindow(a.pubDate))

      for (const article of recentArticles) {
        const title = stripHtml(article.title)
        const desc = stripHtml(article.description)
        const text = `${title} ${desc}`

        for (const stock of stockNames) {
          if (text.includes(stock.name)) {
            if (!stockHits[stock.code]) {
              stockHits[stock.code] = { count: 0, keywords: new Set(), latestTitle: '' }
            }
            stockHits[stock.code].count++
            stockHits[stock.code].keywords.add(keyword)
            stockHits[stock.code].latestTitle = title
          }
        }
      }

      // API 호출 간 짧은 딜레이 (rate limit 방지)
      await new Promise(r => setTimeout(r, 100))
    }

    // 2건 이상 매칭된 종목만 필터
    const hotStocks: NewsHotStock[] = []
    for (const stock of stockNames) {
      const hit = stockHits[stock.code]
      if (hit && hit.count >= NEWS_HOT_THRESHOLD) {
        hotStocks.push({
          code: stock.code,
          name: stock.name,
          newsCount: hit.count,
          keywords: Array.from(hit.keywords),
          latestTitle: hit.latestTitle,
        })
      }
    }

    // 뉴스 건수 내림차순 정렬
    hotStocks.sort((a, b) => b.newsCount - a.newsCount)

    // 캐시 저장
    newsCache = { data: hotStocks, timestamp: Date.now() }

    console.log(`${logTime()} [뉴스] 뉴스 핫 종목 ${hotStocks.length}개 감지`)
    for (const s of hotStocks) {
      console.log(`${logTime()} [뉴스]   ${s.name}(${s.code}) — ${s.newsCount}건, 키워드: ${s.keywords.join(',')}`)
    }

    return hotStocks
  } catch (err) {
    console.log(`${logTime()} [뉴스] 뉴스 스캔 오류: ${err}`)
    return []
  }
}

// ─── 2. Surge Stock Priority (급등 종목 우선분석) ────────────────────

export function prioritizeSurgeStocks<T extends { code: string; name: string; price: number; change: number }>(
  stocks: T[]
): T[] {
  try {
    if (!stocks.length) return []

    const surgeThreshold = 5 // +5%

    const surgeStocks = stocks
      .filter(s => s.change > surgeThreshold)
      .sort((a, b) => b.change - a.change)

    const normalStocks = stocks.filter(s => s.change <= surgeThreshold)

    const result = [...surgeStocks, ...normalStocks]

    if (surgeStocks.length > 0) {
      console.log(`${logTime()} [급등] 급등 종목 ${surgeStocks.length}개 우선 배치`)
      for (const s of surgeStocks) {
        console.log(`${logTime()} [급등]   ${s.name}(${s.code}) +${s.change.toFixed(2)}%`)
      }
    }

    return result
  } catch (err) {
    console.log(`${logTime()} [급등] 급등 종목 정렬 오류: ${err}`)
    return stocks
  }
}

// ─── 3. Sector Momentum Detection ───────────────────────────────────

export function detectSectorMomentum(
  stocks: { code: string; change: number }[]
): SectorMomentum[] {
  try {
    if (!stocks.length) return []

    const MOMENTUM_THRESHOLD = 2  // +2% 이상
    const MIN_STOCK_COUNT = 2     // 같은 섹터 2종목 이상

    // 섹터별 그룹핑
    const sectorGroups: Record<string, { changes: number[]; count: number }> = {}

    for (const stock of stocks) {
      const sector = SECTOR_MAP[stock.code]
      if (!sector) continue

      if (!sectorGroups[sector]) {
        sectorGroups[sector] = { changes: [], count: 0 }
      }
      sectorGroups[sector].changes.push(stock.change)
      sectorGroups[sector].count++
    }

    // 모멘텀 판단
    const results: SectorMomentum[] = []

    for (const [sector, group] of Object.entries(sectorGroups)) {
      const hotCount = group.changes.filter(c => c > MOMENTUM_THRESHOLD).length
      const avgChange = group.changes.reduce((sum, c) => sum + c, 0) / group.changes.length
      const isHot = hotCount >= MIN_STOCK_COUNT

      results.push({
        sector,
        avgChange: Math.round(avgChange * 100) / 100,
        stockCount: group.count,
        isHot,
      })
    }

    // 평균 등락률 내림차순 정렬
    results.sort((a, b) => b.avgChange - a.avgChange)

    const hotSectors = results.filter(r => r.isHot)
    if (hotSectors.length > 0) {
      console.log(`${logTime()} [섹터] 모멘텀 섹터 ${hotSectors.length}개 감지`)
      for (const s of hotSectors) {
        console.log(`${logTime()} [섹터]   ${s.sector} — 평균 ${s.avgChange > 0 ? '+' : ''}${s.avgChange}%, ${s.stockCount}종목`)
      }
    }

    return results
  } catch (err) {
    console.log(`${logTime()} [섹터] 섹터 모멘텀 감지 오류: ${err}`)
    return []
  }
}
