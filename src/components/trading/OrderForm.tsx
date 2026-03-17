'use client'

// 주문 폼 컴포넌트
import { useState } from 'react'
import useTrade from '@/hooks/use-trade'
import useTradingStore from '@/store/trading-store'
import type { KisOrderRequest } from '@/types/kis'

const OrderForm = () => {
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [code, setCode] = useState('')
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market')

  const trade = useTrade()
  const { openConfirm, isConfirmOpen, pendingOrder, closeConfirm } = useTradingStore()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!code || !quantity) return

    const order: KisOrderRequest = {
      side,
      code,
      quantity: parseInt(quantity, 10),
      price: orderType === 'limit' ? parseInt(price, 10) : undefined,
      orderType,
    }

    openConfirm(order)
  }

  const handleConfirm = () => {
    if (!pendingOrder) return
    trade.mutate(pendingOrder)
    closeConfirm()
    setCode('')
    setQuantity('')
    setPrice('')
  }

  return (
    <>
      <div className="glass rounded-2xl p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="h-5 w-1 rounded-full bg-gradient-to-b from-emerald-400 to-blue-500" />
          <h3 className="font-semibold">주문</h3>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 매수/매도 토글 */}
          <div className="flex gap-1 rounded-xl bg-white/[0.03] p-1">
            <button
              type="button"
              onClick={() => setSide('buy')}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
                side === 'buy' ? 'bg-emerald-500/20 text-emerald-400' : 'text-muted-foreground'
              }`}
            >
              매수
            </button>
            <button
              type="button"
              onClick={() => setSide('sell')}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
                side === 'sell' ? 'bg-rose-500/20 text-rose-400' : 'text-muted-foreground'
              }`}
            >
              매도
            </button>
          </div>

          {/* 종목코드 */}
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">종목코드</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="005930"
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-sm outline-none transition-colors focus:border-white/20"
            />
          </div>

          {/* 주문유형 */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOrderType('market')}
              className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition-all ${
                orderType === 'market' ? 'border-white/20 bg-white/10' : 'border-white/5 text-muted-foreground'
              }`}
            >
              시장가
            </button>
            <button
              type="button"
              onClick={() => setOrderType('limit')}
              className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition-all ${
                orderType === 'limit' ? 'border-white/20 bg-white/10' : 'border-white/5 text-muted-foreground'
              }`}
            >
              지정가
            </button>
          </div>

          {/* 수량 */}
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">수량</label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="1"
              min="1"
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-sm outline-none transition-colors focus:border-white/20"
            />
          </div>

          {/* 가격 (지정가일 때만) */}
          {orderType === 'limit' && (
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">가격</label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="70000"
                min="1"
                className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-sm outline-none transition-colors focus:border-white/20"
              />
            </div>
          )}

          {/* 주문 버튼 */}
          <button
            type="submit"
            disabled={!code || !quantity || trade.isPending}
            className={`w-full rounded-xl py-3 text-sm font-semibold transition-all disabled:opacity-40 ${
              side === 'buy'
                ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                : 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
            }`}
          >
            {trade.isPending ? '주문 중...' : side === 'buy' ? '매수 주문' : '매도 주문'}
          </button>

          {/* 결과 메시지 */}
          {trade.isSuccess && (
            <p className="text-center text-xs text-emerald-400">
              주문 완료: {trade.data.message}
            </p>
          )}
          {trade.isError && (
            <p className="text-center text-xs text-rose-400">
              {trade.error.message}
            </p>
          )}
        </form>
      </div>

      {/* 주문 확인 다이얼로그 */}
      {isConfirmOpen && pendingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="glass mx-4 w-full max-w-sm rounded-2xl p-6">
            <h3 className="mb-4 text-lg font-semibold">주문 확인</h3>
            <div className="mb-6 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">구분</span>
                <span className={pendingOrder.side === 'buy' ? 'text-emerald-400' : 'text-rose-400'}>
                  {pendingOrder.side === 'buy' ? '매수' : '매도'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">종목</span>
                <span className="font-mono">{pendingOrder.code}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">수량</span>
                <span className="font-mono">{pendingOrder.quantity}주</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">유형</span>
                <span>{pendingOrder.orderType === 'market' ? '시장가' : `지정가 ${pendingOrder.price?.toLocaleString()}원`}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={closeConfirm}
                className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-medium transition-colors hover:bg-white/[0.05]"
              >
                취소
              </button>
              <button
                onClick={handleConfirm}
                className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all ${
                  pendingOrder.side === 'buy'
                    ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
                }`}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default OrderForm
