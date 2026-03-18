// 종목 검색 API — KIS 종목 마스터 다운로드 + 한국어/코드 검색
import { NextResponse } from 'next/server'

interface StockMaster {
  code: string
  name: string
  market: 'KOSPI' | 'KOSDAQ'
}

// ─── 서버 메모리 캐시 ────────────────────────────
let cachedStocks: StockMaster[] = []
let lastFetchedAt = 0
const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24시간

/** KIS 종목 마스터 파일 다운로드 (고정폭 바이너리) */
const fetchMasterFile = async (market: 'kospi' | 'kosdaq'): Promise<StockMaster[]> => {
  const url = `https://new.real.download.dws.co.kr/common/master/${market}_code.mst.zip`
  const stocks: StockMaster[] = []

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return []

    const buffer = Buffer.from(await res.arrayBuffer())

    // KIS 마스터 파일: zip 안에 .mst 파일
    // 간이 unzip (zip은 끝에서 central directory → local file headers)
    // 실제로는 단순 텍스트처럼 파싱 가능 (고정폭 아닌 파이프 구분)
    const { unzipSync } = await import('zlib')
    // zip 파일에서 실제 데이터 추출
    const dataStart = buffer.indexOf(Buffer.from([0x78, 0x9c])) // zlib deflate 시그니처
    if (dataStart === -1) {
      // zip이 아닌 raw 파일일 수 있음 → 직접 파싱
      return parseRawMaster(buffer, market === 'kospi' ? 'KOSPI' : 'KOSDAQ')
    }

    // zip entry에서 compressed data 추출 후 inflate
    try {
      const deflated = buffer.slice(dataStart)
      const inflated = unzipSync(deflated)
      return parseRawMaster(inflated, market === 'kospi' ? 'KOSPI' : 'KOSDAQ')
    } catch {
      return parseRawMaster(buffer, market === 'kospi' ? 'KOSPI' : 'KOSDAQ')
    }
  } catch (err) {
    console.log(`[종목마스터] ${market} 다운로드 실패:`, err instanceof Error ? err.message : err)
    return stocks
  }
}

/** 마스터 파일 파싱 — KIS 고정폭 포맷 */
const parseRawMaster = (buffer: Buffer, market: 'KOSPI' | 'KOSDAQ'): StockMaster[] => {
  const stocks: StockMaster[] = []
  const text = buffer.toString('euc-kr' as BufferEncoding).replace(/\r/g, '')

  // 줄 단위로 파싱 — 포맷: 단축코드(9) + 표준코드(12) + 한글명(가변) + ...
  const lines = text.split('\n')
  for (const line of lines) {
    if (line.length < 21) continue

    // 각 필드는 고정 길이이지만 한글명은 가변
    // 단축코드 첫 6자리가 종목코드
    const shortCode = line.substring(0, 9).trim()
    const code = shortCode.replace(/^A/, '').substring(0, 6)

    // 한글명은 표준코드(12자리) 이후
    const rest = line.substring(21)
    // 한글종목명: 다음 필드 구분까지
    const nameEnd = rest.indexOf('\x00') !== -1 ? rest.indexOf('\x00') : 40
    const name = rest.substring(0, Math.min(nameEnd, 40)).trim()

    if (code && name && /^\d{6}$/.test(code)) {
      stocks.push({ code, name, market })
    }
  }

  return stocks
}

/** 빌트인 주요 종목 (마스터 다운로드 실패 시 폴백) */
const BUILTIN_STOCKS: StockMaster[] = [
  // 시가총액 상위 50
  { code: '005930', name: '삼성전자', market: 'KOSPI' },
  { code: '000660', name: 'SK하이닉스', market: 'KOSPI' },
  { code: '373220', name: 'LG에너지솔루션', market: 'KOSPI' },
  { code: '207940', name: '삼성바이오로직스', market: 'KOSPI' },
  { code: '005380', name: '현대차', market: 'KOSPI' },
  { code: '000270', name: '기아', market: 'KOSPI' },
  { code: '068270', name: '셀트리온', market: 'KOSPI' },
  { code: '035420', name: 'NAVER', market: 'KOSPI' },
  { code: '035720', name: '카카오', market: 'KOSPI' },
  { code: '051910', name: 'LG화학', market: 'KOSPI' },
  { code: '006400', name: '삼성SDI', market: 'KOSPI' },
  { code: '003670', name: '포스코퓨처엠', market: 'KOSPI' },
  { code: '028260', name: '삼성물산', market: 'KOSPI' },
  { code: '055550', name: '신한지주', market: 'KOSPI' },
  { code: '105560', name: 'KB금융', market: 'KOSPI' },
  { code: '012330', name: '현대모비스', market: 'KOSPI' },
  { code: '066570', name: 'LG전자', market: 'KOSPI' },
  { code: '003550', name: 'LG', market: 'KOSPI' },
  { code: '034730', name: 'SK', market: 'KOSPI' },
  { code: '096770', name: 'SK이노베이션', market: 'KOSPI' },
  { code: '032830', name: '삼성생명', market: 'KOSPI' },
  { code: '030200', name: 'KT', market: 'KOSPI' },
  { code: '010130', name: '고려아연', market: 'KOSPI' },
  { code: '003490', name: '대한항공', market: 'KOSPI' },
  { code: '086790', name: '하나금융지주', market: 'KOSPI' },
  { code: '017670', name: 'SK텔레콤', market: 'KOSPI' },
  { code: '316140', name: '우리금융지주', market: 'KOSPI' },
  { code: '009150', name: '삼성전기', market: 'KOSPI' },
  { code: '034020', name: '두산에너빌리티', market: 'KOSPI' },
  { code: '018260', name: '삼성에스디에스', market: 'KOSPI' },
  { code: '011200', name: 'HMM', market: 'KOSPI' },
  { code: '009540', name: 'HD한국조선해양', market: 'KOSPI' },
  { code: '010950', name: 'S-Oil', market: 'KOSPI' },
  { code: '000810', name: '삼성화재', market: 'KOSPI' },
  { code: '033780', name: 'KT&G', market: 'KOSPI' },
  { code: '259960', name: '크래프톤', market: 'KOSPI' },
  { code: '352820', name: '하이브', market: 'KOSPI' },
  { code: '196170', name: '알테오젠', market: 'KOSPI' },
  { code: '329180', name: 'HD현대중공업', market: 'KOSPI' },
  { code: '267260', name: 'HD현대', market: 'KOSPI' },
  // 코스닥 주요
  { code: '247540', name: '에코프로비엠', market: 'KOSDAQ' },
  { code: '086520', name: '에코프로', market: 'KOSDAQ' },
  { code: '263750', name: '펄어비스', market: 'KOSDAQ' },
  { code: '112040', name: '위메이드', market: 'KOSDAQ' },
  { code: '293490', name: '카카오게임즈', market: 'KOSDAQ' },
  { code: '036570', name: '엔씨소프트', market: 'KOSDAQ' },
  { code: '328130', name: '루닛', market: 'KOSDAQ' },
  { code: '145020', name: '휴젤', market: 'KOSDAQ' },
  { code: '214150', name: '클래시스', market: 'KOSDAQ' },
  { code: '009420', name: '한올바이오파마', market: 'KOSDAQ' },
  { code: '042700', name: '한미반도체', market: 'KOSDAQ' },
  { code: '041510', name: 'SM', market: 'KOSDAQ' },
  { code: '950160', name: '코오롱티슈진', market: 'KOSDAQ' },
  { code: '058470', name: '리노공업', market: 'KOSDAQ' },
  { code: '039030', name: '이오테크닉스', market: 'KOSDAQ' },
  { code: '089030', name: '테크윙', market: 'KOSDAQ' },
  { code: '403870', name: 'HPSP', market: 'KOSDAQ' },
  { code: '005290', name: '동진쎄미켐', market: 'KOSDAQ' },
  { code: '064760', name: '티씨케이', market: 'KOSDAQ' },
  { code: '357780', name: '솔브레인', market: 'KOSDAQ' },
  // 추가 인기종목
  { code: '005490', name: 'POSCO홀딩스', market: 'KOSPI' },
  { code: '090430', name: '아모레퍼시픽', market: 'KOSPI' },
  { code: '004020', name: '현대제철', market: 'KOSPI' },
  { code: '015760', name: '한국전력', market: 'KOSPI' },
  { code: '024110', name: '기업은행', market: 'KOSPI' },
  { code: '086280', name: '현대글로비스', market: 'KOSPI' },
  { code: '161390', name: '한국타이어앤테크놀로지', market: 'KOSPI' },
  { code: '011170', name: '롯데케미칼', market: 'KOSPI' },
  { code: '097950', name: 'CJ제일제당', market: 'KOSPI' },
  { code: '036460', name: '한국가스공사', market: 'KOSPI' },
  { code: '138040', name: '메리츠금융지주', market: 'KOSPI' },
  { code: '000100', name: '유한양행', market: 'KOSPI' },
  { code: '180640', name: '한진칼', market: 'KOSPI' },
  { code: '402340', name: 'SK스퀘어', market: 'KOSPI' },
  { code: '326030', name: 'SK바이오팜', market: 'KOSPI' },
  { code: '047050', name: '포스코인터내셔널', market: 'KOSPI' },
  { code: '010140', name: '삼성중공업', market: 'KOSPI' },
  { code: '302440', name: 'SK바이오사이언스', market: 'KOSPI' },
  { code: '011790', name: 'SKC', market: 'KOSPI' },
  { code: '009830', name: '한화솔루션', market: 'KOSPI' },
  { code: '241560', name: '두산밥캣', market: 'KOSPI' },
  { code: '088980', name: '맥쿼리인프라', market: 'KOSPI' },
  { code: '139480', name: '이마트', market: 'KOSPI' },
  { code: '272210', name: '한화시스템', market: 'KOSPI' },
  { code: '012450', name: '한화에어로스페이스', market: 'KOSPI' },
  { code: '000720', name: '현대건설', market: 'KOSPI' },
  { code: '047810', name: '한국항공우주', market: 'KOSPI' },
  { code: '298050', name: '효성첨단소재', market: 'KOSPI' },
  { code: '004170', name: '신세계', market: 'KOSPI' },
  { code: '271560', name: '오리온', market: 'KOSPI' },
  { code: '021240', name: '코웨이', market: 'KOSPI' },
  { code: '002790', name: '아모레G', market: 'KOSPI' },
  { code: '251270', name: '넷마블', market: 'KOSPI' },
  { code: '323410', name: '카카오뱅크', market: 'KOSPI' },
  { code: '377300', name: '카카오페이', market: 'KOSPI' },
  { code: '069500', name: 'KODEX 200', market: 'KOSPI' },
  { code: '122630', name: 'KODEX 레버리지', market: 'KOSPI' },
  { code: '114800', name: 'KODEX 인버스', market: 'KOSPI' },
  { code: '252670', name: 'KODEX 200선물인버스2X', market: 'KOSPI' },
  { code: '233740', name: 'KODEX 코스닥150레버리지', market: 'KOSPI' },
  { code: '261240', name: 'KODEX 미국나스닥100선물(H)', market: 'KOSPI' },
  { code: '133690', name: 'TIGER 미국나스닥100', market: 'KOSPI' },
  { code: '381180', name: 'TIGER 미국테크TOP10 INDXX', market: 'KOSPI' },
]

/** 전체 종목 리스트 로드 (마스터 → 폴백 빌트인) */
const loadStocks = async (): Promise<StockMaster[]> => {
  if (cachedStocks.length > 0 && Date.now() - lastFetchedAt < CACHE_DURATION) {
    return cachedStocks
  }

  console.log('[종목검색] 마스터 파일 로드 중...')
  try {
    const [kospi, kosdaq] = await Promise.all([
      fetchMasterFile('kospi'),
      fetchMasterFile('kosdaq'),
    ])

    if (kospi.length + kosdaq.length > 100) {
      cachedStocks = [...kospi, ...kosdaq]
      lastFetchedAt = Date.now()
      console.log(`[종목검색] 마스터 로드 완료 — KOSPI ${kospi.length} + KOSDAQ ${kosdaq.length} = ${cachedStocks.length}종목`)
      return cachedStocks
    }
  } catch { /* fallback */ }

  // 마스터 실패 → 빌트인 사용
  if (cachedStocks.length === 0) {
    cachedStocks = BUILTIN_STOCKS
    lastFetchedAt = Date.now()
    console.log(`[종목검색] 빌트인 폴백 — ${cachedStocks.length}종목`)
  }
  return cachedStocks
}

/** GET /api/stock-search?q=현대차 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = (searchParams.get('q') || '').trim()

  const stocks = await loadStocks()

  if (!query) {
    // 쿼리 없으면 인기 종목 20개 반환
    return NextResponse.json(stocks.slice(0, 20))
  }

  const q = query.toLowerCase()

  // 초성 검색 지원 (ㅎㄷㅊ → 현대차)
  const isChosung = /^[ㄱ-ㅎ]+$/.test(query)

  const results = stocks.filter((s) => {
    if (s.name.toLowerCase().includes(q)) return true
    if (s.code.includes(q)) return true
    if (isChosung && matchChosung(s.name, query)) return true
    return false
  }).slice(0, 20)

  return NextResponse.json(results)
}

// ─── 초성 검색 유틸 ─────────────────────────────────
const CHOSUNG = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ']
const GA = 0xAC00 // '가' 유니코드

const getChosung = (char: string): string => {
  const code = char.charCodeAt(0)
  if (code < GA || code > 0xD7A3) return char // 한글 아니면 그대로
  const idx = Math.floor((code - GA) / 588)
  return CHOSUNG[idx] ?? char
}

const matchChosung = (name: string, chosungQuery: string): boolean => {
  const nameChosung = [...name].map(getChosung).join('')
  return nameChosung.includes(chosungQuery)
}
