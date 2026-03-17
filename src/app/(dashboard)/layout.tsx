// 대시보드 레이아웃 (네비게이션 포함)
import Navigation from '@/components/layout/Navigation'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <Navigation />
      {children}
    </>
  )
}
