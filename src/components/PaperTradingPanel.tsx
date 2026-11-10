import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { formatAud, placePaperOrder } from '../lib/paperApi'
import { useTradingMode } from '../lib/tradingMode'
import { PaperDayReplay } from './learn/PaperDayReplay'
import { PaperRiskSizer } from './learn/PaperRiskSizer'
import { PaperPatternDrill } from './learn/PaperPatternDrill'
import { PaperWhatIf } from './learn/PaperWhatIf'
import { PaperLearnGuide } from './learn/PaperLearnGuide'

type Position = {
  ticker: string
  qty: number
  avgCost: number
  mark: number
  marketValue: number
  costBasis: number
  unrealizedPnl: number
  unrealizedPnlPct: number
}

type Portfolio = {
  cash: number
  startingCash: number
  positionsValue: number
  equity: number
  totalPnl: number
  totalPnlPct: number
  positions: Position[]
}

type Trade = {
  id: string
  ticker: string
  side: string
  qty: number
  price: number
  createdAt: number
}

type LearnTab = 'guide' | 'portfolio' | 'replay' | 'risk' | 'drill' | 'whatif'

function pnlClass(n: number) {
  if (n > 0) return 'text-emerald-700 dark:text-emerald-300'
  if (n < 0) return 'text-rose-700 dark:text-rose-300'
  return 'text-[var(--color-ink-soft)]'
}

function fmtPct(n: number) {
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

export function PaperTradingPanel() {
  const { setMode, refreshPaperSummary } = useTradingMode()
  const [tab, setTab] = useState<LearnTab>('portfolio')
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [trades, setTrades] = useState<Trade[]>([])
  const [ticker, setTicker] = useState('')
  const [qty, setQty] = useState('10')
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const [pRes, tRes] = await Promise.all([
      fetch('/api/paper/portfolio', { credentials: 'include' }),
      fetch('/api/paper/trades?limit=40', { credentials: 'include' }),
    ])
    const pJson = await pRes.json().catch(() => ({}))
    const tJson = await tRes.json().catch(() => ({}))
    if (!pRes.ok) {
      throw new Error((pJson as { error?: string }).error || 'Could not load portfolio')
    }
    setPortfolio((pJson as { portfolio: Portfolio }).portfolio)
    if (tRes.ok) setTrades((tJson as { trades?: Trade[] }).trades || [])
    await refreshPaperSummary()
  }, [refreshPaperSummary])

  useEffect(() => {
    setMode('paper')
  }, [setMode])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        await refresh()
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refresh])

  const submitOrder = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setBusy(true)
    const result = await placePaperOrder({
      ticker: ticker.trim().toUpperCase(),
      side,
      qty: Number(qty),
      source: 'learn_hub',
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setInfo(
      `${result.fill.side.toUpperCase()} ${result.fill.qty} ${result.fill.ticker} @ ${formatAud(result.fill.price)} (fake money)`,
    )
    await refresh()
  }

  const onReset = async () => {
    if (
      !window.confirm(
        'Reset this practice portfolio to A$100,000 cash and clear all holdings and trades?',
      )
    ) {
      return
    }
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      const res = await fetch('/api/paper/reset', {
        method: 'POST',
        credentials: 'include',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError((json as { error?: string }).error || 'Reset failed')
        return
      }
      setPortfolio((json as { portfolio: Portfolio }).portfolio)
      setTrades([])
      setInfo('Portfolio reset to starting cash.')
      await refreshPaperSummary()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const tabs: { id: LearnTab; label: string }[] = [
    { id: 'guide', label: 'Guide' },
    { id: 'portfolio', label: 'Portfolio' },
    { id: 'replay', label: 'Session replay' },
    { id: 'risk', label: 'Risk sizing' },
    { id: 'drill', label: 'Pattern drill' },
    { id: 'whatif', label: 'What-if' },
  ]

  if (loading && !portfolio) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center shadow-sm">
        <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-teal-200 border-t-teal-600" />
        <p className="text-sm text-[var(--color-ink-soft)]">Loading Learn hub…</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-amber-300/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
        <p className="font-semibold">Learn · Paper mode</p>
        <p className="mt-1 opacity-90">
          Practice with fake A$100,000 on the same desk prices. Switch Live / Paper in the header to
          trade from Markets and charts; use this hub for portfolio and simulators.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              tab === t.id
                ? 'bg-amber-700 text-white'
                : 'text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </div>
      )}
      {info && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-200">
          {info}
        </div>
      )}

      {tab === 'guide' && <PaperLearnGuide />}
      {tab === 'replay' && <PaperDayReplay onPortfolioChange={() => void refresh()} />}
      {tab === 'risk' && <PaperRiskSizer onPortfolioChange={() => void refresh()} />}
      {tab === 'drill' && <PaperPatternDrill onPortfolioChange={() => void refresh()} />}
      {tab === 'whatif' && <PaperWhatIf />}

      {tab === 'portfolio' && portfolio && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Cash', formatAud(portfolio.cash)],
              ['Holdings', formatAud(portfolio.positionsValue)],
              ['Equity', formatAud(portfolio.equity)],
              [
                'Total P&L',
                `${formatAud(portfolio.totalPnl)} (${fmtPct(portfolio.totalPnlPct)})`,
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3"
              >
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                  {label}
                </div>
                <div
                  className={`mt-1 font-[family-name:var(--font-display)] text-lg font-semibold ${
                    label === 'Total P&L' ? pnlClass(portfolio.totalPnl) : ''
                  }`}
                >
                  {value}
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_1fr]">
            <form
              onSubmit={(e) => void submitOrder(e)}
              className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm"
            >
              <h2 className="font-[family-name:var(--font-display)] text-base font-semibold">
                Place market order
              </h2>
              <label className="block space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                  Ticker
                </span>
                <input
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  placeholder="BHP"
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2 text-sm outline-none focus:border-teal-500"
                  required
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                  Quantity
                </span>
                <input
                  type="number"
                  min={0.0001}
                  step="any"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2 text-sm outline-none focus:border-teal-500"
                  required
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSide('buy')}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${
                    side === 'buy'
                      ? 'bg-emerald-700 text-white'
                      : 'border border-[var(--color-border)] text-[var(--color-ink)]'
                  }`}
                >
                  Buy
                </button>
                <button
                  type="button"
                  onClick={() => setSide('sell')}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${
                    side === 'sell'
                      ? 'bg-rose-700 text-white'
                      : 'border border-[var(--color-border)] text-[var(--color-ink)]'
                  }`}
                >
                  Sell
                </button>
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
              >
                {busy ? 'Working…' : side === 'buy' ? 'Buy (paper)' : 'Sell (paper)'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onReset()}
                className="w-full rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)]"
              >
                Reset portfolio
              </button>
            </form>

            <div className="space-y-5">
              <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
                <div className="border-b border-[var(--color-border)] px-4 py-3">
                  <h2 className="font-[family-name:var(--font-display)] text-base font-semibold">
                    Holdings
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-[var(--color-muted)]/50 text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Ticker</th>
                        <th className="px-3 py-2 font-semibold">Qty</th>
                        <th className="px-3 py-2 font-semibold">Avg</th>
                        <th className="px-3 py-2 font-semibold">Mark</th>
                        <th className="px-3 py-2 font-semibold">Value</th>
                        <th className="px-3 py-2 font-semibold">P&amp;L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portfolio.positions.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-3 py-6 text-center text-[var(--color-ink-soft)]"
                          >
                            No holdings yet — trade from Markets in Paper mode or use the ticket.
                          </td>
                        </tr>
                      ) : (
                        portfolio.positions.map((p) => (
                          <tr key={p.ticker} className="border-t border-[var(--color-border)]">
                            <td className="px-3 py-2 font-semibold">{p.ticker}</td>
                            <td className="px-3 py-2 tabular-nums">{p.qty}</td>
                            <td className="px-3 py-2 tabular-nums">{formatAud(p.avgCost)}</td>
                            <td className="px-3 py-2 tabular-nums">{formatAud(p.mark)}</td>
                            <td className="px-3 py-2 tabular-nums">{formatAud(p.marketValue)}</td>
                            <td className={`px-3 py-2 tabular-nums ${pnlClass(p.unrealizedPnl)}`}>
                              {formatAud(p.unrealizedPnl)} ({fmtPct(p.unrealizedPnlPct)})
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
                <div className="border-b border-[var(--color-border)] px-4 py-3">
                  <h2 className="font-[family-name:var(--font-display)] text-base font-semibold">
                    Recent trades
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-[var(--color-muted)]/50 text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
                      <tr>
                        <th className="px-3 py-2 font-semibold">When</th>
                        <th className="px-3 py-2 font-semibold">Side</th>
                        <th className="px-3 py-2 font-semibold">Ticker</th>
                        <th className="px-3 py-2 font-semibold">Qty</th>
                        <th className="px-3 py-2 font-semibold">Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trades.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-3 py-6 text-center text-[var(--color-ink-soft)]"
                          >
                            No trades yet.
                          </td>
                        </tr>
                      ) : (
                        trades.map((t) => (
                          <tr key={t.id} className="border-t border-[var(--color-border)]">
                            <td className="px-3 py-2 text-[var(--color-ink-soft)]">
                              {new Date(t.createdAt).toLocaleString()}
                            </td>
                            <td
                              className={`px-3 py-2 font-semibold uppercase ${
                                t.side === 'buy' ? 'text-emerald-700' : 'text-rose-700'
                              }`}
                            >
                              {t.side}
                            </td>
                            <td className="px-3 py-2 font-semibold">{t.ticker}</td>
                            <td className="px-3 py-2 tabular-nums">{t.qty}</td>
                            <td className="px-3 py-2 tabular-nums">{formatAud(t.price)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
