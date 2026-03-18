// 자율 스캘핑 API — 서버 사이드 스케줄러 제어
import { NextResponse } from 'next/server'
import { isKisConfigured } from '@/lib/kis-api'
import {
  startScheduler,
  stopScheduler,
  getSchedulerStatus,
  updateSchedulerConfig,
} from '@/lib/server-scheduler'
import type { ScalpingConfig } from '@/lib/scalping-engine'

/** POST: 스케줄러 시작/중지/설정 변경 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { action, config, password } = body as {
      action: 'start' | 'stop' | 'update'
      config?: Partial<ScalpingConfig>
      password?: string
    }

    const mode = config?.mode || getSchedulerStatus().config.mode

    // 실전 모드 비밀번호 체크 — start만 (stop/update는 비밀번호 불필요)
    if (mode === 'real' && action === 'start') {
      const correctPassword = process.env.TRADING_PASSWORD
      if (!password || password !== correctPassword) {
        return NextResponse.json(
          { error: '실전투자 비밀번호가 올바르지 않습니다.' },
          { status: 403 }
        )
      }
    }

    if (action === 'start') {
      if (!isKisConfigured(mode)) {
        return NextResponse.json(
          { error: `KIS API (${mode === 'real' ? '실전' : '모의'})가 설정되지 않았습니다.` },
          { status: 503 }
        )
      }
      startScheduler(config)
      return NextResponse.json({
        message: '스캘핑 스케줄러 시작됨',
        ...getSchedulerStatus(),
      })
    }

    if (action === 'stop') {
      stopScheduler()
      return NextResponse.json({
        message: '스캘핑 스케줄러 중지됨',
        ...getSchedulerStatus(),
      })
    }

    if (action === 'update' && config) {
      updateSchedulerConfig(config)
      return NextResponse.json({
        message: '설정 업데이트됨',
        ...getSchedulerStatus(),
      })
    }

    return NextResponse.json({ error: '잘못된 action' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '스캘핑 실행 실패'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** GET: 스케줄러 상태 + 로그 + 스캔 결과 */
export async function GET() {
  return NextResponse.json(getSchedulerStatus())
}
