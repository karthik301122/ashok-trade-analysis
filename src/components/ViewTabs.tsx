import type { ReactNode } from 'react'
import { BarChart3, Clock3, LayoutList, RefreshCw, Table2 } from 'lucide-react'

export type ViewId =
  | 'sector-table'
  | 'money-rotation'
  | 'rotation-clock'
  | 'sector-analytics'
  | 'industry-analytics'

const VIEWS: { id: ViewId; label: string; icon: ReactNode }[] = [
  { id: 'sector-table', label: 'Sector Table', icon: <Table2 size={14} /> },
  { id: 'money-rotation', label: 'Money Rotation', icon: <RefreshCw size={14} /> },
  { id: 'rotation-clock', label: 'Rotation Clock', icon: <Clock3 size={14} /> },
  { id: 'sector-analytics', label: 'Sector Analytics', icon: <BarChart3 size={14} /> },
  { id: 'industry-analytics', label: 'Industry Analytics', icon: <LayoutList size={14} /> },
]

type Props = {
  active: ViewId
  onChange: (id: ViewId) => void
  mood: { bullish: number; neutral: number; bearish: number }
}

export function ViewTabs({ active, onChange, mood }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {VIEWS.map((v) => (
        <button
          key={v.id}
          type="button"
          onClick={() => onChange(v.id)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold uppercase tracking-wide transition ${
            active === v.id
              ? 'border-teal-600 bg-teal-50 text-teal-800 dark:border-teal-400 dark:bg-teal-950/50 dark:text-teal-200'
              : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink-soft)] hover:border-teal-400'
          }`}
        >
          {v.icon}
          {v.label}
        </button>
      ))}
      <div className="ml-auto">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
          <div className="flex min-w-[240px] items-center gap-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
              Market Mood
            </div>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--color-muted)]">
              <div className="flex h-full w-full">
                <div
                  className="bg-emerald-500"
                  style={{
                    width: `${(mood.bullish / (mood.bullish + mood.neutral + mood.bearish || 1)) * 100}%`,
                  }}
                />
                <div
                  className="bg-amber-400"
                  style={{
                    width: `${(mood.neutral / (mood.bullish + mood.neutral + mood.bearish || 1)) * 100}%`,
                  }}
                />
                <div
                  className="bg-rose-500"
                  style={{
                    width: `${(mood.bearish / (mood.bullish + mood.neutral + mood.bearish || 1)) * 100}%`,
                  }}
                />
              </div>
            </div>
            <div className="flex gap-2 text-xs font-semibold tabular-nums">
              <span className="text-emerald-600">↑ {mood.bullish}</span>
              <span className="text-amber-600">→ {mood.neutral}</span>
              <span className="text-rose-600">↓ {mood.bearish}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
