import { Sparkline } from '../Sparkline'
import type { BreadthRow } from './breadthMath'
import { badgeClass, barClass, sentimentLabel } from './breadthMath'

export function MetricRows({
  title,
  blurb,
  rows,
}: {
  title: string
  blurb?: string
  rows: BreadthRow[]
}) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">{title}</h3>
        {blurb && <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{blurb}</p>}
      </div>
      {rows.map((r) => (
        <div
          key={r.id}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-sm md:p-4"
        >
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-[180px] flex-1">
              <div className="text-sm font-semibold">{r.label}</div>
              <div className="text-[11px] text-[var(--color-ink-soft)]">{r.subtitle}</div>
              <div className="mt-2 h-2.5 max-w-md overflow-hidden rounded-full bg-[var(--color-muted)]">
                <div
                  className={`h-full rounded-full ${barClass(r.sentiment)}`}
                  style={{ width: `${Math.min(100, r.pct)}%` }}
                />
              </div>
              <div className="mt-1 text-xs font-bold tabular-nums">{r.pct}%</div>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <span
                className={`text-xs font-semibold tabular-nums ${r.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}
              >
                {r.delta > 0 ? '+' : ''}
                {r.delta}%
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${badgeClass(r.sentiment)}`}>
                {sentimentLabel(r.sentiment)}
              </span>
              <Sparkline values={r.spark} width={80} height={28} positive={r.pct >= 50} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
