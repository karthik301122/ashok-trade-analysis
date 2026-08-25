import { ChevronLeft } from 'lucide-react'
import type { CategorySummary, PatternCategoryId, PatternHit } from '../../lib/patterns'

type Props = {
  loading: boolean
  error: string | null
  categories: CategorySummary[]
  catalogTotal: number
  activeCategory: PatternCategoryId | null
  selectedPatternId: string | null
  onSelectCategory: (id: PatternCategoryId | null) => void
  onSelectPattern: (hit: PatternHit) => void
}

function biasClass(bias: string) {
  if (bias === 'bullish') return 'text-emerald-600'
  if (bias === 'bearish') return 'text-rose-600'
  return 'text-amber-600'
}

function formatDate(t: number) {
  return new Date(t * 1000).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  })
}

export function PatternPanel({
  loading,
  error,
  categories,
  catalogTotal,
  activeCategory,
  selectedPatternId,
  onSelectCategory,
  onSelectPattern,
}: Props) {
  const active = categories.find((c) => c.id === activeCategory) ?? null
  const totalHits = categories.reduce((a, c) => a + c.bullish + c.bearish + c.neutral, 0)

  return (
    <aside className="flex h-full w-full max-w-sm flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="border-b border-[var(--color-border)] px-3 py-2.5">
        <h3 className="text-sm font-bold">Pattern Analysis</h3>
        <p className="text-[10px] text-[var(--color-ink-soft)]">
          Catalog {catalogTotal} patterns · {totalHits} active hits. Bull/Bear/Neutral = detections.
          Click a category to see every scanned pattern (hit or no hit).
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {loading && (
          <p className="p-3 text-xs text-[var(--color-ink-soft)]">Scanning OHLC for patterns…</p>
        )}
        {error && <p className="p-3 text-xs text-rose-600">{error}</p>}

        {!loading && !error && !active && (
          <ul className="space-y-1.5">
            {categories.map((cat) => {
              const total = cat.bullish + cat.bearish + cat.neutral
              return (
                <li key={cat.id}>
                  <button
                    type="button"
                    onClick={() => onSelectCategory(cat.id)}
                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-left hover:border-sky-400"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold">{cat.label}</span>
                      <span className="text-[10px] text-[var(--color-ink-soft)]">
                        {total} hit{total === 1 ? '' : 's'} · {cat.analyzed} in catalog
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] font-semibold">
                      <span className="text-emerald-600">Bull {cat.bullish}</span>
                      <span className="text-rose-600">Bear {cat.bearish}</span>
                      <span className="text-amber-600">Neutral {cat.neutral}</span>
                    </div>
                    {cat.note && (
                      <p className="mt-1 text-[10px] text-[var(--color-ink-soft)]">{cat.note}</p>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {!loading && !error && active && (
          <div>
            <button
              type="button"
              onClick={() => onSelectCategory(null)}
              className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:underline dark:text-sky-300"
            >
              <ChevronLeft size={14} />
              All categories
            </button>
            <h4 className="mb-1 text-sm font-bold">{active.label}</h4>
            <p className="mb-2 text-[10px] text-[var(--color-ink-soft)]">
              {active.analyzed} patterns in catalog · Bull {active.bullish} · Bear {active.bearish} ·
              Neutral {active.neutral}
              {active.note ? ` · ${active.note}` : ''}
            </p>
            <ul className="space-y-1.5">
              {active.rows.map((row) => {
                const h = row.hit
                const selected = h != null && selectedPatternId === h.id
                if (!h) {
                  return (
                    <li
                      key={row.name}
                      className="rounded-lg border border-dashed border-[var(--color-border)] px-2.5 py-2 opacity-70"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium">{row.name}</span>
                        <span className="text-[10px] font-semibold uppercase text-[var(--color-ink-soft)]">
                          No hit
                        </span>
                      </div>
                      <div className="mt-0.5 text-[10px] text-[var(--color-ink-soft)]">
                        Scanned · family {row.familyBias}
                      </div>
                    </li>
                  )
                }
                return (
                  <li key={row.name}>
                    <button
                      type="button"
                      onClick={() => onSelectPattern(h)}
                      className={`w-full rounded-lg border px-2.5 py-2 text-left ${
                        selected
                          ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/40'
                          : 'border-[var(--color-border)] hover:border-sky-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold">{h.name}</span>
                        <span className={`text-[10px] font-bold uppercase ${biasClass(h.bias)}`}>
                          {h.bias}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[10px] text-[var(--color-ink-soft)]">
                        {formatDate(h.startT)}
                        {h.startT !== h.endT ? ` → ${formatDate(h.endT)}` : ''}
                        {' · '}
                        {Math.round(h.confidence * 100)}% conf
                        {h.note ? ` · ${h.note}` : ''}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </aside>
  )
}
