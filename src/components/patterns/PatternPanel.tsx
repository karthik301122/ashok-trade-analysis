import { ChevronLeft, Plus, Star, Trash2 } from 'lucide-react'
import type {
  CategorySummary,
  PatternCategoryId,
  PatternHit,
  PatternScanWindow,
  CustomRuleSet,
  CandleShapeSpec,
} from '../../lib/patterns'
import {
  PATTERN_SCAN_WINDOWS,
  describeCandleShape,
  describeRuleSet,
  scanWindowLabel,
  SCANSCRIPT_NAME,
} from '../../lib/patterns'
import { usePatternPrefs } from './usePatternPrefs'
import { ChartIntervalDropdown } from './ChartIntervalDropdown'
import type { ChartIntervalPref } from '../../lib/chartInterval'
import { chartIntervalLabel, resolveChartInterval } from '../../lib/chartInterval'

type Props = {
  loading: boolean
  error: string | null
  categories: CategorySummary[]
  catalogTotal: number
  scanWindow: PatternScanWindow
  onScanWindowChange: (window: PatternScanWindow) => void
  chartInterval?: ChartIntervalPref
  onChartIntervalChange?: (interval: ChartIntervalPref) => void
  chartBarInterval?: string
  activeCategory: PatternCategoryId | null
  selectedPatternId: string | null
  onSelectCategory: (id: PatternCategoryId | null) => void
  onSelectPattern: (hit: PatternHit) => void
  onOpenCreateTab?: () => void
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

function describeCustomPattern(c: {
  scanScript?: string | null
  candleShape: CandleShapeSpec | null
  rules: CustomRuleSet | null
  basedOn: string | null
}): string {
  if (c.scanScript) return ` · ${SCANSCRIPT_NAME}`
  if (c.candleShape) return ` · ${describeCandleShape(c.candleShape)}`
  if (c.rules?.conditions?.length) return ` · ${describeRuleSet(c.rules)}`
  if (c.basedOn) return ` <- ${c.basedOn}`
  return ' · name only'
}

export function PatternPanel({
  loading,
  error,
  categories,
  catalogTotal,
  scanWindow,
  onScanWindowChange,
  chartInterval = 'auto',
  onChartIntervalChange,
  chartBarInterval,
  activeCategory,
  selectedPatternId,
  onSelectCategory,
  onSelectPattern,
  onOpenCreateTab,
}: Props) {
  const { isStarred, toggleStar, deleteCustom, customPatterns } = usePatternPrefs()

  const active = categories.find((c) => c.id === activeCategory) ?? null
  const totalHits = categories
    .filter((c) => c.id !== 'starred' && c.id !== 'custom')
    .reduce((a, c) => a + c.bullish + c.bearish + c.neutral, 0)

  const resolvedChartInterval = resolveChartInterval(chartInterval, scanWindow)
  const activeBarInterval =
    chartBarInterval && chartBarInterval !== '1d' ? chartBarInterval : resolvedChartInterval
  const labelInterval = activeBarInterval as '1m' | '5m' | '15m' | '30m' | '1h' | '1d'
  const chartIntervalText =
    chartInterval === 'auto'
      ? `auto (${chartIntervalLabel(labelInterval)})`
      : chartIntervalLabel(labelInterval)

  return (
    <aside className="flex h-full w-full flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="border-b border-[var(--color-border)] px-3 py-2.5">
        <h3 className="text-sm font-bold">Pattern Analysis</h3>
        <p className="text-[10px] text-[var(--color-ink-soft)]">
          {catalogTotal} scanners · {totalHits} hits in {scanWindowLabel(scanWindow)} · desk chart{' '}
          {chartIntervalText} · patterns scan daily · My Patterns are private
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {onChartIntervalChange && (
            <ChartIntervalDropdown
              value={chartInterval}
              onChange={onChartIntervalChange}
              effectiveBarInterval={chartBarInterval}
            />
          )}
        </div>
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

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {loading && (
          <p className="p-3 text-sm text-[var(--color-ink-soft)]">Scanning OHLC for patterns…</p>
        )}
        {error && <p className="p-3 text-sm text-rose-600">{error}</p>}

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

            <div className="rounded-xl border border-dashed border-teal-400/60 bg-[var(--color-bg)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-teal-800 dark:text-teal-200">
                    Create my pattern
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                    Full-width builder for rules, candle shapes, or scan script.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenCreateTab?.()}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-teal-600 bg-teal-50 px-3 py-2 text-sm font-bold text-teal-900 dark:bg-teal-950/50 dark:text-teal-100"
                >
                  <Plus size={16} />
                  New
                </button>
              </div>
              {customPatterns.length > 0 && (
                <ul className="mt-3 space-y-1.5 border-t border-teal-400/30 pt-3">
                  {customPatterns.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-start justify-between gap-2 text-[10px] text-[var(--color-ink-soft)]"
                    >
                      <span>
                        <span className="font-semibold text-[var(--color-ink)]">{c.name}</span>
                        {describeCustomPattern(c)}
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
                            Started {formatDate(hit.startT)}
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
