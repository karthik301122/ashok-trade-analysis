import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bell, Mail, Play, Plus, Search, Trash2 } from 'lucide-react'
import type { MarketSnapshot } from '../data/types'
import { buildPatternAlertOptions } from '../lib/patterns/watchPatternAlertUpload'
import type { PatternAlertWatch } from '../lib/patterns/patternAlertWatches'
import { normalizePatternAlertWatches } from '../lib/patterns/patternAlertWatches'
import {
  fetchAuthMe,
  setAlertEmailMinScore,
  setAlertEmailOptIn,
  setPatternAlertWatches,
  type PatternAlertWatch as AuthPatternAlertWatch,
} from '../lib/auth'
import { fetchDeskServerConfig } from '../lib/deskConfig'
import {
  fetchPatternScanState,
  type PatternScanStateRow,
} from '../lib/patternScanApi'
import { usePatternPrefs } from './patterns/usePatternPrefs'

/** Show hit % in the Alerts UI at or above this (email uses a separate user threshold). */
const UI_HIT_MIN_SCORE = 60

type Rule = {
  id: number
  name: string
  type: string
  params: Record<string, number | string>
  webhookUrl: string | null
  enabled: boolean
}

type EventRow = {
  id: number
  ruleName: string
  ticker: string | null
  message: string
  createdAt: number
  delivered: boolean
}

const TYPES: {
  id: string
  label: string
  defaults: Record<string, number | string>
  pattern?: boolean
}[] = [
  { id: 'rs_min', label: 'RS ≥ threshold', defaults: { minRs: 70 } },
  { id: 'rvol_min', label: 'RVOL ≥ threshold', defaults: { minRvol: 2 } },
  { id: 'm3_outperform', label: '3M excess vs index', defaults: { minExcess: 8 } },
  { id: 'breadth_above20', label: 'Breadth % above 20 SMA', defaults: { minPct: 60 } },
  {
    id: 'pattern_forming',
    label: 'Pattern forming (score %)',
    defaults: { minScore: 60, patternId: 'landscape' },
    pattern: true,
  },
  {
    id: 'pattern_confirmed',
    label: 'Pattern confirmed (85%+)',
    defaults: { patternId: 'landscape' },
    pattern: true,
  },
]

type Props = {
  snapshot: MarketSnapshot
  watches?: PatternAlertWatch[]
  onWatchesChange?: (watches: PatternAlertWatch[]) => void
}

function patternLabel(id: string, options: ReturnType<typeof buildPatternAlertOptions>) {
  return options.find((o) => o.id === id)?.label ?? id
}

function scoreMapFromRows(rows: PatternScanStateRow[]): Map<string, PatternScanStateRow> {
  const m = new Map<string, PatternScanStateRow>()
  for (const r of rows) m.set(r.patternId, r)
  return m
}

function shouldShowHitBadge(row: PatternScanStateRow | undefined): boolean {
  if (!row) return false
  return row.confirmed || row.score >= UI_HIT_MIN_SCORE
}

function HitBadge({ row }: { row: PatternScanStateRow }) {
  const pct = Math.round(row.score)
  const confirmed = row.confirmed || pct >= 85
  return (
    <span
      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
        confirmed
          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
          : 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100'
      }`}
      title={confirmed ? 'Confirmed / hit' : 'Forming'}
    >
      {confirmed && pct < 100 ? 'Hit · ' : ''}
      {pct}%
    </span>
  )
}

export function AlertsPanel({ snapshot, watches: watchesProp, onWatchesChange }: Props) {
  const { prefs } = usePatternPrefs()
  const patternAlertOptions = useMemo(() => buildPatternAlertOptions(prefs), [prefs])
  const [rules, setRules] = useState<Rule[]>([])
  const [events, setEvents] = useState<EventRow[]>([])
  const [watches, setWatches] = useState<PatternAlertWatch[]>(watchesProp ?? [])
  const [stockQuery, setStockQuery] = useState('')
  const [pickTicker, setPickTicker] = useState<string | null>(null)
  const [draftPatternIds, setDraftPatternIds] = useState<string[]>([])
  const [name, setName] = useState('High RS leaders')
  const [type, setType] = useState('rs_min')
  const [paramKey, setParamKey] = useState('minRs')
  const [paramVal, setParamVal] = useState(70)
  const [patternId, setPatternId] = useState('landscape')
  const [webhook, setWebhook] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [emailEnabled, setEmailEnabled] = useState(false)
  const [canReceiveAlertEmail, setCanReceiveAlertEmail] = useState(false)
  const [alertEmailOptIn, setAlertEmailOptInState] = useState(false)
  const [alertEmailMinScore, setAlertEmailMinScoreState] = useState(80)
  const [optInBusy, setOptInBusy] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)
  const [pickScores, setPickScores] = useState<Map<string, PatternScanStateRow>>(new Map())
  const [watchScores, setWatchScores] = useState<Record<string, Map<string, PatternScanStateRow>>>({})
  const [scoresBusy, setScoresBusy] = useState(false)

  useEffect(() => {
    if (watchesProp) setWatches(watchesProp)
  }, [watchesProp])

  const refresh = useCallback(async () => {
    const [r, e, cfg, me] = await Promise.all([
      fetch('/api/alerts/rules', { credentials: 'include' }).then((x) => x.json()),
      fetch('/api/alerts/events', { credentials: 'include' }).then((x) => x.json()),
      fetchDeskServerConfig(),
      fetchAuthMe(),
    ])
    setRules(r.rules || [])
    setEvents(e.events || [])
    setEmailEnabled(Boolean(cfg.alertEmailEnabled))
    setCanReceiveAlertEmail(Boolean(me.canReceiveAlertEmail))
    setAlertEmailOptInState(Boolean(me.alertEmailOptIn))
    setAlertEmailMinScoreState(me.alertEmailMinScore ?? 80)
    const loaded = me.patternAlertWatches ?? []
    setWatches(loaded)
    onWatchesChange?.(loaded)
  }, [onWatchesChange])

  useEffect(() => {
    if (!pickTicker) {
      setPickScores(new Map())
      return
    }
    let cancelled = false
    setScoresBusy(true)
    void fetchPatternScanState(pickTicker, 0).then((rows) => {
      if (cancelled) return
      setPickScores(scoreMapFromRows(rows))
      setScoresBusy(false)
    })
    return () => {
      cancelled = true
    }
  }, [pickTicker])

  useEffect(() => {
    if (!watches.length) {
      setWatchScores({})
      return
    }
    let cancelled = false
    void Promise.all(
      watches.map(async (w) => {
        const rows = await fetchPatternScanState(w.ticker, 0)
        return [w.ticker, scoreMapFromRows(rows)] as const
      }),
    ).then((entries) => {
      if (cancelled) return
      const next: Record<string, Map<string, PatternScanStateRow>> = {}
      for (const [ticker, map] of entries) next[ticker] = map
      setWatchScores(next)
    })
    return () => {
      cancelled = true
    }
  }, [watches])

  const visibleRules = useMemo(
    () => rules.filter((r) => !r.params?.auto),
    [rules],
  )

  const stockMatches = useMemo(() => {
    const q = stockQuery.trim().toLowerCase()
    if (!q) return []
    return snapshot.stocks
      .filter(
        (s) =>
          s.ticker.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q),
      )
      .slice(0, 12)
  }, [snapshot.stocks, stockQuery])

  const pickStock = (ticker: string) => {
    const t = ticker.toUpperCase()
    setPickTicker(t)
    setStockQuery(t)
    const existing = watches.find((w) => w.ticker === t)
    setDraftPatternIds(existing?.patternIds ?? [])
  }

  const toggleDraftPattern = (id: string) => {
    setDraftPatternIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const addOrUpdateWatch = () => {
    if (!pickTicker || !draftPatternIds.length) return
    const ticker = pickTicker.toUpperCase()
    const next = normalizePatternAlertWatches([
      ...watches.filter((w) => w.ticker !== ticker),
      { ticker, patternIds: draftPatternIds },
    ])
    setWatches(next)
    setMsg(null)
  }

  const removeWatch = (ticker: string) => {
    setWatches((prev) => prev.filter((w) => w.ticker !== ticker))
  }

  const saveWatches = async () => {
    setSaveBusy(true)
    setMsg(null)
    const normalized = normalizePatternAlertWatches(watches)
    const res = await setPatternAlertWatches(normalized as AuthPatternAlertWatch[])
    if (res.ok) {
      setWatches(res.patternAlertWatches)
      onWatchesChange?.(res.patternAlertWatches)
      await refresh()
      setMsg(
        res.patternAlertWatches.length
          ? `Saved ${res.patternAlertWatches.length} stock alert${res.patternAlertWatches.length === 1 ? '' : 's'}.`
          : 'All stock pattern alerts cleared.',
      )
    } else {
      setMsg(res.error)
    }
    setSaveBusy(false)
  }

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const t = TYPES.find((x) => x.id === type)
    if (!t) return
    const key = Object.keys(t.defaults)[0]
    setParamKey(key)
    const val = t.defaults[key]
    setParamVal(typeof val === 'number' ? val : 60)
    if (t.pattern) {
      const pid = t.defaults.patternId
      if (typeof pid === 'string') setPatternId(pid)
    }
  }, [type])

  useEffect(() => {
    if (!patternAlertOptions.some((o) => o.id === patternId) && patternAlertOptions.length) {
      setPatternId(patternAlertOptions[0].id)
    }
  }, [patternAlertOptions, patternId])

  const selectedPattern = patternAlertOptions.find((o) => o.id === patternId)

  const addRule = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const t = TYPES.find((x) => x.id === type)
      const params: Record<string, number | string> = t?.pattern
        ? type === 'pattern_confirmed'
          ? {
              patternId,
              patternLabel: selectedPattern?.patternLabel ?? patternId,
            }
          : {
              minScore: paramVal,
              patternId,
              patternLabel: selectedPattern?.patternLabel ?? patternId,
            }
        : { [paramKey]: paramVal }
      await fetch('/api/alerts/rules', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          type,
          params,
          webhookUrl: webhook.trim() || null,
        }),
      })
      await refresh()
      setMsg('Rule saved')
    } catch {
      setMsg('Failed to save rule')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: number) => {
    await fetch(`/api/alerts/rules/${id}`, { method: 'DELETE', credentials: 'include' })
    await refresh()
  }

  const run = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/alerts/evaluate', {
        method: 'POST',
        credentials: 'include',
      })
      const json = await res.json()
      if (json.error) setMsg(json.error)
      else setMsg(`Evaluated — ${json.fired?.length ?? 0} fires (max 25/rule, 24h dedup/ticker)`)
      await refresh()
    } catch {
      setMsg('Evaluate failed')
    } finally {
      setBusy(false)
    }
  }

  const selectedType = TYPES.find((x) => x.id === type)

  const toggleEmailOptIn = async (optIn: boolean) => {
    setOptInBusy(true)
    setMsg(null)
    const res = await setAlertEmailOptIn(optIn, alertEmailMinScore)
    if (res.ok) {
      setAlertEmailOptInState(optIn)
      if (res.alertEmailMinScore != null) setAlertEmailMinScoreState(res.alertEmailMinScore)
      setMsg(
        optIn
          ? `Email on — one mail per stock/pattern when score ≥ ${alertEmailMinScore}%.`
          : 'Pattern alert emails turned off.',
      )
    } else {
      setMsg(res.error)
    }
    setOptInBusy(false)
  }

  const saveEmailMinScore = async (raw: number) => {
    const next = Math.max(60, Math.min(100, Math.round(raw)))
    setAlertEmailMinScoreState(next)
    setOptInBusy(true)
    setMsg(null)
    const res = await setAlertEmailMinScore(next)
    if (res.ok) {
      setAlertEmailMinScoreState(res.alertEmailMinScore)
      setMsg(`Email threshold saved: ≥ ${res.alertEmailMinScore}% (one email per qualifying hit).`)
    } else {
      setMsg(res.error)
    }
    setOptInBusy(false)
  }

  const totalPatterns = watches.reduce((n, w) => n + w.patternIds.length, 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">
            <Bell size={22} /> Alerts
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--color-ink-soft)]">
            Pick a stock and choose patterns to watch. The UI shows hit % when a pattern is ≥{UI_HIT_MIN_SCORE}%
            or already hit. Emails use your separate threshold (default 80%) — one email per stock/pattern
            that crosses it, not a once-a-day digest.
            {!emailEnabled && ' SMTP is not set up yet; events still show here.'}
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-teal-600 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-900 disabled:opacity-50 dark:bg-teal-950/40 dark:text-teal-100"
        >
          <Play size={14} />
          Run now
        </button>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold">Stock pattern alerts</h2>
            <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
              {watches.length} stock{watches.length === 1 ? '' : 's'} · {totalPatterns} pattern
              subscription{totalPatterns === 1 ? '' : 's'}
            </p>
          </div>
          <button
            type="button"
            disabled={saveBusy}
            onClick={() => void saveWatches()}
            className="rounded-md bg-teal-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
          >
            Save alerts
          </button>
        </div>

        {watches.length > 0 && (
          <ul className="mt-4 space-y-3">
            {watches.map((w) => (
              <li
                key={w.ticker}
                className="rounded-xl border border-[var(--color-border)] px-3 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-mono text-sm font-bold">{w.ticker}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {w.patternIds.map((pid) => {
                        const row = watchScores[w.ticker]?.get(pid)
                        return (
                          <span
                            key={pid}
                            className="inline-flex items-center gap-1 rounded border border-teal-500/40 bg-teal-50/80 px-2 py-0.5 text-[10px] font-semibold text-teal-900 dark:bg-teal-950/40 dark:text-teal-100"
                          >
                            {patternLabel(pid, patternAlertOptions)}
                            {shouldShowHitBadge(row) && row ? <HitBadge row={row} /> : null}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeWatch(w.ticker)}
                    className="rounded p-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    title="Remove stock"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 rounded-xl border border-dashed border-[var(--color-border)] p-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
            Add stock alert
          </h3>
          <div className="mt-2 relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-2.5 text-[var(--color-ink-soft)]"
            />
            <input
              value={stockQuery}
              onChange={(e) => {
                setStockQuery(e.target.value)
                if (!e.target.value.trim()) setPickTicker(null)
              }}
              placeholder="Search ticker or company name…"
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] py-2 pl-8 pr-3 text-sm"
            />
            {stockQuery.trim() && stockMatches.length > 0 && !pickTicker && (
              <ul className="absolute z-10 mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg">
                {stockMatches.map((s) => (
                  <li key={s.ticker}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--color-muted)]"
                      onClick={() => pickStock(s.ticker)}
                    >
                      <span className="font-mono font-bold">{s.ticker}</span>
                      <span className="truncate text-xs text-[var(--color-ink-soft)]">{s.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {pickTicker && (
            <>
              <p className="mt-3 text-xs font-semibold">
                Patterns for <span className="font-mono">{pickTicker}</span>
                {scoresBusy ? (
                  <span className="ml-2 font-normal text-[var(--color-ink-soft)]">Loading hit %…</span>
                ) : (
                  <span className="ml-2 font-normal text-[var(--color-ink-soft)]">
                    Hit % shown when ≥{UI_HIT_MIN_SCORE}% or already hit (UI only)
                  </span>
                )}
              </p>
              {!patternAlertOptions.length ? (
                <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
                  No patterns available — star chart patterns or add My Patterns on Markets.
                </p>
              ) : (
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {patternAlertOptions.map((p) => {
                    const checked = draftPatternIds.includes(p.id)
                    const row = pickScores.get(p.id)
                    const showHit = shouldShowHitBadge(row)
                    return (
                      <label
                        key={p.id}
                        className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                          checked
                            ? 'border-teal-600 bg-teal-50/60 dark:bg-teal-950/30'
                            : showHit
                              ? 'border-amber-500/50 bg-amber-50/40 dark:bg-amber-950/20'
                              : 'border-[var(--color-border)]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 shrink-0"
                          checked={checked}
                          onChange={() => toggleDraftPattern(p.id)}
                        />
                        <span className="flex min-w-0 flex-1 items-start justify-between gap-2">
                          <span className="font-medium leading-snug">{p.label}</span>
                          {showHit && row ? <HitBadge row={row} /> : null}
                        </span>
                      </label>
                    )
                  })}
                </div>
              )}
              <button
                type="button"
                disabled={!draftPatternIds.length}
                onClick={addOrUpdateWatch}
                className="mt-3 inline-flex items-center gap-1 rounded-md border border-teal-600 bg-teal-50 px-3 py-1.5 text-xs font-bold text-teal-900 disabled:opacity-50 dark:bg-teal-950/40 dark:text-teal-100"
              >
                <Plus size={14} />
                {watches.some((w) => w.ticker === pickTicker) ? 'Update' : 'Add'} {pickTicker} to list
              </button>
            </>
          )}
        </div>
      </div>

      {canReceiveAlertEmail && (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <Mail size={16} /> Pattern alert emails
              </h2>
              <p className="mt-1 max-w-2xl text-xs text-[var(--color-ink-soft)]">
                One email per stock/pattern when its score reaches your threshold (not a daily digest).
                We use your login email. UI hit % (≥{UI_HIT_MIN_SCORE}%) is separate from this email cutoff.
                {!emailEnabled && ' Server SMTP is not set up yet; preference is saved for when it is.'}
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-[var(--color-border)]"
                checked={alertEmailOptIn}
                disabled={optInBusy}
                onChange={(e) => void toggleEmailOptIn(e.target.checked)}
              />
              Email me when alerts fire
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-3">
            <label className="text-xs font-semibold text-[var(--color-ink-soft)]" htmlFor="alert-email-min">
              Email when score ≥
            </label>
            <input
              id="alert-email-min"
              type="number"
              min={60}
              max={100}
              step={1}
              value={alertEmailMinScore}
              disabled={optInBusy}
              onChange={(e) => setAlertEmailMinScoreState(Number(e.target.value))}
              onBlur={(e) => void saveEmailMinScore(Number(e.target.value))}
              className="w-20 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm font-bold tabular-nums"
            />
            <span className="text-xs text-[var(--color-ink-soft)]">% (default 80, min 60)</span>
            <button
              type="button"
              disabled={optInBusy}
              onClick={() => void saveEmailMinScore(alertEmailMinScore)}
              className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-bold hover:bg-[var(--color-muted)] disabled:opacity-50"
            >
              Save threshold
            </button>
          </div>
        </div>
      )}

      {msg && (
        <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm">
          {msg}
        </p>
      )}

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-bold">New rule (market-wide)</h2>
        <p className="mb-3 text-xs text-[var(--color-ink-soft)]">
          Optional RS / RVOL / breadth rules across the whole market — separate from per-stock pattern watches above.
        </p>
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
          >
            {TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          {selectedType?.pattern ? (
            <select
              value={patternId}
              onChange={(e) => setPatternId(e.target.value)}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
            >
              {patternAlertOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="number"
              value={paramVal}
              onChange={(e) => setParamVal(Number(e.target.value))}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
              title={paramKey}
            />
          )}
          {selectedType?.pattern && type === 'pattern_forming' && (
            <input
              type="number"
              value={paramVal}
              onChange={(e) => setParamVal(Number(e.target.value))}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
              title="Min forming score %"
              min={1}
              max={99}
            />
          )}
          <input
            value={webhook}
            onChange={(e) => setWebhook(e.target.value)}
            placeholder="Webhook URL (optional)"
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm md:col-span-2 lg:col-span-1"
          />
        </div>
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={() => void addRule()}
          className="mt-3 inline-flex items-center gap-1 rounded-md bg-teal-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
        >
          <Plus size={14} /> Add rule
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="mb-2 text-sm font-bold">Rules ({visibleRules.length})</h2>
          <ul className="space-y-2">
            {visibleRules.map((r) => (
              <li
                key={r.id}
                className="flex items-start justify-between gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-semibold">{r.name}</div>
                  <div className="text-xs text-[var(--color-ink-soft)]">
                    {r.type} · {JSON.stringify(r.params)}
                    {r.webhookUrl ? ' · webhook' : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void remove(r.id)}
                  className="rounded p-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
            {!visibleRules.length && (
              <li className="text-xs text-[var(--color-ink-soft)]">No custom market-wide rules.</li>
            )}
          </ul>
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="mb-2 text-sm font-bold">Recent events</h2>
          <ul className="max-h-80 space-y-2 overflow-auto">
            {events.map((e) => (
              <li key={e.id} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs">
                <div className="font-semibold">
                  {e.ruleName}
                  {e.ticker ? ` · ${e.ticker}` : ''}
                  {e.delivered ? ' · delivered' : ''}
                </div>
                <div className="text-[var(--color-ink-soft)]">{e.message}</div>
                <div className="text-[10px] text-[var(--color-ink-soft)]">
                  {new Date(e.createdAt).toLocaleString()}
                </div>
              </li>
            ))}
            {!events.length && (
              <li className="text-xs text-[var(--color-ink-soft)]">No events yet — click Run now.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  )
}
