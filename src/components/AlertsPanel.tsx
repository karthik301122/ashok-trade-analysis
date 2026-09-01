import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bell, Mail, Play, Plus, Trash2 } from 'lucide-react'
import { buildPatternAlertOptions } from '../lib/patterns/watchPatternAlertUpload'
import { fetchAuthMe, setAlertEmailOptIn, setPatternAlertIds } from '../lib/auth'
import { fetchDeskServerConfig } from '../lib/deskConfig'
import { usePatternPrefs } from './patterns/usePatternPrefs'

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

export function AlertsPanel() {
  const { prefs } = usePatternPrefs()
  const patternAlertOptions = useMemo(() => buildPatternAlertOptions(prefs), [prefs])
  const [rules, setRules] = useState<Rule[]>([])
  const [events, setEvents] = useState<EventRow[]>([])
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
  const [optInBusy, setOptInBusy] = useState(false)
  const [selectedPatternIds, setSelectedPatternIds] = useState<string[]>([])
  const [patternPrefsBusy, setPatternPrefsBusy] = useState(false)

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
    setSelectedPatternIds(Array.isArray(me.patternAlertIds) ? me.patternAlertIds : [])
  }, [])

  const visibleRules = useMemo(
    () => rules.filter((r) => !r.params?.auto),
    [rules],
  )

  const allPatternIds = useMemo(() => patternAlertOptions.map((p) => p.id), [patternAlertOptions])
  const allPatternsSelected =
    allPatternIds.length > 0 && allPatternIds.every((id) => selectedPatternIds.includes(id))

  const togglePatternId = (id: string) => {
    setSelectedPatternIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const selectAllPatterns = () => setSelectedPatternIds([...allPatternIds])
  const clearAllPatterns = () => setSelectedPatternIds([])

  const savePatternAlerts = async () => {
    setPatternPrefsBusy(true)
    setMsg(null)
    const res = await setPatternAlertIds(selectedPatternIds)
    if (res.ok) {
      setSelectedPatternIds(res.patternAlertIds)
      await refresh()
      setMsg(
        res.patternAlertIds.length
          ? `Watching ${res.patternAlertIds.length} pattern${res.patternAlertIds.length === 1 ? '' : 's'} for alerts (forming 60%+ and confirmed 85%+).`
          : 'Pattern alerts cleared — select patterns below to watch.',
      )
    } else {
      setMsg(res.error)
    }
    setPatternPrefsBusy(false)
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
    const res = await setAlertEmailOptIn(optIn)
    if (res.ok) {
      setAlertEmailOptInState(optIn)
      setMsg(optIn ? 'You will receive pattern alert emails at your login address.' : 'Pattern alert emails turned off.')
    } else {
      setMsg(res.error)
    }
    setOptInBusy(false)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">
            <Bell size={22} /> Alerts
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--color-ink-soft)]">
            Choose which patterns you want alerts for below (forming 60%+ and confirmed 85%+).
            Special Patterns (✦), starred chart patterns (★), and My Patterns are all available.
            Scores upload when Markets runs OHLC scans. RS / RVOL / breadth rules are separate
            custom rules at the bottom.
            {emailEnabled
              ? ' Opted-in users receive email for their selected patterns only.'
              : ' Email delivery is not configured on the server yet — alerts appear here only until SMTP env vars are set.'}
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
            <h2 className="text-sm font-bold">Patterns to watch</h2>
            <p className="mt-1 max-w-2xl text-xs text-[var(--color-ink-soft)]">
              {selectedPatternIds.length} of {patternAlertOptions.length} selected — alerts fire when
              a ticker matches forming or confirmed thresholds for these patterns.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={patternPrefsBusy || !patternAlertOptions.length}
              onClick={() => selectAllPatterns()}
              className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-semibold hover:bg-[var(--color-bg)] disabled:opacity-50"
            >
              Alert all patterns
            </button>
            <button
              type="button"
              disabled={patternPrefsBusy || !selectedPatternIds.length}
              onClick={() => clearAllPatterns()}
              className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-semibold hover:bg-[var(--color-bg)] disabled:opacity-50"
            >
              Clear all
            </button>
            <button
              type="button"
              disabled={patternPrefsBusy}
              onClick={() => void savePatternAlerts()}
              className="rounded-md bg-teal-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              Save pattern alerts
            </button>
          </div>
        </div>
        {!patternAlertOptions.length ? (
          <p className="mt-3 text-xs text-[var(--color-ink-soft)]">
            No patterns available yet — star chart patterns or add My Patterns on Markets, or use
            desk Special Patterns.
          </p>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {patternAlertOptions.map((p) => {
              const checked = selectedPatternIds.includes(p.id)
              return (
                <label
                  key={p.id}
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                    checked
                      ? 'border-teal-600 bg-teal-50/60 dark:bg-teal-950/30'
                      : 'border-[var(--color-border)]'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0"
                    checked={checked}
                    disabled={patternPrefsBusy}
                    onChange={() => togglePatternId(p.id)}
                  />
                  <span className="font-medium leading-snug">{p.label}</span>
                </label>
              )
            })}
          </div>
        )}
        {allPatternsSelected && patternAlertOptions.length > 0 && (
          <p className="mt-2 text-[10px] text-[var(--color-ink-soft)]">
            All patterns selected — you will receive alerts for every available pattern type.
          </p>
        )}
      </div>

      {canReceiveAlertEmail && (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <Mail size={16} /> Pattern alert emails
              </h2>
              <p className="mt-1 max-w-2xl text-xs text-[var(--color-ink-soft)]">
                Get an email when pattern alerts fire (forming or confirmed). We use your login
                email — no extra address needed.
                {!emailEnabled && ' Server SMTP is not set up yet; your preference is saved for when it is.'}
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
        </div>
      )}

      {msg && (
        <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm">
          {msg}
        </p>
      )}

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-bold">New rule</h2>
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
              <li className="text-xs text-[var(--color-ink-soft)]">
                No custom rules — pattern watches are managed above.
              </li>
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
