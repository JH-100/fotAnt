import { NextResponse } from 'next/server'
import { resetAllKisTokens, getKisToken } from '@/lib/kis-api'

// POST /api/kis/token-reset — 토큰 강제 리셋 후 재발급
export async function POST() {
  try {
    // 1) 기존 토큰 모두 삭제
    resetAllKisTokens()

    // 2) 새 토큰 자동 발급
    const newToken = await getKisToken()

    return NextResponse.json({
      success: true,
      message: '토큰 리셋 완료 — 새 토큰 발급됨',
      tokenPreview: `${newToken.slice(0, 10)}...`,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { success: false, message: `토큰 리셋 실패: ${msg}` },
      { status: 500 }
    )
  }
}
