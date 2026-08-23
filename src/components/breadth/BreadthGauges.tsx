import type { GaugeMetric } from './breadthMath'
import { sentimentClass, sentimentLabel } from './breadthMath'

function Gauge({ pct }: { pct: number }) {
  const angle = -90 + (Math.max(0, Math.min(100, pct)) / 100) * 180
  return (
    <svg viewBox="0 0 80 48" className="h-12 w-20">
      <path
        d="M 8 40 A 32 32 0 0 1 72 40"
        fill="none"
        stroke="#fecaca"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M 8 40 A 32 32 0 0 1 28 12"
        fill="none"
        stroke="#f87171"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M 28 12 A 32 32 0 0 1 52 12"
        fill="none"
        stroke="#fbbf24"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M 52 12 A 32 32 0 0 1 72 40"
        fill="none"
        stroke="#34d399"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <g transform={`rotate(${angle} 40 40)`}>
        <line x1="40" y1="40" x2="40" y2="16" stroke="#334155" strokeWidth="2.5" strokeLinecap="round" />
      </g>
      <circle cx="40" cy="40" r="3.5" fill="#334155" />
    </svg>
  )
}

export function BreadthGauges({ gauges }: { gauges: GaugeMetric[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {gauges.map((g) => (
        <div
          key={g.id}
          className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                {g.label}
              </div>
              <div className={`mt-1 text-3xl font-bold tabular-nums ${sentimentClass(g.sentiment)}`}>
                {g.pct}%
              </div>
              <div className={`text-sm font-semibold ${sentimentClass(g.sentiment)}`}>
                {sentimentLabel(g.sentiment)}
              </div>
            </div>
            <Gauge pct={g.pct} />
          </div>
        </div>
      ))}
    </div>
  )
}
