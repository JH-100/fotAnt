'use client'

import React from 'react'

interface Props { children: React.ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] 클라이언트 에러:', error.message, info.componentStack)
  }

  handleReset = () => {
    // localStorage 캐시 초기화 후 새로고침
    try {
      localStorage.removeItem('auto-trade-storage')
      localStorage.removeItem('trading-storage')
    } catch { /* ignore */ }
    window.location.reload()
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 p-8 text-center">
          <div className="rounded-2xl border border-red-500/30 bg-red-950/30 p-8 backdrop-blur max-w-lg w-full">
            <p className="text-2xl font-bold text-red-400 mb-2">⚠️ 렌더링 오류</p>
            <p className="text-sm text-muted-foreground mb-4">
              캐시 데이터와 현재 코드가 맞지 않아 발생한 일시적 오류입니다.
            </p>
            <code className="block bg-black/40 rounded p-3 text-xs text-red-300 text-left mb-6 overflow-auto max-h-32">
              {this.state.error.message}
            </code>
            <button
              onClick={this.handleReset}
              className="w-full rounded-xl bg-red-600 hover:bg-red-500 px-6 py-3 text-sm font-semibold text-white transition-colors"
            >
              캐시 초기화 후 새로고침
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
