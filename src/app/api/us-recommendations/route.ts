import { NextResponse } from 'next/server'

// Dynamic imports to avoid client-side issues
const getScanner = async () => {
  const mod = await import('@/lib/us-stock-scanner')
  return mod
}

export async function GET() {
  try {
    const scanner = await getScanner()
    const status = scanner.getUSRecommendations()
    return NextResponse.json(status)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { action, mode } = body

    const scanner = await getScanner()

    if (action === 'start') {
      scanner.startUSScanner(mode)
      return NextResponse.json({ success: true, message: '미장 스캐너 시작' })
    }

    if (action === 'stop') {
      scanner.stopUSScanner()
      return NextResponse.json({ success: true, message: '미장 스캐너 중지' })
    }

    return NextResponse.json({ error: '알 수 없는 action' }, { status: 400 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
