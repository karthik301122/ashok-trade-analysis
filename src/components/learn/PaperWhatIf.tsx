import { useMemo, useState } from 'react'
import { fetchDeskOhlc, type OhlcBar } from '../../lib/deskSeries'
import { formatAud } from '../../lib/paperApi'

function isoDateUtc(tsSec: number): string {
  return new Date(tsSec * 1000).toISOString().slice(0, 10)
}

/** Closest bar on or before the requested calendar day (UTC date). */
function barOnOrBefore(bars: OhlcBar[], buyDate: string): OhlcBar | null {
  const targetEnd = Math.floor(new Date(`${buyDate}T23:59:59Z`).getTime() / 1000)
  let best: OhlcBar | null = null
  for (const b of bars) {
    if (b.t > targetEnd) break
    best = b
  }
  return best
}

export function PaperWhatIf() {
  const [ticker, setTicker] = useState('BHP')
  const [buyPrice, setBuyPrice] = useState('')
  const [qty, setQty] = useState('100')
  const [buyDate, setBuyDate] = useState('2025-01-02')
  const [resolvedEntry, setResolvedEntry] = useState<number | null>(null)
  const [resolvedBuyDate, setResolvedBuyDate] = useState<string | null>(null)
  const [mark, setMark] = useState<number | null>(null)
  const [markDate, setMarkDate] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [usedOverride, setUsedOverride] = useState(false)

  const entryPrice = useMemo(() => {
    const override = Number(buyPrice)
    if (buyPrice.trim() && Number.isFinite(override) && override > 0) return override
    return resolvedEntry
  }, [buyPrice, resolvedEntry])

  const result = useMemo(() => {
    const e = entryPrice
    const q = Number(qty)
    const m = mark
    if (e == null || m == null) return null
    if (![e, q, m].every((n) => Number.isFinite(n) && n > 0)) return null
    const cost = e * q
    const value = m * q
    const pnl = value - cost
    const pnlPct = (pnl / cost) * 100
    return { cost, value, pnl, pnlPct }
  }, [entryPrice, qty, mark])

  const run = async () => {
    setBusy(true)
    setError(null)
    const bars = await fetchDeskOhlc(ticker.trim().toUpperCase(), '2020-01-01', { staleOk: true })
    setBusy(false)
    if (!bars?.length) {
      setError('No series for ticker')
      setMark(null)
      setResolvedEntry(null)
      setResolvedBuyDate(null)
      setMarkDate(null)
      return
    }

    const entryBar = barOnOrBefore(bars, buyDate)
    if (!entryBar) {
      setError(`No trading day on or before ${buyDate}`)
      setMark(null)
      setResolvedEntry(null)
      setResolvedBuyDate(null)
      setMarkDate(null)
      return
    }

    const last = bars[bars.length - 1]
    const lastClose = Number(last?.c)
    const entryClose = Number(entryBar.c)
    if (!Number.isFinite(lastClose) || lastClose <= 0 || !Number.isFinite(entryClose) || entryClose <= 0) {
      setError('Could not resolve prices')
      setMark(null)
      setResolvedEntry(null)
      return
    }

    const entryIso = isoDateUtc(entryBar.t)
    const markIso = isoDateUtc(last.t)
    setResolvedEntry(entryClose)
    setResolvedBuyDate(entryIso)
    setMark(lastClose)
    setMarkDate(markIso)

    const override = Number(buyPrice)
    const hasOverride = Boolean(buyPrice.trim()) && Number.isFinite(override) && override > 0
    setUsedOverride(hasOverride)
    if (!hasOverride) {
      setBuyPrice(entryClose.toFixed(2))
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div>
        <h3 className="font-[family-name:var(--font-display)] text-base font-semibold">What-if</h3>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          Hypothetical long: entry from your buy date&apos;s desk close, marked to the latest desk
          close (read-only calculator).
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
          <span className="text-xs font-semibold uppercase text-[var(--color-ink-soft)]">
            Buy price (optional override)
          </span>
          <input
            value={buyPrice}
            onChange={(e) => setBuyPrice(e.target.value)}
            placeholder="Auto from buy date"
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
      {result && mark != null && entryPrice != null && (
        <div className="rounded-xl bg-[var(--color-muted)]/50 px-3 py-2 text-sm">
          <p>
            Bought on {resolvedBuyDate || buyDate} @ {formatAud(entryPrice)}
            {usedOverride ? ' (override)' : ''} → marked {markDate || 'latest'} @ {formatAud(mark)}
          </p>
          <p className="mt-1">
            Cost {formatAud(result.cost)} · value {formatAud(result.value)} ·{' '}
            <span className={result.pnl >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
              P&amp;L {formatAud(result.pnl)} ({result.pnlPct >= 0 ? '+' : ''}
              {result.pnlPct.toFixed(2)}%)
            </span>
          </p>
          {resolvedBuyDate && resolvedBuyDate !== buyDate && (
            <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
              No bar on {buyDate}; used the prior trading day {resolvedBuyDate}.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
