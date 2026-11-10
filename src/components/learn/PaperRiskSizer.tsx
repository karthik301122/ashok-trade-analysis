import { useMemo, useState } from 'react'
import { formatAud, placePaperOrder } from '../../lib/paperApi'
import { useTradingMode } from '../../lib/tradingMode'

type Props = {
  onPortfolioChange?: () => void
}

export function PaperRiskSizer({ onPortfolioChange }: Props) {
  const { isPaper, paperSummary, setMode, setPaperToast, refreshPaperSummary } = useTradingMode()
  const [ticker, setTicker] = useState('CBA')
  const [account, setAccount] = useState(() => String(paperSummary?.equity || 100000))
  const [riskPct, setRiskPct] = useState('1')
  const [entry, setEntry] = useState('100')
  const [stop, setStop] = useState('95')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const calc = useMemo(() => {
    const equity = Number(account)
    const risk = Number(riskPct)
    const e = Number(entry)
    const s = Number(stop)
    if (![equity, risk, e, s].every((n) => Number.isFinite(n) && n > 0)) return null
    if (e <= s) return { error: 'Entry must be above stop for a long risk size' as const }
    const riskAud = (equity * risk) / 100
    const perShare = e - s
    const shares = Math.floor(riskAud / perShare)
    const notional = shares * e
    return { riskAud, perShare, shares, notional, error: null as null }
  }, [account, riskPct, entry, stop])

  const buySized = async () => {
    if (!calc || calc.error || calc.shares <= 0) return
    setBusy(true)
    setError(null)
    setMode('paper')
    const result = await placePaperOrder({
      ticker: ticker.trim().toUpperCase(),
      side: 'buy',
      qty: calc.shares,
      fillPrice: Number(entry),
      source: 'risk_sizer',
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setPaperToast(
      `Risk-sized BUY ${result.fill.qty} ${result.fill.ticker} @ ${formatAud(result.fill.price)}`,
    )
    await refreshPaperSummary()
    onPortfolioChange?.()
  }

  return (
    <div className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div>
        <h3 className="font-[family-name:var(--font-display)] text-base font-semibold">
          Risk sizing
        </h3>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          Size a long from account risk %, entry, and stop — then paper-buy that share count.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {(
          [
            ['Ticker', ticker, setTicker, false],
            ['Account A$', account, setAccount, true],
            ['Risk %', riskPct, setRiskPct, true],
            ['Entry', entry, setEntry, true],
            ['Stop', stop, setStop, true],
          ] as const
        ).map(([label, value, set, num]) => (
          <label key={label} className="space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase text-[var(--color-ink-soft)]">{label}</span>
            <input
              value={value}
              onChange={(e) => set(num ? e.target.value : e.target.value.toUpperCase())}
              className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2"
            />
          </label>
        ))}
      </div>
      {calc?.error && <p className="text-sm text-rose-700">{calc.error}</p>}
      {calc && !calc.error && (
        <div className="rounded-xl bg-[var(--color-muted)]/50 px-3 py-2 text-sm">
          Risk budget {formatAud(calc.riskAud)} · {calc.shares.toLocaleString()} shares · notional{' '}
          {formatAud(calc.notional)}
        </div>
      )}
      {error && <p className="text-sm text-rose-700">{error}</p>}
      <button
        type="button"
        disabled={busy || !calc || !!calc.error || calc.shares <= 0}
        onClick={() => void buySized()}
        className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
      >
        {isPaper ? 'Paper buy this size' : 'Switch to Paper & buy'}
      </button>
    </div>
  )
}
