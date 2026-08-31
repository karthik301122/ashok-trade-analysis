import { useCallback, useEffect, useState } from 'react'
import { Bell, Play, Plus, Trash2 } from 'lucide-react'
import { SPECIAL_PATTERN_CATALOG } from '../lib/patterns/specialCatalog'

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

const PATTERN_ALERT_OPTIONS = SPECIAL_PATTERN_CATALOG.map((p) => ({
  id: p.id,
  label: `${p.name} (${p.kind})`,
}))

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
    label: 'Pattern confirmed (100%)',
    defaults: { patternId: 'landscape' },
    pattern: true,
  },
]

export function AlertsPanel() {
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

  const refresh = useCallback(async () => {
    const [r, e] = await Promise.all([
      fetch('/api/alerts/rules', { credentials: 'include' }).then((x) => x.json()),
      fetch('/api/alerts/events', { credentials: 'include' }).then((x) => x.json()),
    ])
    setRules(r.rules || [])
    setEvents(e.events || [])
  }, [])

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

  const addRule = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const t = TYPES.find((x) => x.id === type)
      const params: Record<string, number | string> = t?.pattern
        ? type === 'pattern_confirmed'
          ? { patternId }
          : { minScore: paramVal, patternId }
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">
            <Bell size={22} /> Alerts
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--color-ink-soft)]">
            Snapshot rules (RS, RVOL, breadth) need <code className="text-xs">npm run snapshot</code>.
            Pattern forming alerts use scores uploaded when Markets or Patterns runs OHLC scans
            (VCP, Launchpad, Landscape, Livermore, weekly Karthik, and snapshot desk rules). Open
            those views so scans run, then alerts fire at your threshold (e.g. 60% before a full
            hit).
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
              {PATTERN_ALERT_OPTIONS.map((p) => (
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
          <h2 className="mb-2 text-sm font-bold">Rules ({rules.length})</h2>
          <ul className="space-y-2">
            {rules.map((r) => (
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
            {!rules.length && (
              <li className="text-xs text-[var(--color-ink-soft)]">No rules yet.</li>
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
