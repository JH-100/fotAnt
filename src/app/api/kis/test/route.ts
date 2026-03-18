// KIS API 연결 테스트 — 토큰 발급 진단
import { NextResponse } from 'next/server'
import type { TradingMode } from '@/lib/kis-api'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mode = (searchParams.get('mode') || 'mock') as TradingMode

  const results: Record<string, unknown> = { mode, timestamp: new Date().toISOString() }

  // 1. 환경변수 확인
  const envCheck = mode === 'mock'
    ? {
        appKey: !!(process.env.KIS_MOCK_APP_KEY || process.env.KIS_APP_KEY),
        appSecret: !!(process.env.KIS_MOCK_APP_SECRET || process.env.KIS_APP_SECRET),
        accountNo: !!(process.env.KIS_MOCK_ACCOUNT_NO || process.env.KIS_ACCOUNT_NO),
        appKeyLen: (process.env.KIS_MOCK_APP_KEY || process.env.KIS_APP_KEY || '').length,
        appSecretLen: (process.env.KIS_MOCK_APP_SECRET || process.env.KIS_APP_SECRET || '').length,
        baseUrl: 'https://openapivts.koreainvestment.com:29443',
      }
    : {
        appKey: !!(process.env.KIS_REAL_APP_KEY || process.env.KIS_APP_KEY),
        appSecret: !!(process.env.KIS_REAL_APP_SECRET || process.env.KIS_APP_SECRET),
        accountNo: !!(process.env.KIS_REAL_ACCOUNT_NO || process.env.KIS_ACCOUNT_NO),
        appKeyLen: (process.env.KIS_REAL_APP_KEY || process.env.KIS_APP_KEY || '').length,
        appSecretLen: (process.env.KIS_REAL_APP_SECRET || process.env.KIS_APP_SECRET || '').length,
        baseUrl: 'https://openapi.koreainvestment.com:9443',
      }

  results.envCheck = envCheck

  if (!envCheck.appKey || !envCheck.appSecret) {
    results.error = `${mode} 모드의 APP_KEY 또는 APP_SECRET이 .env.local에 없습니다.`
    return NextResponse.json(results, { status: 400 })
  }

  // 2. 토큰 발급 시도
  try {
    const baseUrl = envCheck.baseUrl
    const appKey = mode === 'mock'
      ? (process.env.KIS_MOCK_APP_KEY || process.env.KIS_APP_KEY || '')
      : (process.env.KIS_REAL_APP_KEY || process.env.KIS_APP_KEY || '')
    const appSecret = mode === 'mock'
      ? (process.env.KIS_MOCK_APP_SECRET || process.env.KIS_APP_SECRET || '')
      : (process.env.KIS_REAL_APP_SECRET || process.env.KIS_APP_SECRET || '')

    const tokenStart = Date.now()
    const res = await fetch(`${baseUrl}/oauth2/tokenP`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        appkey: appKey,
        appsecret: appSecret,
      }),
    })
    const tokenTime = Date.now() - tokenStart

    const text = await res.text()
    let data: Record<string, unknown> = {}
    try { data = JSON.parse(text) } catch { data = { raw: text.slice(0, 500) } }

    results.tokenRequest = {
      httpStatus: res.status,
      responseTimeMs: tokenTime,
      hasAccessToken: !!data.access_token,
      expiresIn: data.expires_in,
      errorCode: data.error_code,
      errorDescription: data.error_description,
      msg1: data.msg1,
      tokenPrefix: typeof data.access_token === 'string' ? data.access_token.slice(0, 20) + '...' : null,
    }

    if (!data.access_token) {
      results.error = `토큰 발급 실패: ${data.error_description || data.msg1 || '응답에 access_token 없음'}`
      return NextResponse.json(results, { status: 502 })
    }

    results.success = true
    results.message = `${mode} 모드 토큰 발급 성공 (${tokenTime}ms)`

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    results.error = `네트워크 오류: ${msg}`
    results.hint = `${envCheck.baseUrl} 에 연결할 수 없습니다. 방화벽/VPN 확인 필요.`
    return NextResponse.json(results, { status: 502 })
  }

  return NextResponse.json(results)
}
