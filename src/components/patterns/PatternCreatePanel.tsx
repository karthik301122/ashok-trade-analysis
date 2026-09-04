import { useMemo, useState, useEffect, type FormEvent } from 'react'
import { BookOpen, ChevronDown, ChevronRight, Pencil, Trash2 } from 'lucide-react'
import type {
  OhlcBar,
  PatternBias,
  PatternCategoryId,
  RuleCondition,
  RuleMetric,
  RuleOp,
} from '../../lib/patterns'
import {
  PATTERN_CATALOG,
  MAX_CONDITIONS,
  RULE_METRIC_OPTIONS,
  RULE_OP_OPTIONS,
  CANDLE_SHAPE_PRESETS,
  candlePresetById,
  defaultCandleShape,
  describeCandleShape,
  newCondition,
  SCANSCRIPT_EXAMPLE,
  SCANSCRIPT_GUIDE,
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
import type { DrawnTool } from '../../lib/patterns/drawnPattern'
import { describeDrawnSpec, describeDrawnTool, defaultTriggerForTool } from '../../lib/patterns/drawnPattern'
import { usePatternPrefs } from './usePatternPrefs'

export type DetectMode = 'draw' | 'rules' | 'candle' | 'alias' | 'script' | 'none'

type Props = {
  variant?: 'page' | 'sidebar' | 'studio'
  bars?: OhlcBar[]
  ticker?: string
  drawTools: DrawnTool[]
  onDrawToolsChange: (tools: DrawnTool[]) => void
  drawTimeframe: 'daily' | 'weekly'
  onDrawTimeframeChange: (tf: 'daily' | 'weekly') => void
  /** Saving a pattern from chart drawings — hide detect-mode picker */
  drawSaveMode?: boolean
  onDetectModeChange?: (mode: DetectMode) => void
  onBiasChange?: (bias: PatternBias) => void
  onSaved?: (category: PatternCategoryId) => void
  onCancel?: () => void
}

export function PatternCreatePanel({
  variant = 'page',
  bars: _bars = [],
  ticker,
  drawTools,
  onDrawToolsChange,
  drawTimeframe,
  onDrawTimeframeChange,
  drawSaveMode = false,
  onDetectModeChange,
  onBiasChange,
  onSaved,
  onCancel,
}: Props) {
  const { createCustom, updateCustom, customPatterns, deleteCustom } = usePatternPrefs()
  const [cName, setCName] = useState('')
  const [cBias, setCBias] = useState<PatternBias>('bullish')
  const [cDesc, setCDesc] = useState('')
  const [cBasedOn, setCBasedOn] = useState('')
  const [detectMode, setDetectMode] = useState<DetectMode>(
    drawSaveMode ? 'draw' : 'rules',
  )
  const [matchMode, setMatchMode] = useState<'all' | 'any'>('all')
  const [conditions, setConditions] = useState<RuleCondition[]>(() => [newCondition('rsi')])
  const [candleShape, setCandleShape] = useState<CandleShapeSpec>(() => defaultCandleShape('hammer'))
  const [cScanScript, setCScanScript] = useState(SCANSCRIPT_EXAMPLE)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [scriptGuideOpen, setScriptGuideOpen] = useState(true)

  const scriptErrors = useMemo(
    () => (detectMode === 'script' ? validateScanScript(cScanScript) : []),
    [detectMode, cScanScript],
  )
  const scriptPreview = useMemo(
    () => (detectMode === 'script' && scriptErrors.length === 0 ? describeScanScript(cScanScript) : ''),
    [detectMode, cScanScript, scriptErrors.length],
  )

  useEffect(() => {
    if (detectMode !== 'draw' || !drawTools.length) return
    const next = drawTools.map((t) => ({
      ...t,
      trigger: defaultTriggerForTool(t.type, cBias),
    }))
    const changed = drawTools.some((t, i) => t.trigger !== next[i]?.trigger)
    if (changed) onDrawToolsChange(next)
  }, [cBias, detectMode, drawTools, onDrawToolsChange])

  useEffect(() => {
    onDetectModeChange?.(detectMode)
  }, [detectMode, onDetectModeChange])

  useEffect(() => {
    onBiasChange?.(cBias)
  }, [cBias, onBiasChange])

  const catalogNames = useMemo(
    () => [...new Set(PATTERN_CATALOG.map((p) => p.name))].sort((a, b) => a.localeCompare(b)),
    [],
  )

  const resetForm = () => {
    setCName('')
    setCDesc('')
    setCBasedOn('')
    setCBias('bullish')
    setDetectMode(drawSaveMode ? 'draw' : 'rules')
    setMatchMode('all')
    setConditions([newCondition('rsi')])
    setCandleShape(defaultCandleShape('hammer'))
    setCScanScript(SCANSCRIPT_EXAMPLE)
    onDrawToolsChange([])
    onDrawTimeframeChange('daily')
    setEditingId(null)
  }

  const loadForEdit = (id: string) => {
    const c = customPatterns.find((p) => p.id === id)
    if (!c) return
    setEditingId(c.id)
    setCName(c.name)
    setCBias(c.bias)
    setCDesc(c.description)
    if (c.drawnSpec?.tools?.length) {
      setDetectMode('draw')
      onDrawToolsChange(c.drawnSpec.tools)
      onDrawTimeframeChange(c.drawnSpec.timeframe)
    } else if (c.candleShape) {
      setDetectMode('candle')
      setCandleShape(c.candleShape)
    } else if (c.scanScript) {
      setDetectMode('script')
      setCScanScript(c.scanScript)
    } else if (c.rules?.conditions?.length) {
      setDetectMode('rules')
      setMatchMode(c.rules.match)
      setConditions(c.rules.conditions)
    } else if (c.basedOn) {
      setDetectMode('alias')
      setCBasedOn(c.basedOn)
    } else {
      setDetectMode('none')
    }
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
    if (detectMode === 'draw' && drawTools.length === 0) return

    const payload = {
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
      drawnSpec:
        detectMode === 'draw'
          ? { timeframe: drawTimeframe, tools: drawTools }
          : null,
    }

    if (editingId) {
      updateCustom(editingId, payload)
    } else {
      createCustom(payload)
    }
    resetForm()
    onSaved?.('custom')
  }

  const isSidebar = variant === 'sidebar'
  const isStudio = variant === 'studio'

  return (
    <div
      className={
        isSidebar || isStudio
          ? 'min-h-0 flex-1 overflow-auto bg-[var(--color-bg)] p-4 lg:p-5'
          : 'min-h-0 flex-1 overflow-auto bg-[var(--color-bg)]'
      }
    >
      <div
        className={
          isSidebar || isStudio
            ? 'space-y-4'
            : 'mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8'
        }
      >
        {!isSidebar && !isStudio && variant !== 'page' && (
          <div className="mb-6">
            <h3 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-teal-900 dark:text-teal-100">
              Create my pattern
            </h3>
            <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
              Private pattern saved on this device. Draw levels on the chart, or use rules, candle
              shapes, or scan script.
              {ticker ? ` Template chart: ${ticker}.` : ''} Scans the full ASX when saved.
            </p>
          </div>
        )}

        <form onSubmit={submitCustom} className="space-y-4">
          <div
            className={
              isSidebar || isStudio
                ? 'space-y-4'
                : 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]'
            }
          >
            <div
              className={
                isSidebar
                  ? 'space-y-3'
                  : isStudio
                    ? 'space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4'
                    : 'space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5'
              }
            >
          {isSidebar ? (
          <h3 className="text-sm font-bold text-teal-900 dark:text-teal-100">Create my pattern</h3>
        ) : isStudio ? null : (
          <h4 className="text-sm font-bold">Basics</h4>
        )}
              <input
                value={cName}
                onChange={(e) => setCName(e.target.value)}
                placeholder="Pattern name"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm"
                required
              />
              <select
                value={cBias}
                onChange={(e) => setCBias(e.target.value as PatternBias)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm"
              >
                <option value="bullish">Bullish</option>
                <option value="bearish">Bearish</option>
                <option value="neutral">Neutral</option>
              </select>
              <textarea
                value={cDesc}
                onChange={(e) => setCDesc(e.target.value)}
                placeholder="Notes (optional)"
                rows={4}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm"
              />

              {!drawSaveMode && detectMode !== 'draw' && (
              <fieldset className="space-y-2 border-t border-[var(--color-border)] pt-4">
                <legend className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
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
                  <label key={id} className="flex cursor-pointer items-center gap-2.5 text-sm">
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
              )}

              {(drawSaveMode || detectMode === 'draw') && (
                <div className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                  {drawSaveMode ? (
                    <p className="text-xs text-[var(--color-ink-soft)]">
                      Chart drawings ({drawTools.length} tool{drawTools.length === 1 ? '' : 's'})
                    </p>
                  ) : (
                    <p className="text-xs text-[var(--color-ink-soft)]">
                      Drawn pattern — open the stock chart to edit lines on the chart.
                    </p>
                  )}
                  {!drawSaveMode && (
                    <label className="text-xs font-semibold text-[var(--color-ink-soft)]">
                      Scan timeframe
                      <select
                        value={drawTimeframe}
                        onChange={(e) =>
                          onDrawTimeframeChange(e.target.value === 'weekly' ? 'weekly' : 'daily')
                        }
                        className="ml-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
                      >
                        <option value="daily">Daily bars</option>
                        <option value="weekly">Weekly bars</option>
                      </select>
                    </label>
                  )}
                  {drawTools.length > 0 && (
                    <>
                      <p className="text-xs text-[var(--color-ink-soft)]">
                        {describeDrawnSpec({ timeframe: drawTimeframe, tools: drawTools })}
                      </p>
                      {!drawSaveMode && (
                        <ul className="space-y-1 text-xs">
                          {drawTools.map((tool) => (
                            <li key={tool.id} className="text-[var(--color-ink-soft)]">
                              {describeDrawnTool(tool)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {detectMode !== 'draw' && (
            <div
              className={
                isSidebar
                  ? 'space-y-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3'
                  : isStudio
                    ? 'space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4'
                    : 'min-h-[320px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5'
              }
            >
              {detectMode === 'candle' && (
                <div className="space-y-4">
                  <h4 className="text-sm font-bold">Candle shape</h4>
                  <label className="block text-xs font-semibold text-[var(--color-ink-soft)]">
                    Preset
                    <select
                      value={candleShape.presetId}
                      onChange={(e) => applyPreset(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
                    >
                      {CANDLE_SHAPE_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex flex-wrap gap-4">
                    <label className="text-xs font-semibold text-[var(--color-ink-soft)]">
                      Timeframe
                      <select
                        value={candleShape.timeframe}
                        onChange={(e) =>
                          setCandleShape((prev) => ({
                            ...prev,
                            timeframe: e.target.value as CandleTimeframe,
                          }))
                        }
                        className="ml-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
                      >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-[var(--color-ink-soft)]">
                      Candles
                      <select
                        value={candleShape.candleCount}
                        onChange={(e) =>
                          setCandleShape((prev) => ({
                            ...prev,
                            candleCount: Number(e.target.value) === 2 ? 2 : 1,
                          }))
                        }
                        className="ml-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
                      >
                        <option value={1}>1 candle</option>
                        <option value={2}>2 consecutive</option>
                      </select>
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <label className="text-xs text-[var(--color-ink-soft)]">
                      Lower wick ≥ × body
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={candleShape.geometry.minLowerWickBodyMult}
                        onChange={(e) =>
                          patchGeometry({ minLowerWickBodyMult: Number(e.target.value) })
                        }
                        className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-2 text-sm"
                      />
                    </label>
                    <label className="text-xs text-[var(--color-ink-soft)]">
                      Upper wick ≥ × body
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={candleShape.geometry.minUpperWickBodyMult}
                        onChange={(e) =>
                          patchGeometry({ minUpperWickBodyMult: Number(e.target.value) })
                        }
                        className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-2 text-sm"
                      />
                    </label>
                    <label className="text-xs text-[var(--color-ink-soft)]">
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
                        className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-2 text-sm"
                      />
                    </label>
                    <label className="text-xs text-[var(--color-ink-soft)]">
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
                        className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-2 text-sm"
                      />
                    </label>
                    <label className="text-xs text-[var(--color-ink-soft)]">
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
                        className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-2 text-sm"
                      />
                    </label>
                    <label className="text-xs text-[var(--color-ink-soft)]">
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
                        className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-2 text-sm"
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <label className="text-xs font-semibold text-[var(--color-ink-soft)]">
                      Body position
                      <select
                        value={candleShape.geometry.bodyPosition}
                        onChange={(e) =>
                          patchGeometry({ bodyPosition: e.target.value as BodyPosition })
                        }
                        className="ml-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
                      >
                        <option value="any">Anywhere</option>
                        <option value="near_top">Near top</option>
                        <option value="near_bottom">Near bottom</option>
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-[var(--color-ink-soft)]">
                      Direction
                      <select
                        value={candleShape.geometry.direction}
                        onChange={(e) =>
                          patchGeometry({ direction: e.target.value as CandleDirection })
                        }
                        className="ml-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
                      >
                        <option value="either">Either</option>
                        <option value="bullish">Bullish</option>
                        <option value="bearish">Bearish</option>
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-[var(--color-ink-soft)]">
                      Context
                      <select
                        value={candleShape.geometry.context}
                        onChange={(e) =>
                          patchGeometry({ context: e.target.value as CandleContext })
                        }
                        className="ml-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
                      >
                        <option value="any">Any</option>
                        <option value="after_decline">After decline</option>
                        <option value="after_rally">After rally</option>
                      </select>
                    </label>
                  </div>
                  <p className="text-xs text-[var(--color-ink-soft)]">
                    {describeCandleShape(candleShape)}. Scans last ~16 completed bars/weeks.
                  </p>
                </div>
              )}

              {detectMode === 'script' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-bold">{SCANSCRIPT_NAME}</h4>
                    <button
                      type="button"
                      onClick={() => setCScanScript(SCANSCRIPT_EXAMPLE)}
                      className="text-[11px] font-semibold text-teal-700 hover:underline dark:text-teal-300"
                    >
                      Load example
                    </button>
                  </div>

                  <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40">
                    <button
                      type="button"
                      onClick={() => setScriptGuideOpen((o) => !o)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)]"
                    >
                      <BookOpen size={14} className="shrink-0 text-teal-700 dark:text-teal-300" />
                      Rules guide
                      {scriptGuideOpen ? (
                        <ChevronDown size={14} className="ml-auto" />
                      ) : (
                        <ChevronRight size={14} className="ml-auto" />
                      )}
                    </button>
                    {scriptGuideOpen && (
                      <div className="space-y-3 border-t border-[var(--color-border)] px-3 py-3 text-[11px] leading-relaxed text-[var(--color-ink)]">
                        <p className="text-[var(--color-ink-soft)]">{SCANSCRIPT_GUIDE.summary}</p>

                        <div>
                          <p className="mb-1 font-bold text-[var(--color-ink-soft)]">Headers</p>
                          <ul className="space-y-1">
                            {SCANSCRIPT_GUIDE.headers.map((row) => (
                              <li key={row.code}>
                                <code className="rounded bg-[var(--color-bg)] px-1 py-0.5 font-mono text-[10px]">
                                  {row.code}
                                </code>
                                <span className="text-[var(--color-ink-soft)]"> — {row.meaning}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div>
                          <p className="mb-1 font-bold text-[var(--color-ink-soft)]">Metrics</p>
                          <ul className="space-y-1">
                            {SCANSCRIPT_GUIDE.metrics.map((row) => (
                              <li key={row.code}>
                                <code className="rounded bg-[var(--color-bg)] px-1 py-0.5 font-mono text-[10px]">
                                  {row.code}
                                </code>
                                <span className="text-[var(--color-ink-soft)]"> — {row.meaning}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div>
                          <p className="mb-1 font-bold text-[var(--color-ink-soft)]">Tips</p>
                          <ul className="list-inside list-disc space-y-0.5 text-[var(--color-ink-soft)]">
                            {SCANSCRIPT_GUIDE.tips.map((tip) => (
                              <li key={tip}>{tip}</li>
                            ))}
                          </ul>
                        </div>

                        <div className="space-y-2">
                          <p className="font-bold text-[var(--color-ink-soft)]">Examples</p>
                          {SCANSCRIPT_GUIDE.examples.map((ex) => (
                            <div
                              key={ex.title}
                              className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-2"
                            >
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <span className="font-semibold">{ex.title}</span>
                                <button
                                  type="button"
                                  onClick={() => setCScanScript(ex.script)}
                                  className="text-[10px] font-bold text-teal-700 hover:underline dark:text-teal-300"
                                >
                                  Use
                                </button>
                              </div>
                              <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[10px] leading-snug text-[var(--color-ink-soft)]">
                                {ex.script}
                              </pre>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <textarea
                    value={cScanScript}
                    onChange={(e) => setCScanScript(e.target.value)}
                    rows={14}
                    spellCheck={false}
                    className="min-h-[280px] w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 font-mono text-sm leading-relaxed"
                  />
                  {scriptErrors.length > 0 && (
                    <ul className="space-y-1 text-sm text-rose-600">
                      {scriptErrors.map((err) => (
                        <li key={err}>{err}</li>
                      ))}
                    </ul>
                  )}
                  {scriptPreview && (
                    <p className="text-sm text-[var(--color-ink-soft)]">
                      Compiles to: {scriptPreview}
                    </p>
                  )}
                </div>
              )}

              {detectMode === 'rules' && (
                <div className="space-y-4">
                  <h4 className="text-sm font-bold">Rule conditions</h4>
                  <label className="flex items-center gap-2 text-sm text-[var(--color-ink-soft)]">
                    Match
                    <select
                      value={matchMode}
                      onChange={(e) => setMatchMode(e.target.value as 'all' | 'any')}
                      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
                    >
                      <option value="all">All conditions (AND)</option>
                      <option value="any">Any condition (OR)</option>
                    </select>
                  </label>
                  {conditions.map((c) => (
                    <div key={c.id} className="flex flex-wrap items-center gap-2">
                      <select
                        value={c.metric}
                        onChange={(e) =>
                          updateCondition(c.id, { metric: e.target.value as RuleMetric })
                        }
                        className="min-w-[160px] flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-2 text-sm"
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
                        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-2 text-sm"
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
                        className="w-24 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-2 text-sm"
                      />
                      <button
                        type="button"
                        disabled={conditions.length <= 1}
                        onClick={() =>
                          setConditions((prev) => prev.filter((x) => x.id !== c.id))
                        }
                        className="rounded-lg p-2 text-rose-600 disabled:opacity-30"
                        title="Remove condition"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                  {conditions.length < MAX_CONDITIONS && (
                    <button
                      type="button"
                      onClick={() => setConditions((prev) => [...prev, newCondition()])}
                      className="text-sm font-semibold text-teal-700 hover:underline dark:text-teal-300"
                    >
                      + Add condition
                    </button>
                  )}
                  <p className="text-xs text-[var(--color-ink-soft)]">
                    Fires if true on any of the last ~10 sessions.
                  </p>
                </div>
              )}

              {detectMode === 'alias' && (
                <div className="space-y-3">
                  <h4 className="text-sm font-bold">Built-in scanner</h4>
                  <select
                    value={cBasedOn}
                    onChange={(e) => setCBasedOn(e.target.value)}
                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm"
                    required
                  >
                    <option value="">Select…</option>
                    {catalogNames.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-[var(--color-ink-soft)]">
                    Reuses detection logic from a catalog scanner under your custom name.
                  </p>
                </div>
              )}

              {detectMode === 'none' && (
                <div
                  className={
                    isSidebar || isStudio
                      ? 'text-sm text-[var(--color-ink-soft)]'
                      : 'flex h-full min-h-[200px] items-center justify-center text-sm text-[var(--color-ink-soft)]'
                  }
                >
                  Name-only pattern — no automatic scan. Use for manual tracking or starring.
                </div>
              )}
            </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-[var(--color-border)] pt-4">
            <button
              type="submit"
              disabled={
                (detectMode === 'script' && scriptErrors.length > 0) ||
                (detectMode === 'draw' && drawTools.length === 0)
              }
              className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-50"
            >
              {editingId ? 'Update pattern' : 'Save private pattern'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => resetForm()}
                className="rounded-lg border border-[var(--color-border)] px-5 py-2.5 text-sm font-semibold hover:bg-[var(--color-muted)]"
              >
                Cancel edit
              </button>
            )}
            {onCancel && !drawSaveMode && (
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg border border-[var(--color-border)] px-5 py-2.5 text-sm font-semibold hover:bg-[var(--color-muted)]"
              >
                Close
              </button>
            )}
          </div>
        </form>

        {customPatterns.length > 0 && (
          <div className="mt-8 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <h4 className="text-sm font-bold">Your saved patterns ({customPatterns.length})</h4>
            <ul className="mt-3 divide-y divide-[var(--color-border)]">
              {customPatterns.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm"
                >
                  <span>
                    <span className="font-semibold">{c.name}</span>
                    <span className="text-[var(--color-ink-soft)]"> · {c.bias}</span>
                    {c.drawnSpec?.tools?.length ? (
                      <span className="text-[var(--color-ink-soft)]"> · drawn</span>
                    ) : null}
                  </span>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => loadForEdit(c.id)}
                      className="rounded-lg p-1.5 text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/40"
                      title="Edit"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteCustom(c.id)}
                      className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
