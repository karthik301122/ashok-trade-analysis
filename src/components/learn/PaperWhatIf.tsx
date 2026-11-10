import { useMemo, useState } from 'react'
import { fetchDeskOhlc } from '../../lib/deskSeries'
import { formatAud } from '../../lib/paperApi'

export function PaperWhatIf() {
  const [ticker, setTicker] = useState('BHP')
  const [buyPrice, setBuyPrice] = useState('40')
  const [qty, setQty] = useState('100')
  const [buyDate, setBuyDate] = useState('2025-01-02')
  const [mark, setMark] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const result = useMemo(() => {
    const e = Number(buyPrice)
    const q = Number(qty)
    const m = mark
    if (![e, q].every((n) => Number.isFinite(n) && n > 0) || m == null || m <= 0) return null
    const cost = e * q
    const value = m * q
    const pnl = value - cost
    const pnlPct = (pnl / cost) * 100
    return { cost, value, pnl, pnlPct }
  }, [buyPrice, qty, mark])

  const run = async () => {
    setBusy(true)
    setError(null)
    const bars = await fetchDeskOhlc(ticker.trim().toUpperCase(), '2020-01-01', { staleOk: true })
    setBusy(false)
    if (!bars?.length) {
      setError('No series for ticker')
      setMark(null)
      return
    }
    const last = Number(bars[bars.length - 1]?.c)
    if (!Number.isFinite(last) || last <= 0) {
      setError('No last price')
      setMark(null)
      return
    }
    setMark(last)
  }

  return (
    <div className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div>
        <h3 className="font-[family-name:var(--font-display)] text-base font-semibold">What-if</h3>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          Hypothetical long: mark against today&apos;s desk last (read-only calculator).
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-xs font-semibold uppercase text-[var(--color-ink-soft)]">Ticker</span>
          <input
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs font-semibold uppercase text-[var(--color-ink-soft)]">Buy date</span>
          <input
            type="date"
            value={buyDate}
            onChange={(e) => setBuyDate(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs font-semibold uppercase text-[var(--color-ink-soft)]">Buy price</span>
          <input
            value={buyPrice}
            onChange={(e) => setBuyPrice(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs font-semibold uppercase text-[var(--color-ink-soft)]">Qty</span>
          <input
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2"
          />
        </label>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void run()}
        className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
      >
        {busy ? 'Loading…' : 'Mark to market'}
      </button>
      {error && <p className="text-sm text-rose-700">{error}</p>}
      {result && mark != null && (
        <div className="rounded-xl bg-[var(--color-muted)]/50 px-3 py-2 text-sm">
          Mark {formatAud(mark)} · cost {formatAud(result.cost)} · value {formatAud(result.value)} ·{' '}
          <span className={result.pnl >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
            P&amp;L {formatAud(result.pnl)} ({result.pnlPct >= 0 ? '+' : ''}
            {result.pnlPct.toFixed(2)}%)
          </span>
          <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
            Buy date {buyDate} is for your notes — mark uses the latest desk close.
          </p>
        </div>
      )}
    </div>
  )
}
