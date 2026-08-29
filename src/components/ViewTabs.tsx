import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BarChart3, Bitcoin, ChevronDown, Clock3, Coins, LayoutList, MoreHorizontal, RefreshCw, Table2, Volume2 } from 'lucide-react'

export type ViewId =
  | 'sector-table'
  | 'money-rotation'
  | 'rotation-clock'
  | 'sector-analytics'
  | 'industry-analytics'
  | 'volume-scan'
  | 'commodities'
  | 'crypto'

type ViewDef = { id: ViewId; label: string; icon: ReactNode; group?: 'more' }

const VIEWS: ViewDef[] = [
  { id: 'sector-table', label: 'Sector table', icon: <Table2 size={14} /> },
  { id: 'volume-scan', label: 'Volume scan', icon: <Volume2 size={14} /> },
  { id: 'sector-analytics', label: 'Sector analytics', icon: <BarChart3 size={14} /> },
  { id: 'money-rotation', label: 'Money rotation', icon: <RefreshCw size={14} />, group: 'more' },
  { id: 'rotation-clock', label: 'Rotation clock', icon: <Clock3 size={14} />, group: 'more' },
  { id: 'industry-analytics', label: 'Industry analytics', icon: <LayoutList size={14} />, group: 'more' },
  { id: 'commodities', label: 'Commodities', icon: <Coins size={14} />, group: 'more' },
  { id: 'crypto', label: 'Crypto', icon: <Bitcoin size={14} />, group: 'more' },
]

const PRIMARY = VIEWS.filter((v) => !v.group)
const MORE = VIEWS.filter((v) => v.group === 'more')

type Props = {
  active: ViewId
  onChange: (id: ViewId) => void
  mood: { bullish: number; neutral: number; bearish: number }
}

export function ViewTabs({ active, onChange, mood }: Props) {
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)
  const moreActive = MORE.some((v) => v.id === active)
  const moodTotal = mood.bullish + mood.neutral + mood.bearish || 1

  useEffect(() => {
    if (!moreOpen) return
    const close = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [moreOpen])

  const tabClass = (on: boolean) =>
    `inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
      on
        ? 'bg-teal-700 text-white shadow-sm dark:bg-teal-600'
        : 'text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)] hover:text-[var(--color-ink)]'
    }`

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/50 p-1">
        {PRIMARY.map((v) => (
          <button key={v.id} type="button" onClick={() => onChange(v.id)} className={tabClass(active === v.id)}>
            {v.icon}
            {v.label}
          </button>
        ))}
        <div ref={moreRef} className="relative">
          <button
            type="button"
            onClick={() => setMoreOpen((o) => !o)}
            className={tabClass(moreActive)}
          >
            <MoreHorizontal size={14} />
            More
            <ChevronDown size={12} className={moreOpen ? 'rotate-180' : ''} />
          </button>
          {moreOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 min-w-[180px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg">
              {MORE.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    onChange(v.id)
                    setMoreOpen(false)
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium ${
                    active === v.id
                      ? 'bg-teal-50 text-teal-900 dark:bg-teal-950/50 dark:text-teal-100'
                      : 'hover:bg-[var(--color-muted)]'
                  }`}
                >
                  {v.icon}
                  {v.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex min-w-[200px] flex-1 items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 sm:min-w-[260px]">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
          Mood
        </span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-muted)]">
          <div className="flex h-full w-full">
            <div className="bg-emerald-500" style={{ width: `${(mood.bullish / moodTotal) * 100}%` }} />
            <div className="bg-amber-400" style={{ width: `${(mood.neutral / moodTotal) * 100}%` }} />
            <div className="bg-rose-500" style={{ width: `${(mood.bearish / moodTotal) * 100}%` }} />
          </div>
        </div>
        <div className="flex gap-2 text-[11px] font-semibold tabular-nums">
          <span className="text-emerald-600">{mood.bullish}</span>
          <span className="text-amber-600">{mood.neutral}</span>
          <span className="text-rose-600">{mood.bearish}</span>
        </div>
      </div>
    </div>
  )
}
