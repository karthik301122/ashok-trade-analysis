import { useMemo } from 'react'
import type { MarketSnapshot } from '../data/types'

type Props = { snapshot: MarketSnapshot }

export function BreadthAnalysis({ snapshot }: Props) {
  const advancing = snapshot.stocks.filter((s) => s.m1 > 0).length
  const declining = snapshot.stocks.filter((s) => s.m1 < 0).length
  const unchanged = snapshot.stocks.length - advancing - declining
  const above200 = snapshot.stocks.filter((s) => s.above200ma).length
  const above50 = snapshot.stocks.filter((s) => s.above50ma).length
  const pct = (n: number) => ((n / snapshot.stocks.length) * 100).toFixed(1)

  const bySector = useMemo(() => {
    return snapshot.sectors.map((s) => ({
      name: s.name,
      pctAbove200: s.pctAbove200ma,
      bullishStocks: s.stocks.filter((x) => x.mood === 'bullish').length,
      total: s.stocks.length,
    }))
  }, [snapshot.sectors])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">
          Market Breadth Analysis
        </h1>
        <p className="text-sm text-[var(--color-ink-soft)]">
          {snapshot.stocks.length} ASX stocks · Benchmark {snapshot.benchmark} · {snapshot.asOf}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Advancing (1M)', advancing, 'text-emerald-600'],
          ['Declining (1M)', declining, 'text-rose-600'],
          ['Unchanged', unchanged, 'text-amber-600'],
          ['Above 200 MA', `${pct(above200)}%`, 'text-teal-700'],
        ].map(([label, value, cls]) => (
          <div
            key={label as string}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
          >
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
              {label}
            </div>
            <div className={`mt-1 text-3xl font-bold tabular-nums ${cls}`}>{value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h3 className="mb-3 text-sm font-semibold">Breadth by sector — % stocks above 200 MA</h3>
        <div className="space-y-2">
          {bySector.map((s) => (
            <div key={s.name} className="flex items-center gap-3 text-xs">
              <span className="w-44 truncate font-medium">{s.name}</span>
              <div className="h-4 flex-1 rounded bg-[var(--color-muted)]">
                <div
                  className="h-full rounded bg-teal-500"
                  style={{ width: `${s.pctAbove200}%` }}
                />
              </div>
              <span className="w-12 text-right font-bold">{s.pctAbove200.toFixed(0)}%</span>
              <span className="w-20 text-right text-[var(--color-ink-soft)]">
                {s.bullishStocks}/{s.total} bull
              </span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-[var(--color-ink-soft)]">
          Above 50 MA: {pct(above50)}% of universe · Industry mood mix drives the Market Mood bar on
          Sector Intelligence.
        </p>
      </div>
    </div>
  )
}
