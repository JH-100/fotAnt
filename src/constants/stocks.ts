// 모니터링 대상 주식 및 환율 상수

/** 모니터링할 환율 쌍 */
export const EXCHANGE_PAIRS = [
  { from: 'USD', to: 'KRW', label: '달러/원' },
  { from: 'JPY', to: 'KRW', label: '엔/원' },
  { from: 'EUR', to: 'KRW', label: '유로/원' },
  { from: 'CNY', to: 'KRW', label: '위안/원' },
] as const

/** 모니터링할 국내 주식 (코드: A + 종목코드) */
export const KR_STOCKS = [
  // 대형주
  { code: '005930', name: '삼성전자' },
  { code: '000660', name: 'SK하이닉스' },
  { code: '035420', name: 'NAVER' },
  { code: '035720', name: '카카오' },
  { code: '051910', name: 'LG화학' },
  { code: '006400', name: '삼성SDI' },
  { code: '373220', name: 'LG에너지솔루션' },
  { code: '005380', name: '현대차' },
  { code: '068270', name: '셀트리온' },
  { code: '000270', name: '기아' },
  { code: '055550', name: '신한지주' },
  { code: '105560', name: 'KB금융' },
  { code: '003670', name: '포스코퓨처엠' },
  { code: '012330', name: '현대모비스' },
  { code: '066570', name: 'LG전자' },
  { code: '003550', name: 'LG' },
  { code: '034730', name: 'SK' },
  { code: '096770', name: 'SK이노베이션' },
  { code: '028260', name: '삼성물산' },
  { code: '207940', name: '삼성바이오로직스' },
  // 중소형주
  { code: '247540', name: '에코프로비엠' },
  { code: '086520', name: '에코프로' },
  { code: '003490', name: '대한항공' },
  { code: '010130', name: '고려아연' },
  { code: '352820', name: '하이브' },
  { code: '263750', name: '펄어비스' },
  { code: '259960', name: '크래프톤' },
  { code: '112040', name: '위메이드' },
  { code: '293490', name: '카카오게임즈' },
  { code: '036570', name: '엔씨소프트' },
  // ETF / 인버스 / 레버리지
  { code: '069500', name: 'KODEX 200' },
  { code: '114800', name: 'KODEX 인버스' },
  { code: '252670', name: 'KODEX 200선물인버스2X' },
  { code: '122630', name: 'KODEX 레버리지' },
  { code: '233740', name: 'KODEX 코스닥150레버리지' },
  { code: '251340', name: 'KODEX 코스닥150선물인버스' },
  { code: '261240', name: 'KODEX 미국나스닥100선물(H)' },
  { code: '371460', name: 'TIGER 차이나전기차SOLACTIVE' },
  { code: '381180', name: 'TIGER 미국테크TOP10 INDXX' },
  { code: '133690', name: 'TIGER 미국나스닥100' },
  // 저가주 / 동전주
  { code: '004410', name: '서울식품' },
  { code: '001940', name: 'KISCO홀딩스' },
  { code: '002710', name: 'TCC스틸' },
  { code: '900140', name: '커넥트웨이브' },
  { code: '040610', name: 'SG세계물산' },
  { code: '023770', name: '플레이위드' },
  { code: '214370', name: '케어젠' },
  { code: '194480', name: '데브시스터즈' },
  { code: '041190', name: '우리기술투자' },
  { code: '290650', name: '엘앤씨바이오' },
  { code: '058970', name: '엠로' },
  { code: '089030', name: '테크윙' },
  { code: '033640', name: '네패스' },
  { code: '950160', name: '코오롱티슈진' },
  { code: '042700', name: '한미반도체' },
  // 소형 바이오/제약
  { code: '009420', name: '한올바이오파마' },
  { code: '214150', name: '클래시스' },
  { code: '145020', name: '휴젤' },
  { code: '196170', name: '알테오젠' },
  { code: '328130', name: '루닛' },
] as const

/** 데이터 갱신 주기 (밀리초) */
export const REFRESH_INTERVAL = 30_000
