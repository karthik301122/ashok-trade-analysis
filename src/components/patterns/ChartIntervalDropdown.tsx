import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  CHART_INTERVAL_SECTIONS,
  chartIntervalButtonLabel,
  type ChartIntervalPref,
} from '../../lib/chartInterval'

type Props = {
  value: ChartIntervalPref
  onChange: (interval: ChartIntervalPref) => void
  /** Desk API interval when different from picker (e.g. EODHD 5m vs 30m). */
  effectiveBarInterval?: string
}

export function ChartIntervalDropdown({ value, onChange, effectiveBarInterval }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const buttonLabel =
    effectiveBarInterval && effectiveBarInterval !== '1d' && value !== 'auto' && value !== '1d'
      ? chartIntervalButtonLabel(
          effectiveBarInterval === '60m' ? '1h' : (effectiveBarInterval as ChartIntervalPref),
        )
      : chartIntervalButtonLabel(value)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-[10px] font-bold text-[var(--color-ink)] hover:border-sky-400"
        title="Chart bar interval (pattern scans stay on daily)"
      >
        {buttonLabel}
        <ChevronDown size={12} className={open ? 'rotate-180' : ''} />
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-30 mt-1 min-w-[168px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg"
        >
          {CHART_INTERVAL_SECTIONS.map((section) => (
            <div key={section.label}>
              <div className="px-3 py-1 text-[9px] font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
                {section.label}
              </div>
              {section.items.map((item) => {
                const active = value === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onChange(item.id)
                      setOpen(false)
                    }}
                    className={`flex w-full px-3 py-1.5 text-left text-[11px] font-medium ${
                      active
                        ? 'bg-sky-700 text-white'
                        : 'text-[var(--color-ink)] hover:bg-[var(--color-muted)]'
                    }`}
                  >
                    {item.label}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
