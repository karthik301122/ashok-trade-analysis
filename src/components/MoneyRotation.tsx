import { useMemo, useState } from 'react'
import { ArrowRight, Star } from 'lucide-react'
import type { MarketSnapshot } from '../data/types'
import { formatPct } from '../lib/format'

type Props = { snapshot: MarketSnapshot }
type Period = 'm3' | 'm1' | 'w1'

export function MoneyRotation({ snapshot }: Props) {
  const [period, setPeriod] = useState<Period>('m3')
  const periodLabel = period === 'm3' ? '3 months' : period === 'm1' ? '1 month' : '1 week'
  const bench =
    period === 'm3'
      ? snapshot.benchmarkPerf.m3
      : period === 'm1'
        ? snapshot.benchmarkPerf.m1
        : snapshot.benchmarkPerf.w1

  const ranked = useMemo(() => {
    return snapshot.industries
      .map((ind) => {
        const ret = period === 'm3' ? ind.perf.m3 : period === 'm1' ? ind.perf.m1 : ind.perf.w1
        return { ...ind, ret, vs: Math.round((ret - bench) * 10) / 10 }
      })
      .sort((a, b) => b.vs - a.vs)
  }, [snapshot.industries, period, bench])

  const flowingIn = ranked.filter((r) => r.vs > 0).slice(0, 12)
  const flowingOut = [...ranked].filter((r) => r.vs <= 0).sort((a, b) => a.vs - b.vs).slice(0, 12)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-[var(--color-ink-soft)]">Show money flow for the last:</span>
        {(
          [
            ['m3', '3 Months'],
            ['m1', '1 Month'],
            ['w1', '1 Week'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setPeriod(id)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase ${
              period === id
                ? 'border-teal-600 bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-200'
                : 'border-[var(--color-border)] bg-[var(--color-surface)]'
            }`}
          >
            {label}
          </button>
        ))}
        <span className="text-sm italic text-[var(--color-ink-soft)]">
          Where did big investors move money over the last {periodLabel}?
        </span>
      </div>

      <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-100">
        <strong>How this estimate works:</strong> we do <em>not</em> have direct super-fund / FII order-flow
        data. Money Rotation ranks industries by <strong>price return vs {snapshot.benchmark}</strong> over the
        selected window (3M / 1M / 1W). Outperforming the index = treated as capital flowing IN; lagging = OUT.
        It is a relative-strength proxy, not broker-reported flows.
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
          <div className="text-3xl font-bold text-emerald-700 dark:text-emerald-300">
            {flowingIn.length}
          </div>
          <div className="mt-1 text-sm font-medium text-emerald-800 dark:text-emerald-200">
            Industries gaining. Beating {snapshot.benchmark} — money flowing IN.
          </div>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950/30">
          <div className="text-3xl font-bold text-rose-700 dark:text-rose-300">{flowingOut.length}</div>
          <div className="mt-1 text-sm font-medium text-rose-800 dark:text-rose-200">
            Industries losing. Lagging {snapshot.benchmark} — money flowing OUT.
          </div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
          <div className="text-3xl font-bold text-amber-700 dark:text-amber-300">
            {formatPct(bench)}
          </div>
          <div className="mt-1 text-sm font-medium text-amber-900 dark:text-amber-200">
            {snapshot.benchmark} ({periodLabel}). The benchmark. Beat this = outperforming.
          </div>
        </div>
      </div>

      <div>
        <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Capital Flow Map — {periodLabel}
        </h3>
        <p className="text-sm text-[var(--color-ink-soft)]">
          Money moved OUT of red industries (left) → and INTO green industries (right)
        </p>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_auto_1fr]">
        <div className="rounded-xl border border-rose-200 bg-rose-50/50 dark:border-rose-900 dark:bg-rose-950/20">
          <div className="border-b border-rose-200 px-4 py-3 text-sm font-bold uppercase tracking-wide text-rose-700 dark:border-rose-900 dark:text-rose-300">
            Money flowing out — Investors selling
          </div>
          <ul className="space-y-2 p-3">
            {flowingOut.map((item, idx) => (
              <li
                key={item.name}
                className="flex items-center gap-3 rounded-lg border border-rose-100 bg-[var(--color-surface)] px-3 py-2.5 dark:border-rose-900/50"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-500 text-xs font-bold text-white">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{item.name}</div>
                  <div className="text-xs text-rose-600">
                    ▼ UNDER {snapshot.benchmark} by {formatPct(item.vs)}
                  </div>
                </div>
                <div className="text-right text-base font-bold text-rose-600">{formatPct(item.ret)}</div>
                <ArrowRight size={14} className="text-sky-500" />
              </li>
            ))}
          </ul>
        </div>

        <div className="hidden flex-col items-center justify-center gap-2 py-10 lg:flex">
          <div className="flex flex-col gap-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-1">
                <div className="h-2 w-6 rounded-sm bg-rose-400" />
                <div className="h-2 w-6 rounded-sm bg-emerald-400" />
              </div>
            ))}
          </div>
          <div className="writing-vertical text-xs font-bold uppercase tracking-[0.2em] text-amber-600">
            Capital
            <br />
            Rotates
          </div>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20">
          <div className="border-b border-emerald-200 px-4 py-3 text-sm font-bold uppercase tracking-wide text-emerald-700 dark:border-emerald-900 dark:text-emerald-300">
            Money flowing in — Investors buying
          </div>
          <ul className="space-y-2 p-3">
            {flowingIn.map((item, idx) => (
              <li
                key={item.name}
                className="flex items-center gap-3 rounded-lg border border-emerald-100 bg-[var(--color-surface)] px-3 py-2.5 dark:border-emerald-900/50"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{item.name}</div>
                  {item.starCount > 0 && (
                    <div className="flex items-center gap-1 text-[11px] font-semibold text-amber-600">
                      <Star size={11} className="fill-amber-400 text-amber-400" />
                      {item.starCount} star stocks
                    </div>
                  )}
                  <div className="text-xs text-emerald-600">
                    ▲ OUT {snapshot.benchmark} by {formatPct(item.vs)}
                  </div>
                </div>
                <div className="text-right text-base font-bold text-emerald-600">{formatPct(item.ret)}</div>
                <ArrowRight size={14} className="text-sky-500" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
