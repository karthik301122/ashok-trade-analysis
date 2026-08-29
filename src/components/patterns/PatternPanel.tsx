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
  CustomRuleSet,
} from '../../lib/patterns'
import {
  PATTERN_CATALOG,
  MAX_CONDITIONS,
  RULE_METRIC_OPTIONS,
  RULE_OP_OPTIONS,
  PATTERN_SCAN_WINDOWS,
  CANDLE_SHAPE_PRESETS,
  candlePresetById,
  defaultCandleShape,
  describeCandleShape,
  describeRuleSet,
  newCondition,
  scanWindowLabel,
  SCANSCRIPT_EXAMPLE,
  SCANSCRIPT_NAME,
  validateScanScript,
  describeScanScript,
  type BodyPosition,
  type CandleContext,
  type CandleDirection,
  type CandleGeometry,
  type CandleShapeSpec,
  type CandleTimeframe,
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
  activeCategory: PatternCategoryId | null
  selectedPatternId: string | null
  onSelectCategory: (id: PatternCategoryId | null) => void
  onSelectPattern: (hit: PatternHit) => void
}

type DetectMode = 'rules' | 'candle' | 'alias' | 'script' | 'none'

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
  const [candleShape, setCandleShape] = useState<CandleShapeSpec>(() => defaultCandleShape('hammer'))
  const [cScanScript, setCScanScript] = useState(SCANSCRIPT_EXAMPLE)

  const scriptErrors = useMemo(
    () => (detectMode === 'script' ? validateScanScript(cScanScript) : []),
    [detectMode, cScanScript],
  )
  const scriptPreview = useMemo(
    () => (detectMode === 'script' && scriptErrors.length === 0 ? describeScanScript(cScanScript) : ''),
    [detectMode, cScanScript, scriptErrors.length],
  )

  const active = categories.find((c) => c.id === activeCategory) ?? null
  const totalHits = categories
    .filter((c) => c.id !== 'starred' && c.id !== 'custom')
    .reduce((a, c) => a + c.bullish + c.bearish + c.neutral, 0)

  const resolvedChartInterval = resolveChartInterval(chartInterval, scanWindow)
  const chartIntervalText =
    chartInterval === 'auto'
      ? `auto (${chartIntervalLabel(resolvedChartInterval)})`
      : chartIntervalLabel(chartInterval)

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
    setCandleShape(defaultCandleShape('hammer'))
    setCScanScript(SCANSCRIPT_EXAMPLE)
    setShowCreate(false)
  }

  const applyPreset = (presetId: string) => {
    const preset = candlePresetById(presetId)
    if (!preset) return
    setCandleShape((prev) => ({
      ...prev,
      presetId: preset.id,
      geometry: { ...preset.geometry },
    }))
    setCBias(preset.bias)
    if (!cName.trim()) setCName(preset.label)
    if (!cDesc.trim()) setCDesc(preset.description)
  }

  const patchGeometry = (patch: Partial<CandleGeometry>) => {
    setCandleShape((prev) => ({
      ...prev,
      presetId: 'custom',
      geometry: { ...prev.geometry, ...patch },
    }))
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
    if (detectMode === 'script' && scriptErrors.length > 0) return
    createCustom({
      name: cName.trim(),
      bias: cBias,
      description: cDesc,
      basedOn: detectMode === 'alias' ? cBasedOn || null : null,
      rules:
        detectMode === 'rules' && conditions.length > 0
          ? { match: matchMode, conditions }
          : null,
      candleShape: detectMode === 'candle' ? candleShape : null,
      scanScript: detectMode === 'script' ? cScanScript : null,
    })
    resetForm()
    onSelectCategory('custom')
  }

  return (
    <aside className="flex h-full w-full max-w-sm flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="border-b border-[var(--color-border)] px-3 py-2.5">
        <h3 className="text-sm font-bold">Pattern Analysis</h3>
        <p className="text-[10px] text-[var(--color-ink-soft)]">
          {catalogTotal} scanners · {totalHits} hits in {scanWindowLabel(scanWindow)} · chart{' '}
          {chartIntervalText} · patterns scan daily · My Patterns are private
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {onChartIntervalChange && (
            <ChartIntervalDropdown value={chartInterval} onChange={onChartIntervalChange} />
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
                        ['script', SCANSCRIPT_NAME + ' (text rules)'],
                        ['candle', 'Candle shape builder'],
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

                  {detectMode === 'candle' && (
                    <div className="space-y-2 rounded-md border border-violet-300/60 bg-violet-50/40 p-2 dark:border-violet-800 dark:bg-violet-950/20">
                      <label className="block text-[10px] text-[var(--color-ink-soft)]">
                        Preset
                        <select
                          value={candleShape.presetId}
                          onChange={(e) => applyPreset(e.target.value)}
                          className="mt-0.5 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-1 text-[11px]"
                        >
                          {CANDLE_SHAPE_PRESETS.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <label className="text-[10px] text-[var(--color-ink-soft)]">
                          Timeframe
                          <select
                            value={candleShape.timeframe}
                            onChange={(e) =>
                              setCandleShape((prev) => ({
                                ...prev,
                                timeframe: e.target.value as CandleTimeframe,
                              }))
                            }
                            className="ml-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1 py-0.5 text-[11px]"
                          >
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                          </select>
                        </label>
                        <label className="text-[10px] text-[var(--color-ink-soft)]">
                          Candles
                          <select
                            value={candleShape.candleCount}
                            onChange={(e) =>
                              setCandleShape((prev) => ({
                                ...prev,
                                candleCount: Number(e.target.value) === 2 ? 2 : 1,
                              }))
                            }
                            className="ml-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1 py-0.5 text-[11px]"
                          >
                            <option value={1}>1 candle</option>
                            <option value={2}>2 consecutive</option>
                          </select>
                        </label>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <label className="text-[9px] text-[var(--color-ink-soft)]">
                          Lower wick ≥ × body
                          <input
                            type="number"
                            min={0}
                            step={0.5}
                            value={candleShape.geometry.minLowerWickBodyMult}
                            onChange={(e) =>
                              patchGeometry({ minLowerWickBodyMult: Number(e.target.value) })
                            }
                            className="mt-0.5 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1 py-0.5 text-[11px]"
                          />
                        </label>
                        <label className="text-[9px] text-[var(--color-ink-soft)]">
                          Upper wick ≥ × body
                          <input
                            type="number"
                            min={0}
                            step={0.5}
                            value={candleShape.geometry.minUpperWickBodyMult}
                            onChange={(e) =>
                              patchGeometry({ minUpperWickBodyMult: Number(e.target.value) })
                            }
                            className="mt-0.5 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1 py-0.5 text-[11px]"
                          />
                        </label>
                        <label className="text-[9px] text-[var(--color-ink-soft)]">
                          Max upper wick (% range)
                          <input
                            type="number"
                            min={1}
                            max={100}
                            step={1}
                            value={Math.round(candleShape.geometry.maxUpperWickRangeFrac * 100)}
                            onChange={(e) =>
                              patchGeometry({
                                maxUpperWickRangeFrac: Number(e.target.value) / 100,
                              })
                            }
                            className="mt-0.5 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1 py-0.5 text-[11px]"
                          />
                        </label>
                        <label className="text-[9px] text-[var(--color-ink-soft)]">
                          Max lower wick (% range)
                          <input
                            type="number"
                            min={1}
                            max={100}
                            step={1}
                            value={Math.round(candleShape.geometry.maxLowerWickRangeFrac * 100)}
                            onChange={(e) =>
                              patchGeometry({
                                maxLowerWickRangeFrac: Number(e.target.value) / 100,
                              })
                            }
                            className="mt-0.5 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1 py-0.5 text-[11px]"
                          />
                        </label>
                        <label className="text-[9px] text-[var(--color-ink-soft)]">
                          Max body (% range)
                          <input
                            type="number"
                            min={1}
                            max={100}
                            step={1}
                            value={Math.round(candleShape.geometry.maxBodyRangeFrac * 100)}
                            onChange={(e) =>
                              patchGeometry({ maxBodyRangeFrac: Number(e.target.value) / 100 })
                            }
                            className="mt-0.5 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1 py-0.5 text-[11px]"
                          />
                        </label>
                        <label className="text-[9px] text-[var(--color-ink-soft)]">
                          Min body (% range)
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={Math.round(candleShape.geometry.minBodyRangeFrac * 100)}
                            onChange={(e) =>
                              patchGeometry({ minBodyRangeFrac: Number(e.target.value) / 100 })
                            }
                            className="mt-0.5 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1 py-0.5 text-[11px]"
                          />
                        </label>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <label className="text-[10px] text-[var(--color-ink-soft)]">
                          Body position
                          <select
                            value={candleShape.geometry.bodyPosition}
                            onChange={(e) =>
                              patchGeometry({ bodyPosition: e.target.value as BodyPosition })
                            }
                            className="ml-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1 py-0.5 text-[11px]"
                          >
                            <option value="any">Anywhere</option>
                            <option value="near_top">Near top</option>
                            <option value="near_bottom">Near bottom</option>
                          </select>
                        </label>
                        <label className="text-[10px] text-[var(--color-ink-soft)]">
                          Direction
                          <select
                            value={candleShape.geometry.direction}
                            onChange={(e) =>
                              patchGeometry({ direction: e.target.value as CandleDirection })
                            }
                            className="ml-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1 py-0.5 text-[11px]"
                          >
                            <option value="either">Either</option>
                            <option value="bullish">Bullish</option>
                            <option value="bearish">Bearish</option>
                          </select>
                        </label>
                        <label className="text-[10px] text-[var(--color-ink-soft)]">
                          Context
                          <select
                            value={candleShape.geometry.context}
                            onChange={(e) =>
                              patchGeometry({ context: e.target.value as CandleContext })
                            }
                            className="ml-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1 py-0.5 text-[11px]"
                          >
                            <option value="any">Any</option>
                            <option value="after_decline">After decline</option>
                            <option value="after_rally">After rally</option>
                          </select>
                        </label>
                      </div>
                      <p className="text-[9px] text-[var(--color-ink-soft)]">
                        {describeCandleShape(candleShape)}. Scans last ~16 completed bars/weeks. Set
                        a wick multiple to 0 to turn that rule off; max wick % = 100 means no max.
                      </p>
                    </div>
                  )}

                  {detectMode === 'script' && (
                    <div className="space-y-2 rounded-md border border-sky-300/60 bg-sky-50/40 p-2 dark:border-sky-800 dark:bg-sky-950/20">
                      <p className="text-[10px] font-semibold text-sky-900 dark:text-sky-100">
                        {SCANSCRIPT_NAME}
                      </p>
                      <textarea
                        value={cScanScript}
                        onChange={(e) => setCScanScript(e.target.value)}
                        rows={8}
                        spellCheck={false}
                        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 font-mono text-[10px] leading-relaxed"
                      />
                      {scriptErrors.length > 0 && (
                        <ul className="space-y-0.5 text-[10px] text-rose-600">
                          {scriptErrors.map((err) => (
                            <li key={err}>{err}</li>
                          ))}
                        </ul>
                      )}
                      {scriptPreview && (
                        <p className="text-[9px] text-[var(--color-ink-soft)]">
                          Compiles to: {scriptPreview}
                        </p>
                      )}
                      <p className="text-[9px] text-[var(--color-ink-soft)]">
                        Headers: <code className="text-[9px]">match all</code>,{' '}
                        <code className="text-[9px]">bias bullish</code>. Conditions:{' '}
                        <code className="text-[9px]">rsi(14) &lt;= 35</code>,{' '}
                        <code className="text-[9px]">rvol &gt;= 1.5</code>,{' '}
                        <code className="text-[9px]">above_sma(50)</code>,{' '}
                        <code className="text-[9px]">pct_chg(5) &gt;= 3</code>. Scans full ASX
                        when saved.
                      </p>
                    </div>
                  )}

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
                    disabled={detectMode === 'script' && scriptErrors.length > 0}
                    className="w-full rounded-md bg-teal-700 px-2 py-1.5 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-50"
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
