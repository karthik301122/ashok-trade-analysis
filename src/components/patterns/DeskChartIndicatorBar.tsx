import { Activity } from 'lucide-react'
import {
  allDeskIndicatorSet,
  DESK_INDICATORS,
  defaultDeskIndicatorSet,
  type DeskIndicatorId,
} from '../../lib/chartIndicators'

type Props = {
  active: Set<DeskIndicatorId>
  onToggle: (id: DeskIndicatorId) => void
  onAllOn: () => void
  onAllOff: () => void
}

export function DeskChartIndicatorBar({ active, onToggle, onAllOn, onAllOff }: Props) {
  const allCount = DESK_INDICATORS.length
  const onCount = active.size

  return (
    <div
      className="absolute right-2 top-2 z-20 flex max-h-[min(70vh,420px)] w-[min(100%,300px)] flex-col rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-md"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-2 py-1.5">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
          <Activity className="h-3.5 w-3.5" />
          Indicators ({onCount}/{allCount})
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onAllOn}
            className="rounded px-1.5 py-0.5 text-[9px] font-bold text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/40"
          >
            All on
          </button>
          <button
            type="button"
            onClick={onAllOff}
            className="rounded px-1.5 py-0.5 text-[9px] font-bold text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)]"
          >
            Clear
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 overflow-y-auto p-2">
        {DESK_INDICATORS.map((ind) => {
          const on = active.has(ind.id)
          return (
            <button
              key={ind.id}
              type="button"
              title={ind.label}
              onClick={() => onToggle(ind.id)}
              className={`rounded-md px-2 py-1 text-[10px] font-bold transition-colors ${
                on
                  ? 'text-white shadow-sm'
                  : 'border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)]'
              }`}
              style={on ? { backgroundColor: ind.color } : undefined}
            >
              {ind.label}
            </button>
          )
        })}
      </div>
      <p className="border-t border-[var(--color-border)] px-2 py-1.5 text-[9px] leading-snug text-[var(--color-ink-soft)]">
        Computed locally from EODHD OHLC — no extra API calls. Turn on only what you need;
        many panes shrink the price chart.
      </p>
    </div>
  )
}

export { defaultDeskIndicatorSet, allDeskIndicatorSet }
