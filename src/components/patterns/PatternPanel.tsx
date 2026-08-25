import { useMemo, useState, type FormEvent } from 'react'
import { ChevronLeft, Plus, Star, Trash2 } from 'lucide-react'
import type {
  CategorySummary,
  PatternBias,
  PatternCategoryId,
  PatternHit,
} from '../../lib/patterns'
import { PATTERN_CATALOG } from '../../lib/patterns'
import { usePatternPrefs } from './PatternPrefsContext'

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
  const { isStarred, toggleStar, createCustom, deleteCustom, customPatterns } = usePatternPrefs()
  const [showCreate, setShowCreate] = useState(false)
  const [cName, setCName] = useState('')
  const [cBias, setCBias] = useState<PatternBias>('bullish')
  const [cDesc, setCDesc] = useState('')
  const [cBasedOn, setCBasedOn] = useState('')

  const active = categories.find((c) => c.id === activeCategory) ?? null
  const totalHits = categories
    .filter((c) => c.id !== 'starred' && c.id !== 'custom')
    .reduce((a, c) => a + c.bullish + c.bearish + c.neutral, 0)

  const catalogNames = useMemo(
    () => [...new Set(PATTERN_CATALOG.map((p) => p.name))].sort((a, b) => a.localeCompare(b)),
    [],
  )

  const submitCustom = (e: FormEvent) => {
    e.preventDefault()
    if (!cName.trim()) return
    createCustom({
      name: cName.trim(),
      bias: cBias,
      description: cDesc,
      basedOn: cBasedOn || null,
    })
    setCName('')
    setCDesc('')
    setCBasedOn('')
    setCBias('bullish')
    setShowCreate(false)
    onSelectCategory('custom')
  }

  return (
    <aside className="flex h-full w-full max-w-sm flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="border-b border-[var(--color-border)] px-3 py-2.5">
        <h3 className="text-sm font-bold">Pattern Analysis</h3>
        <p className="text-[10px] text-[var(--color-ink-soft)]">
          Catalog {catalogTotal} · {totalHits} hits · star favorites for Sector Table · My Patterns
          are private to you
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {loading && (
          <p className="p-3 text-xs text-[var(--color-ink-soft)]">Scanning OHLC for patterns…</p>
        )}
        {error && <p className="p-3 text-xs text-rose-600">{error}</p>}

        {!loading && !error && !active && (
          <div className="space-y-3">
            <ul className="space-y-1.5">
              {categories.map((cat) => {
                const total = cat.bullish + cat.bearish + cat.neutral
                const isStarCat = cat.id === 'starred'
                const isCustom = cat.id === 'custom'
                return (
                  <li key={cat.id}>
                    <button
                      type="button"
                      onClick={() => onSelectCategory(cat.id)}
                      className={`w-full rounded-lg border px-3 py-2.5 text-left hover:border-sky-400 ${
                        isStarCat
                          ? 'border-amber-400/70 bg-amber-50/80 dark:bg-amber-950/30'
                          : isCustom
                            ? 'border-teal-400/70 bg-teal-50/80 dark:bg-teal-950/30'
                            : 'border-[var(--color-border)] bg-[var(--color-bg)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold">{cat.label}</span>
                        <span className="text-[10px] text-[var(--color-ink-soft)]">
                          {total} hit{total === 1 ? '' : 's'} · {cat.analyzed} listed
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

            <div className="rounded-lg border border-dashed border-teal-400/60 bg-[var(--color-bg)] p-2.5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold text-teal-800 dark:text-teal-200">
                  Create my pattern
                </p>
                <button
                  type="button"
                  onClick={() => setShowCreate((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-md border border-teal-600 bg-teal-50 px-2 py-1 text-[10px] font-bold text-teal-900 dark:bg-teal-950/50 dark:text-teal-100"
                >
                  <Plus size={12} />
                  {showCreate ? 'Close' : 'New'}
                </button>
              </div>
              {showCreate && (
                <form onSubmit={submitCustom} className="space-y-2">
                  <input
                    value={cName}
                    onChange={(e) => setCName(e.target.value)}
                    placeholder="Pattern name"
                    className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs"
                    required
                  />
                  <select
                    value={cBias}
                    onChange={(e) => setCBias(e.target.value as PatternBias)}
                    className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs"
                  >
                    <option value="bullish">Bullish</option>
                    <option value="bearish">Bearish</option>
                    <option value="neutral">Neutral</option>
                  </select>
                  <textarea
                    value={cDesc}
                    onChange={(e) => setCDesc(e.target.value)}
                    placeholder="Notes (optional)"
                    rows={2}
                    className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs"
                  />
                  <label className="block text-[10px] text-[var(--color-ink-soft)]">
                    Detect using catalog rule (optional)
                    <select
                      value={cBasedOn}
                      onChange={(e) => setCBasedOn(e.target.value)}
                      className="mt-0.5 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs"
                    >
                      <option value="">Manual name only (no auto-detect)</option>
                      {catalogNames.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="submit"
                    className="w-full rounded-md bg-teal-700 px-2 py-1.5 text-xs font-bold text-white hover:bg-teal-800"
                  >
                    Save private pattern
                  </button>
                </form>
              )}
              {!showCreate && customPatterns.length > 0 && (
                <ul className="mt-1 space-y-1">
                  {customPatterns.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-2 text-[10px] text-[var(--color-ink-soft)]"
                    >
                      <span>
                        {c.name}
                        {c.basedOn ? ` ← ${c.basedOn}` : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteCustom(c.id)}
                        className="rounded p-0.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
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
              {active.analyzed} patterns · Bull {active.bullish} · Bear {active.bearish} · Neutral{' '}
              {active.neutral}
              {active.note ? ` · ${active.note}` : ''}
            </p>
            <ul className="space-y-1.5">
              {active.rows.map((row) => {
                const h = row.hit
                const selected = h != null && selectedPatternId === h.id
                const starred = isStarred(row.name)
                const customDef = customPatterns.find((c) => c.name === row.name)

                return (
                  <li key={row.name} className="relative">
                    <div
                      className={`rounded-lg border px-2.5 py-2 ${
                        !h
                          ? 'border-dashed border-[var(--color-border)] opacity-80'
                          : selected
                            ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/40'
                            : 'border-[var(--color-border)]'
                      }`}
                    >
                      <div className="flex items-start gap-1.5">
                        <button
                          type="button"
                          onClick={() => toggleStar(row.name)}
                          className="mt-0.5 shrink-0 rounded p-0.5 hover:bg-amber-100 dark:hover:bg-amber-950/50"
                          title={starred ? 'Unstar pattern' : 'Star pattern'}
                          aria-label={starred ? 'Unstar' : 'Star'}
                        >
                          <Star
                            size={14}
                            className={
                              starred
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-[var(--color-ink-soft)]'
                            }
                          />
                        </button>
                        {h ? (
                          <button
                            type="button"
                            onClick={() => onSelectPattern(h)}
                            className="min-w-0 flex-1 text-left hover:opacity-90"
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
                        ) : (
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-medium">{row.name}</span>
                              <span className="text-[10px] font-semibold uppercase text-[var(--color-ink-soft)]">
                                No hit
                              </span>
                            </div>
                            <div className="mt-0.5 text-[10px] text-[var(--color-ink-soft)]">
                              Scanned · family {row.familyBias}
                            </div>
                          </div>
                        )}
                        {customDef && active.id === 'custom' && (
                          <button
                            type="button"
                            onClick={() => deleteCustom(customDef.id)}
                            className="shrink-0 rounded p-0.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                            title="Delete custom pattern"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>
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
