import { useMemo, useState } from 'react'
import type { MarketSnapshot } from '../../data/types'
import type { BreadthBundle, UniverseId } from './breadthMath'
import { UNIVERSES } from './breadthMath'

type Props = {
  snapshot: MarketSnapshot
  bundle: BreadthBundle
  universeId: UniverseId
}

type Seg = 'index' | 'sectors' | 'stocks'

export function SeasonalityTab({ snapshot, bundle, universeId }: Props) {
  const [seg, setSeg] = useState<Seg>('index')
  const month = new Date().toLocaleString('en-AU', { month: 'short' })
  const universeLabel = UNIVERSES.find((u) => u.id === universeId)?.label ?? universeId

  const sectorPulse = useMemo(() => {
    const bench = snapshot.benchmarkPerf.m1
    const ranked = [...snapshot.industries]
      .map((ind) => ({
        name: ind.name,
        m1: ind.perf.m1,
        vs: Math.round((ind.perf.m1 - bench) * 10) / 10,
      }))
      .sort((a, b) => b.vs - a.vs)
    return {
      tail: ranked.filter((r) => r.vs > 0).slice(0, 5),
      head: ranked.filter((r) => r.vs <= 0).sort((a, b) => a.vs - b.vs).slice(0, 5),
    }
  }, [snapshot.industries, snapshot.benchmarkPerf.m1])

  const exampleStock = useMemo(() => {
    const list = bundle.stocks
    if (!list.length) return null
    return [...list].sort((a, b) => a.m1 - b.m1)[0]
  }, [bundle.stocks])

  const indexM1 = snapshot.benchmarkPerf.m1
  const indexTone =
    indexM1 > 2 ? 'Strong' : indexM1 > 0 ? 'Mild' : indexM1 > -2 ? 'Soft' : 'Weak'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-semibold">
            This month pulse
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-800 dark:bg-sky-950/50 dark:text-sky-200">
              Live returns
            </span>
          </h3>
          <p className="text-sm text-[var(--color-ink-soft)]">
            What {month} looks like right now from live ASX returns — not a multi-year seasonal
            database or win-rate calendar.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-[var(--color-border)] p-1">
          {(
            [
              ['index', 'Index'],
              ['sectors', 'Sectors'],
              ['stocks', 'Stocks'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSeg(id)}
              className={`rounded-md px-3 py-1.5 text-xs font-bold uppercase ${
                seg === id
                  ? 'bg-teal-700 text-white'
                  : 'text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-sm text-amber-800 dark:text-amber-200">
        What {month} means right now — {universeLabel} · Industries ·{' '}
        {exampleStock ? `${exampleStock.name} (${exampleStock.ticker})` : '—'}
      </p>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase text-[var(--color-ink-soft)]">
            {snapshot.benchmark}
          </div>
          <div
            className={`mt-1 text-3xl font-bold tabular-nums ${indexM1 >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}
          >
            {indexM1 > 0 ? '+' : ''}
            {indexM1.toFixed(1)}%
          </div>
          <span
            className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${
              indexM1 >= 0
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                : 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200'
            }`}
          >
            {indexTone}
          </span>
          <p className="mt-3 text-sm text-[var(--color-ink-soft)]">
            Live 1-month return for {snapshot.benchmark}. Current-month backdrop for {universeLabel}{' '}
            — not a 6-year win-rate.
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase text-[var(--color-ink-soft)]">
            Sector pulse — {month.toUpperCase()}
          </div>
          <div className="mt-3 space-y-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                Tailwind industries
              </div>
              <ul className="mt-1 space-y-1">
                {sectorPulse.tail.map((r) => (
                  <li key={r.name} className="flex justify-between gap-2 text-sm">
                    <span className="truncate">{r.name}</span>
                    <span className="shrink-0 font-semibold text-emerald-600">
                      +{r.vs.toFixed(1)}% vs idx
                    </span>
                  </li>
                ))}
                {!sectorPulse.tail.length && (
                  <li className="text-xs text-[var(--color-ink-soft)]">None beating the index</li>
                )}
              </ul>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-rose-700">
                Headwind industries
              </div>
              <ul className="mt-1 space-y-1">
                {sectorPulse.head.map((r) => (
                  <li key={r.name} className="flex justify-between gap-2 text-sm">
                    <span className="truncate">{r.name}</span>
                    <span className="shrink-0 font-semibold text-rose-600">{r.vs.toFixed(1)}% vs idx</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase text-[var(--color-ink-soft)]">
            Example stock (weakest 1M in universe)
          </div>
          {exampleStock ? (
            <>
              <div className="mt-1 text-lg font-bold">
                {exampleStock.name}{' '}
                <span className="text-sm font-medium text-[var(--color-ink-soft)]">
                  {exampleStock.ticker}
                </span>
              </div>
              <div
                className={`mt-1 text-3xl font-bold tabular-nums ${exampleStock.m1 >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}
              >
                {exampleStock.m1 > 0 ? '+' : ''}
                {exampleStock.m1.toFixed(1)}%
              </div>
              <span className="mt-2 inline-block rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
                Soft
              </span>
              <p className="mt-3 text-sm text-[var(--color-ink-soft)]">
                Live 1M return inside {universeLabel}. A stress name to watch — not a multi-year
                seasonal rule.
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-[var(--color-ink-soft)]">No stocks in universe yet.</p>
          )}
        </div>
      </div>

      {seg === 'sectors' && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-3 text-sm">
          Industry pulse for {month}. Prefer tailwind industries when overall breadth is improving;
          fade headwinds until A-D turns up.
        </div>
      )}
      {seg === 'stocks' && exampleStock && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-3 text-sm">
          Focus stock: {exampleStock.ticker} — RSI {(exampleStock.rsi ?? 50).toFixed(0)},{' '}
          {exampleStock.above50ma ? 'above' : 'below'} 50 SMA.
        </div>
      )}
    </div>
  )
}
