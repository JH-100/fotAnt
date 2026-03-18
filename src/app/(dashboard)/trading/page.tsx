import { redirect } from 'next/navigation'

// 매매 페이지는 대시보드에 통합됨 — URL 호환용 리다이렉트
const TradingPage = () => {
  redirect('/')
}

export default TradingPage
