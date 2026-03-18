'use client'

// 상단 네비게이션 바
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/', label: '대시보드' },
  { href: '/auto-trade', label: '자동매매' },
  { href: '/settings', label: '설정' },
]

const Navigation = () => {
  const pathname = usePathname()

  return (
    <nav className="glass border-b border-white/[0.06]">
      <div className="mx-auto flex max-w-7xl items-center gap-1 px-4 py-3 sm:px-6 lg:px-8">
        {/* 로고 */}
        <Link href="/" className="mr-6 bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-lg font-bold text-transparent">
          StockAuto
        </Link>

        {/* 메뉴 */}
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === '/'
            ? pathname === '/'
            : pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                isActive
                  ? 'bg-white/10 text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export default Navigation
