import { useMemo, useState } from 'react'
import type { MarketSnapshot, SectorMetrics } from '../data/types'
import { formatPct } from '../lib/format'

type Props = { snapshot: MarketSnapshot }
type Mode = 'ma' | 'rs' | 'near52'
type MaType = '200' | '50' | '21' | '20'

export function SectorAnalytics({ snapshot }: Props) {
  const [mode, setMode] = useState<Mode>('ma')
  const [maType, setMaType] = useState<MaType>('200')
  const [selected, setSelected] = useState<string>(snapshot.sectors[0]?.name ?? '')

  const rows = useMemo(() => {
    return [...snapshot.sectors]
      .map((s) => {
        let value = 0
        if (mode === 'rs') value = s.avgRs
        else if (mode === 'near52') value = s.pctNear52w
        else if (maType === '200') value = s.pctAbove200ma
        else if (maType === '50') value = s.pctAbove50ma
        else if (maType === '21') value = s.pctAbove21ema
        else value = s.pctAbove20ma
        return { sector: s, value }
      })
      .sort((a, b) => b.value - a.value)
  }, [snapshot.sectors, mode, maType])

  const active: SectorMetrics | undefined =
    snapshot.sectors.find((s) => s.name === selected) ?? snapshot.sectors[0]

  const strongIndustries = useMemo(() => {
    if (!active) return []
    const sectorW = active.weight || 1
    return [...active.industries]
      .map((ind) => {
        const weightShare = ind.weight / sectorW
        // How many percentage points this industry adds to the sector’s 3M return
        const contribPp = Math.round(weightShare * ind.perf.m3 * 10) / 10
        return { ...ind, weightShare: Math.round(weightShare * 1000) / 10, contribPp }
      })
      .sort((a, b) => b.contribPp - a.contribPp)
      .slice(0, 8)
  }, [active])

  const strongStocks = useMemo(() => {
    if (!active) return []
    return [...active.stocks].sort((a, b) => b.rs - a.rs).slice(0, 12)
  }, [active])

  const maxVal = Math.max(...rows.map((r) => r.value), 1)
  const title =
    mode === 'rs'
      ? 'Relative Strength'
      : mode === 'near52'
        ? 'Near 52W High'
        : `% of stocks trading above ${maType === '21' ? '21 EMA' : `${maType} MA`}`

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['ma', 'Moving Average'],
            ['rs', 'Relative Strength'],
            ['near52', 'Near 52W High'],
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

      {mode === 'ma' && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-[var(--color-ink-soft)]">MA Type:</span>
          {(
            [
              ['200', '200 MA'],
              ['50', '50 MA'],
              ['21', '21 EMA'],
              ['20', '20 MA'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMaType(id)}
              className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${
                maType === id
                  ? 'border-teal-600 bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-200'
                  : 'border-[var(--color-border)]'
              }`}
            >
              {label}
            </button>
          ))}
          <span className="text-xs text-[var(--color-ink-soft)]">— % of stocks trading above MA</span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h3 className="mb-3 text-sm font-semibold">{title}</h3>
          <div className="space-y-1.5">
            {rows.map(({ sector, value }) => (
              <button
                key={sector.name}
                type="button"
                onClick={() => setSelected(sector.name)}
                className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition ${
                  selected === sector.name ? 'bg-sky-50 dark:bg-sky-950/40' : 'hover:bg-[var(--color-muted)]'
                }`}
              >
                <span className="w-40 shrink-0 truncate text-xs font-medium">{sector.name}</span>
                <div className="h-5 flex-1 rounded bg-[var(--color-muted)]">
                  <div
                    className="h-full rounded bg-gradient-to-r from-teal-600 to-teal-400"
                    style={{ width: `${(value / maxVal) * 100}%` }}
                  />
                </div>
                <span className="w-12 text-right text-xs font-bold tabular-nums">
                  {mode === 'rs' ? Math.round(value) : `${value.toFixed(1)}%`}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] p-3">
            <h4 className="text-sm font-bold">Strong Industries</h4>
            <p className="mb-2 text-[11px] text-[var(--color-ink-soft)]">
              Ranked by contribution to sector 3M (weight × industry 3M). Number = industry 3M return.
            </p>
            <ul className="space-y-2">
              {strongIndustries.map((ind) => (
                <li key={ind.name} className="flex items-center gap-2 text-xs">
                  <span className="flex-1 font-medium">{ind.name}</span>
                  <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-200">
                    {ind.weightShare.toFixed(0)}% wt
                  </span>
                  <span
                    className={`w-14 text-right font-bold tabular-nums ${
                      ind.perf.m3 >= 0 ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                    title={`Adds ${ind.contribPp >= 0 ? '+' : ''}${ind.contribPp} pp to sector 3M`}
                  >
                    {formatPct(ind.perf.m3)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] p-3">
            <h4 className="text-sm font-bold">Strong Stocks</h4>
            <p className="mb-2 text-[11px] text-[var(--color-ink-soft)]">
              Number after stock name indicates RS strength
            </p>
            <ul className="max-h-64 space-y-1.5 overflow-auto">
              {strongStocks.map((s) => (
                <li key={s.ticker} className="flex justify-between text-xs font-semibold">
                  <span>
                    {s.ticker} <span className="font-normal text-[var(--color-ink-soft)]">{s.name}</span>
                  </span>
                  <span>{s.rs}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
