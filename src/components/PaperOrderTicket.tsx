import { useState, type FormEvent } from 'react'
import { formatAud, placePaperOrder } from '../lib/paperApi'
import { useTradingMode } from '../lib/tradingMode'

type Props = {
  ticker: string
  /** Optional hint price shown in the ticket (desk last). */
  hintPrice?: number | null
  compact?: boolean
  onFilled?: () => void
}

export function PaperOrderTicket({ ticker, hintPrice, compact, onFilled }: Props) {
  const { isPaper, refreshPaperSummary, setPaperToast } = useTradingMode()
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [qty, setQty] = useState('10')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isPaper) return null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const result = await placePaperOrder({
      ticker,
      side,
      qty: Number(qty),
      source: 'desk',
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setPaperToast(
      `${result.fill.side.toUpperCase()} ${result.fill.qty} ${result.fill.ticker} @ ${formatAud(result.fill.price)} (paper)`,
    )
    await refreshPaperSummary()
    onFilled?.()
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className={`rounded-xl border border-amber-300/80 bg-amber-50/90 p-3 dark:border-amber-800 dark:bg-amber-950/40 ${
        compact ? 'space-y-2' : 'space-y-3'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-100">
          Paper trade · {ticker}
        </p>
        {hintPrice != null && Number.isFinite(hintPrice) && hintPrice > 0 && (
          <p className="text-xs text-amber-800/80 dark:text-amber-200/80">
            Desk ~{formatAud(hintPrice)}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[88px] flex-1 space-y-1">
          <span className="text-[10px] font-semibold uppercase text-amber-900/70 dark:text-amber-200/70">
            Qty
          </span>
          <input
            type="number"
            min={0.0001}
            step="any"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-full rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-sm dark:border-amber-700 dark:bg-amber-950/60"
            required
          />
        </label>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setSide('buy')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              side === 'buy'
                ? 'bg-emerald-700 text-white'
                : 'border border-amber-300 text-amber-950 dark:border-amber-700 dark:text-amber-100'
            }`}
          >
            Buy
          </button>
          <button
            type="button"
            onClick={() => setSide('sell')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              side === 'sell'
                ? 'bg-rose-700 text-white'
                : 'border border-amber-300 text-amber-950 dark:border-amber-700 dark:text-amber-100'
            }`}
          >
            Sell
          </button>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
        >
          {busy ? '…' : 'Fill'}
        </button>
      </div>
      {error && <p className="text-xs text-rose-700 dark:text-rose-300">{error}</p>}
    </form>
  )
}
