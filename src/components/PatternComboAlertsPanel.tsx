import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Layers, Plus, Trash2 } from 'lucide-react'
import {
  fetchPatternComboAlerts,
  setPatternComboAlerts,
  type PatternComboAlertDto,
} from '../lib/auth'
import {
  comboPatternLabel,
  newComboId,
  normalizePatternCombos,
  splitPatternOptionsByTimeframe,
  validatePatternCombo,
  type PatternComboAlert,
  type PatternComboOp,
  type PatternComboTimeframe,
} from '../lib/patterns/patternComboAlerts'
import { buildPatternAlertOptions } from '../lib/patterns/watchPatternAlertUpload'
import { usePatternPrefs } from './patterns/usePatternPrefs'

type Props = {
  onMessage?: (msg: string | null) => void
}

export function PatternComboAlertsPanel({ onMessage }: Props) {
  const { prefs } = usePatternPrefs()
  const options = useMemo(() => buildPatternAlertOptions(prefs), [prefs])
  const { daily, weekly } = useMemo(
    () => splitPatternOptionsByTimeframe(options, prefs),
    [options, prefs],
  )

  const [combos, setCombos] = useState<PatternComboAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [saveBusy, setSaveBusy] = useState(false)

  const [name, setName] = useState('')
  const [op, setOp] = useState<PatternComboOp>('or')
  const [andTimeframe, setAndTimeframe] = useState<'daily' | 'weekly'>('daily')
  const [selected, setSelected] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      const res = await fetchPatternComboAlerts()
      if (cancelled) return
      if (res.ok) setCombos(normalizePatternCombos(res.combos as PatternComboAlert[]))
      else onMessage?.(res.error)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [onMessage])

  const pickerOptions = useMemo(() => {
    if (op === 'or') return { all: options, daily, weekly, mode: 'or' as const }
    return {
      all: andTimeframe === 'weekly' ? weekly : daily,
      daily,
      weekly,
      mode: 'and' as const,
    }
  }, [op, andTimeframe, options, daily, weekly])

  const toggleId = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const persist = async (next: PatternComboAlert[]) => {
    setSaveBusy(true)
    const res = await setPatternComboAlerts(next as PatternComboAlertDto[])
    setSaveBusy(false)
    if (!res.ok) {
      onMessage?.(res.error)
      return false
    }
    setCombos(normalizePatternCombos(res.combos as PatternComboAlert[]))
    onMessage?.(`Saved ${res.combos.length} pattern combo${res.combos.length === 1 ? '' : 's'}.`)
    return true
  }

  const addCombo = async (e: FormEvent) => {
    e.preventDefault()
    const timeframe: PatternComboTimeframe = op === 'or' ? 'mixed' : andTimeframe
    const draft: PatternComboAlert = {
      id: newComboId(),
      name: name.trim() || `Combo (${op.toUpperCase()})`,
      op,
      timeframe,
      patternIds: selected,
      enabled: true,
      minScore: 60,
    }
    const err = validatePatternCombo(draft)
    if (err) {
      onMessage?.(err)
      return
    }
    // For AND, ensure all selected ids match the timeframe
    if (op === 'and') {
      const allowed = new Set(pickerOptions.all.map((o) => o.id))
      if (draft.patternIds.some((id) => !allowed.has(id))) {
        onMessage?.('AND combos can only mix patterns from the same timeframe (daily or weekly).')
        return
      }
    }
    const next = normalizePatternCombos([...combos, draft])
    const ok = await persist(next)
    if (ok) {
      setName('')
      setSelected([])
    }
  }

  const removeCombo = async (id: string) => {
    await persist(combos.filter((c) => c.id !== id))
  }

  const toggleEnabled = async (id: string) => {
    await persist(
      combos.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)),
    )
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-ink-soft)]">
        Loading pattern combos…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
        <div className="flex items-start gap-2">
          <Layers size={18} className="mt-0.5 text-teal-700 dark:text-teal-300" />
          <div>
            <h2 className="text-sm font-bold">Pattern combos (AND / OR)</h2>
            <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
              <strong>OR</strong> — notify each stock where any selected pattern hits (daily and
              weekly allowed together). <strong>AND</strong> — notify only when every selected
              pattern hits the same stock; pick daily or weekly separately (mixing is rare).
            </p>
          </div>
        </div>

        {combos.length > 0 && (
          <ul className="mt-4 space-y-2">
            {combos.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-[var(--color-border)] px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold">{c.name}</span>
                    <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold uppercase text-teal-900 dark:bg-teal-950/40 dark:text-teal-100">
                      {c.op}
                    </span>
                    <span className="rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-ink-soft)]">
                      {c.timeframe}
                    </span>
                    {!c.enabled && (
                      <span className="text-[10px] font-semibold text-rose-600">Paused</span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {c.patternIds.map((pid) => (
                      <span
                        key={pid}
                        className="rounded border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] font-semibold"
                      >
                        {comboPatternLabel(pid, options)}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    disabled={saveBusy}
                    onClick={() => void toggleEnabled(c.id)}
                    className="rounded-md border border-[var(--color-border)] px-2 py-1 text-[10px] font-bold hover:bg-[var(--color-muted)]"
                  >
                    {c.enabled ? 'Pause' : 'Enable'}
                  </button>
                  <button
                    type="button"
                    disabled={saveBusy}
                    onClick={() => void removeCombo(c.id)}
                    className="rounded p-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    title="Delete combo"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form
        onSubmit={(e) => void addCombo(e)}
        className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm"
      >
        <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
          New combo
        </h3>

        <label className="mt-3 block space-y-1">
          <span className="text-[11px] font-semibold text-[var(--color-ink-soft)]">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Daily breakout cluster"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
            maxLength={80}
          />
        </label>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setOp('or')
              setSelected([])
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
              op === 'or'
                ? 'bg-teal-700 text-white'
                : 'border border-[var(--color-border)] text-[var(--color-ink-soft)]'
            }`}
          >
            OR — any pattern
          </button>
          <button
            type="button"
            onClick={() => {
              setOp('and')
              setSelected([])
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
              op === 'and'
                ? 'bg-teal-700 text-white'
                : 'border border-[var(--color-border)] text-[var(--color-ink-soft)]'
            }`}
          >
            AND — all patterns
          </button>
        </div>

        {op === 'and' && (
          <div className="mt-3 flex rounded-lg border border-[var(--color-border)] text-[10px] font-bold">
            <button
              type="button"
              onClick={() => {
                setAndTimeframe('daily')
                setSelected([])
              }}
              className={`flex-1 rounded-l-lg px-2.5 py-1.5 ${
                andTimeframe === 'daily'
                  ? 'bg-teal-700 text-white'
                  : 'bg-[var(--color-bg)] text-[var(--color-ink-soft)]'
              }`}
            >
              Daily patterns ({daily.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setAndTimeframe('weekly')
                setSelected([])
              }}
              className={`flex-1 rounded-r-lg px-2.5 py-1.5 ${
                andTimeframe === 'weekly'
                  ? 'bg-teal-700 text-white'
                  : 'bg-[var(--color-bg)] text-[var(--color-ink-soft)]'
              }`}
            >
              Weekly patterns ({weekly.length})
            </button>
          </div>
        )}

        {op === 'or' ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <PatternChecklist
              title={`Daily (${daily.length})`}
              options={daily}
              selected={selected}
              onToggle={toggleId}
            />
            <PatternChecklist
              title={`Weekly (${weekly.length})`}
              options={weekly}
              selected={selected}
              onToggle={toggleId}
            />
          </div>
        ) : (
          <div className="mt-3">
            <PatternChecklist
              title={andTimeframe === 'weekly' ? 'Weekly patterns' : 'Daily patterns'}
              options={pickerOptions.all}
              selected={selected}
              onToggle={toggleId}
            />
          </div>
        )}

        <p className="mt-2 text-[11px] text-[var(--color-ink-soft)]">
          {selected.length} selected · need at least 2
        </p>

        <button
          type="submit"
          disabled={saveBusy || selected.length < 2}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          <Plus size={14} />
          {saveBusy ? 'Saving…' : 'Add combo'}
        </button>
      </form>
    </div>
  )
}

function PatternChecklist({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string
  options: { id: string; label: string }[]
  selected: string[]
  onToggle: (id: string) => void
}) {
  return (
    <div className="max-h-56 overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-2">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
        {title}
      </div>
      {options.length === 0 ? (
        <p className="px-1 py-2 text-[11px] text-[var(--color-ink-soft)]">No patterns in this group.</p>
      ) : (
        <ul className="space-y-0.5">
          {options.map((o) => (
            <li key={o.id}>
              <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-xs hover:bg-[var(--color-muted)]">
                <input
                  type="checkbox"
                  checked={selected.includes(o.id)}
                  onChange={() => onToggle(o.id)}
                  className="mt-0.5"
                />
                <span>{o.label}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
