import { useMemo, useState, type FormEvent } from 'react'
import { ChevronLeft, Plus, Star, Trash2 } from 'lucide-react'
import type {
  CategorySummary,
  PatternBias,
  PatternCategoryId,
  PatternHit,
  PatternScanWindow,
  RuleCondition,
  RuleMetric,
  RuleOp,
} from '../../lib/patterns'
import {
  PATTERN_CATALOG,
  MAX_CONDITIONS,
  RULE_METRIC_OPTIONS,
  RULE_OP_OPTIONS,
  PATTERN_SCAN_WINDOWS,
  describeRuleSet,
  newCondition,
  scanWindowLabel,
} from '../../lib/patterns'
import { usePatternPrefs } from './PatternPrefsContext'

type Props = {
  loading: boolean
  error: string | null
  categories: CategorySummary[]
  catalogTotal: number
  scanWindow: PatternScanWindow
  onScanWindowChange: (window: PatternScanWindow) => void
  activeCategory: PatternCategoryId | null
  selectedPatternId: string | null
  onSelectCategory: (id: PatternCategoryId | null) => void
  onSelectPattern: (hit: PatternHit) => void
}

type DetectMode = 'rules' | 'alias' | 'none'

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
  scanWindow,
  onScanWindowChange,
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
  const [detectMode, setDetectMode] = useState<DetectMode>('rules')
  const [matchMode, setMatchMode] = useState<'all' | 'any'>('all')
  const [conditions, setConditions] = useState<RuleCondition[]>(() => [newCondition('rsi')])

  const active = categories.find((c) => c.id === activeCategory) ?? null
  const totalHits = categories
    .filter((c) => c.id !== 'starred' && c.id !== 'custom')
    .reduce((a, c) => a + c.bullish + c.bearish + c.neutral, 0)

  const catalogNames = useMemo(
    () => [...new Set(PATTERN_CATALOG.map((p) => p.name))].sort((a, b) => a.localeCompare(b)),
    [],
  )

  const resetForm = () => {
    setCName('')
    setCDesc('')
    setCBasedOn('')
    setCBias('bullish')
    setDetectMode('rules')
    setMatchMode('all')
    setConditions([newCondition('rsi')])
    setShowCreate(false)
  }

  const updateCondition = (id: string, patch: Partial<RuleCondition>) => {
    setConditions((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c
        const next = { ...c, ...patch }
        if (patch.metric && patch.metric !== c.metric) {
          const meta = RULE_METRIC_OPTIONS.find((m) => m.id === patch.metric)
          if (meta) {
            next.value = meta.defaultValue
            next.op = meta.id === 'rsi' ? 'lte' : 'gte'
          }
        }
        return next
      }),
    )
  }

  const submitCustom = (e: FormEvent) => {
    e.preventDefault()
    if (!cName.trim()) return
    createCustom({
      name: cName.trim(),
      bias: cBias,
      description: cDesc,
      basedOn: detectMode === 'alias' ? cBasedOn || null : null,
      rules:
        detectMode === 'rules' && conditions.length > 0
          ? { match: matchMode, conditions }
          : null,
    })
    resetForm()
    onSelectCategory('custom')
  }

  return (
    <aside className="flex h-full w-full max-w-sm flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="border-b border-[var(--color-border)] px-3 py-2.5">
        <h3 className="text-sm font-bold">Pattern Analysis</h3>
        <p className="text-[10px] text-[var(--color-ink-soft)]">
          {catalogTotal} scanners · {totalHits} hits in {scanWindowLabel(scanWindow)} · My Patterns
          are private
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {PATTERN_SCAN_WINDOWS.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => onScanWindowChange(w.id)}
              className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                scanWindow === w.id
                  ? 'bg-sky-700 text-white'
                  : 'border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-ink-soft)] hover:border-sky-400'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
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
                          {total} hit{total === 1 ? '' : 's'} · {cat.analyzed} scanned
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

                  <fieldset className="space-y-1.5">
                    <legend className="text-[10px] font-semibold text-[var(--color-ink-soft)]">
                      How to detect
                    </legend>
                    {(
                      [
                        ['rules', 'My conditions (RSI, RVOL, MAs…)'],
                        ['alias', 'Reuse a built-in scanner'],
                        ['none', 'Name only (no auto-detect)'],
                      ] as const
                    ).map(([id, label]) => (
                      <label
                        key={id}
                        className="flex cursor-pointer items-center gap-2 text-[11px]"
                      >
                        <input
                          type="radio"
                          name="detectMode"
                          checked={detectMode === id}
                          onChange={() => setDetectMode(id)}
                        />
                        {label}
                      </label>
                    ))}
                  </fieldset>

                  {detectMode === 'rules' && (
                    <div className="space-y-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
                      <label className="flex items-center gap-2 text-[10px] text-[var(--color-ink-soft)]">
                        Match
                        <select
                          value={matchMode}
                          onChange={(e) => setMatchMode(e.target.value as 'all' | 'any')}
                          className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 text-[11px]"
                        >
                          <option value="all">All conditions (AND)</option>
                          <option value="any">Any condition (OR)</option>
                        </select>
                      </label>
                      {conditions.map((c) => (
                        <div key={c.id} className="flex flex-wrap items-center gap-1">
                          <select
                            value={c.metric}
                            onChange={(e) =>
                              updateCondition(c.id, { metric: e.target.value as RuleMetric })
                            }
                            className="min-w-0 flex-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1 py-1 text-[10px]"
                          >
                            {RULE_METRIC_OPTIONS.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.label}
                              </option>
                            ))}
                          </select>
                          <select
                            value={c.op}
                            onChange={(e) =>
                              updateCondition(c.id, { op: e.target.value as RuleOp })
                            }
                            className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1 py-1 text-[10px]"
                          >
                            {RULE_OP_OPTIONS.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                          <input
                            type="number"
                            step="any"
                            value={c.value}
                            onChange={(e) =>
                              updateCondition(c.id, { value: Number(e.target.value) })
                            }
                            className="w-14 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1 py-1 text-[10px]"
                          />
                          <button
                            type="button"
                            disabled={conditions.length <= 1}
                            onClick={() =>
                              setConditions((prev) => prev.filter((x) => x.id !== c.id))
                            }
                            className="rounded p-0.5 text-rose-600 disabled:opacity-30"
                            title="Remove condition"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                      {conditions.length < MAX_CONDITIONS && (
                        <button
                          type="button"
                          onClick={() => setConditions((prev) => [...prev, newCondition()])}
                          className="text-[10px] font-semibold text-teal-700 hover:underline dark:text-teal-300"
                        >
                          + Add condition
                        </button>
                      )}
                      <p className="text-[9px] text-[var(--color-ink-soft)]">
                        Fires if true on any of the last ~10 sessions.
                      </p>
                    </div>
                  )}

                  {detectMode === 'alias' && (
                    <label className="block text-[10px] text-[var(--color-ink-soft)]">
                      Built-in scanner
                      <select
                        value={cBasedOn}
                        onChange={(e) => setCBasedOn(e.target.value)}
                        className="mt-0.5 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs"
                        required
                      >
                        <option value="">Select…</option>
                        {catalogNames.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

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
                      className="flex items-start justify-between gap-2 text-[10px] text-[var(--color-ink-soft)]"
                    >
                      <span>
                        <span className="font-semibold text-[var(--color-ink)]">{c.name}</span>
                        {c.rules?.conditions?.length
                          ? ` · ${describeRuleSet(c.rules)}`
                          : c.basedOn
                            ? ` ← ${c.basedOn}`
                            : ' · name only'}
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteCustom(c.id)}
                        className="shrink-0 rounded p-0.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
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
            </p>
            {active.note && (
              <p className="mb-2 text-[10px] text-[var(--color-ink-soft)]">{active.note}</p>
            )}
            <ul className="space-y-1">
              {active.rows.map((row) => {
                const starred = isStarred(row.name)
                const customDef = customPatterns.find((c) => c.name === row.name)
                const hit = row.hit
                return (
                  <li key={row.name}>
                    <div
                      className={`flex items-start gap-1 rounded-md border px-2 py-1.5 ${
                        hit && selectedPatternId === hit.id
                          ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/40'
                          : 'border-[var(--color-border)] bg-[var(--color-bg)]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleStar(row.name)}
                        className="mt-0.5 shrink-0 rounded p-0.5"
                        title={starred ? 'Unstar pattern' : 'Star pattern'}
                        aria-label={starred ? 'Unstar' : 'Star'}
                      >
                        <Star
                          size={14}
                          className={
                            starred
                              ? 'fill-amber-400 text-amber-500'
                              : 'text-[var(--color-ink-soft)]'
                          }
                        />
                      </button>
                      <button
                        type="button"
                        disabled={!hit}
                        onClick={() => hit && onSelectPattern(hit)}
                        className="min-w-0 flex-1 text-left disabled:cursor-default"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-semibold">{row.name}</span>
                          <span className={`text-[10px] font-bold ${biasClass(row.familyBias)}`}>
                            {hit ? hit.bias : row.familyBias}
                          </span>
                        </div>
                        {hit ? (
                          <p className="mt-0.5 text-[10px] text-[var(--color-ink-soft)]">
                            {formatDate(hit.endT)}
                            {hit.note ? ` · ${hit.note}` : ''}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-[10px] text-[var(--color-ink-soft)]">No hit</p>
                        )}
                      </button>
                      {customDef && active.id === 'custom' && (
                        <button
                          type="button"
                          onClick={() => deleteCustom(customDef.id)}
                          className="mt-0.5 shrink-0 rounded p-0.5 text-rose-600"
                          title="Delete custom pattern"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
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
