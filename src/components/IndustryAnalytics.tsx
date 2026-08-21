import { useMemo, useState } from 'react'
import type { MarketSnapshot } from '../data/types'
import { formatPct } from '../lib/format'

type Props = { snapshot: MarketSnapshot }
type Mode = 'near52' | 'rs' | 'hist'

export function IndustryAnalytics({ snapshot }: Props) {
  const [mode, setMode] = useState<Mode>('near52')
  const [from52, setFrom52] = useState(5)
  const [minStocks, setMinStocks] = useState(2)
  const [showTop, setShowTop] = useState(35)

  const rows = useMemo(() => {
    return snapshot.industries
      .filter((ind) => ind.stocks.length >= minStocks)
      .map((ind) => {
        let value = 0
        if (mode === 'rs') value = ind.avgRs
        else if (mode === 'hist') value = ind.perf.m3
        else
          value =
            (ind.stocks.filter((s) => Math.abs(s.from52wHigh) <= from52).length / ind.stocks.length) *
            100
        return { ind, value }
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, showTop)
  }, [snapshot.industries, mode, from52, minStocks, showTop])

  const maxVal = Math.max(...rows.map((r) => Math.abs(r.value)), 1)
  const title =
    mode === 'rs'
      ? 'Relative Strength'
      : mode === 'hist'
        ? 'Historical Performance'
        : 'Near 52W High'
  const subtitle =
    mode === 'rs'
      ? 'Average RS strength across all stocks in the industry'
      : mode === 'hist'
        ? '% performance over 3M (3-month) timeframe'
        : `% of stocks trading within ${from52}% of their 52-week high`

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['near52', 'Near 52W High'],
            ['rs', 'Relative Strength'],
            ['hist', 'Historical Performance'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase ${
              mode === id
                ? 'border-sky-500 bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200'
                : 'border-[var(--color-border)] bg-[var(--color-surface)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-4 text-sm">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-[var(--color-ink-soft)]">% from 52W High &lt;</span>
          <input
            type="number"
            value={from52}
            onChange={(e) => setFrom52(Number(e.target.value) || 0)}
            className="w-24 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-[var(--color-ink-soft)]">No. of stocks in Industry &gt;</span>
          <input
            type="number"
            value={minStocks}
            onChange={(e) => setMinStocks(Number(e.target.value) || 0)}
            className="w-24 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-[var(--color-ink-soft)]">Show Top</span>
          <input
            type="number"
            value={showTop}
            onChange={(e) => setShowTop(Number(e.target.value) || 10)}
            className="w-24 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5"
          />
        </label>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mb-4 text-xs text-[var(--color-ink-soft)]">{subtitle}</p>
        <div className="space-y-1.5">
          {rows.map(({ ind, value }) => (
            <div key={ind.name} className="flex items-center gap-3 px-1 py-1">
              <span className="w-52 shrink-0 truncate text-xs font-medium">{ind.name}</span>
              <div className="h-5 flex-1 rounded bg-[var(--color-muted)]">
                <div
                  className={`h-full rounded ${value >= 0 ? 'bg-gradient-to-r from-teal-700 to-teal-400' : 'bg-gradient-to-r from-rose-600 to-rose-400'}`}
                  style={{ width: `${(Math.abs(value) / maxVal) * 100}%` }}
                />
              </div>
              <span className="w-16 text-right text-xs font-bold tabular-nums">
                {mode === 'rs'
                  ? Math.round(value)
                  : mode === 'near52'
                    ? `${value.toFixed(1)}%`
                    : formatPct(value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
