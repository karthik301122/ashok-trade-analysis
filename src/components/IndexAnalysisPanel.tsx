import { useEffect, useMemo, useState } from 'react'
import {
  ASX_INDEX_ANALYSIS_UNIVERSE,
  ASX_RS_BENCHMARK,
  ASX_SECTOR_INDEXES,
  type AsxIndexDef,
} from '../data/asxIndexes'
import { PanelErrorBoundary } from './PanelErrorBoundary'

type IndexRow = {
  def: AsxIndexDef
  support20: number | null
  resistance20: number | null
  distSupport: number | null
  distResistance: number | null
  srStatus: string
  rs: number | null
  rsMom: number | null
  sectorScore: number | null
  error?: string
}

type ApiRow = {
  symbol: string
  code: string
  name: string
  kind: string
  error?: string | null
  support20: number | null
  resistance20: number | null
  distSupport: number | null
  distResistance: number | null
  srStatus: string | null
  rs: number | null
  rsMom: number | null
  sectorScore: number | null
}

function fmtNum(n: number | null, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function fmtPct(n: number | null, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(digits)}%`
}

function statusClass(status: string): string {
  if (status === 'Approaching Support') return 'text-teal-800 dark:text-teal-200'
  if (status === 'Approaching Resistance') return 'text-amber-800 dark:text-amber-200'
  return 'text-[var(--color-ink-soft)]'
}

function mapApiRows(apiRows: ApiRow[]): IndexRow[] {
  const bySymbol = new Map(apiRows.map((r) => [r.symbol, r]))
  return ASX_INDEX_ANALYSIS_UNIVERSE.map((def) => {
    const r = bySymbol.get(def.symbol)
    if (!r) {
      return {
        def,
        support20: null,
        resistance20: null,
        distSupport: null,
        distResistance: null,
        srStatus: '—',
        rs: null,
        rsMom: null,
        sectorScore: null,
        error: 'No series',
      }
    }
    return {
      def,
      support20: r.support20,
      resistance20: r.resistance20,
      distSupport: r.distSupport,
      distResistance: r.distResistance,
      srStatus: r.srStatus || (r.error ? String(r.error) : '—'),
      rs: r.rs,
      rsMom: r.rsMom,
      sectorScore: r.sectorScore,
      error: r.error || undefined,
    }
  })
}

function IndexAnalysisBody({ paused }: { paused: boolean }) {
  const [rows, setRows] = useState<IndexRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [loadedAt, setLoadedAt] = useState<number | null>(null)
  const [hint, setHint] = useState<string | null>(null)

  useEffect(() => {
    if (paused) return
    let cancelled = false
    setLoading(true)
    setErr(null)
    setHint(null)
    void (async () => {
      try {
        const res = await fetch('/api/index-analysis', { credentials: 'include' })
        const json = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) {
          setErr(json.error || `Could not load index analysis (${res.status})`)
          return
        }
        const apiRows = Array.isArray(json.rows) ? (json.rows as ApiRow[]) : []
        setRows(mapApiRows(apiRows))
        setLoadedAt(typeof json.asOf === 'number' ? json.asOf : Date.now())
        if (Number(json.missed) > 0) {
          setHint(
            `${json.missed} index(es) still warming from EODHD — refresh this tab in a minute.`,
          )
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed to load index analysis')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [paused])

  const marketRows = useMemo(() => rows.filter((r) => r.def.kind !== 'sector'), [rows])
  const sectorRows = useMemo(() => {
    return rows
      .filter((r) => r.def.kind === 'sector')
      .slice()
      .sort((a, b) => (b.sectorScore ?? -Infinity) - (a.sectorScore ?? -Infinity))
  }, [rows])

  const nearCount = rows.filter(
    (r) => r.srStatus === 'Approaching Support' || r.srStatus === 'Approaching Resistance',
  ).length

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold sm:text-2xl">
          Index Analysis
        </h1>
        <p className="max-w-3xl text-sm text-[var(--color-ink-soft)]">
          Weekly support &amp; resistance (20 weeks, within 3%) for ASX indexes, plus sector relative
          strength vs {ASX_RS_BENCHMARK.code} (20-week RS, 4-week momentum, SectorScore = 70% RS + 30%
          momentum).
        </p>
        <p className="text-xs text-[var(--color-ink-soft)]">
          {loading
            ? 'Loading weekly series on the server…'
            : `${rows.filter((r) => !r.error).length}/${ASX_INDEX_ANALYSIS_UNIVERSE.length} indexes · ${nearCount} near S/R${
                loadedAt ? ` · updated ${new Date(loadedAt).toLocaleTimeString()}` : ''
              }`}
        </p>
        {hint && <p className="text-xs text-amber-800 dark:text-amber-200">{hint}</p>}
      </header>

      {err && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          {err}
        </div>
      )}

      <section className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="text-sm font-semibold">Market indexes · weekly S/R</h2>
        </div>
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--color-muted)]/40 text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
            <tr>
              <th className="px-3 py-2 font-semibold">Index</th>
              <th className="px-3 py-2 font-semibold">Support20</th>
              <th className="px-3 py-2 font-semibold">Resistance20</th>
              <th className="px-3 py-2 font-semibold">Dist support</th>
              <th className="px-3 py-2 font-semibold">Dist resistance</th>
              <th className="px-3 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {(loading && !marketRows.length
              ? ASX_INDEX_ANALYSIS_UNIVERSE.filter((d) => d.kind !== 'sector')
              : marketRows
            ).map((rowOrDef) => {
              const isPlaceholder = !('def' in rowOrDef)
              const def = isPlaceholder ? (rowOrDef as AsxIndexDef) : rowOrDef.def
              const row = isPlaceholder ? null : rowOrDef
              return (
                <tr key={def.symbol} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-2">
                    <div className="font-medium">{def.code}</div>
                    <div className="text-xs text-[var(--color-ink-soft)]">{def.name}</div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{fmtNum(row?.support20 ?? null)}</td>
                  <td className="px-3 py-2 tabular-nums">{fmtNum(row?.resistance20 ?? null)}</td>
                  <td className="px-3 py-2 tabular-nums">{fmtPct(row?.distSupport ?? null)}</td>
                  <td className="px-3 py-2 tabular-nums">{fmtPct(row?.distResistance ?? null)}</td>
                  <td className={`px-3 py-2 font-medium ${statusClass(row?.srStatus ?? '—')}`}>
                    {row?.error || row?.srStatus || (loading ? '…' : '—')}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      <section className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="text-sm font-semibold">
            Sector indexes · RS vs {ASX_RS_BENCHMARK.code} (sorted by SectorScore)
          </h2>
        </div>
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--color-muted)]/40 text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
            <tr>
              <th className="px-3 py-2 font-semibold">#</th>
              <th className="px-3 py-2 font-semibold">Sector</th>
              <th className="px-3 py-2 font-semibold">Support20</th>
              <th className="px-3 py-2 font-semibold">Resistance20</th>
              <th className="px-3 py-2 font-semibold">S/R status</th>
              <th className="px-3 py-2 font-semibold">RS</th>
              <th className="px-3 py-2 font-semibold">RS mom</th>
              <th className="px-3 py-2 font-semibold">SectorScore</th>
            </tr>
          </thead>
          <tbody>
            {(loading && !sectorRows.length ? ASX_SECTOR_INDEXES : sectorRows).map((rowOrDef, i) => {
              const isPlaceholder = !('def' in rowOrDef)
              const def = isPlaceholder ? (rowOrDef as AsxIndexDef) : rowOrDef.def
              const row = isPlaceholder ? null : rowOrDef
              return (
                <tr key={def.symbol} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-2 tabular-nums text-[var(--color-ink-soft)]">
                    {isPlaceholder ? '—' : i + 1}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{def.code}</div>
                    <div className="text-xs text-[var(--color-ink-soft)]">{def.name}</div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{fmtNum(row?.support20 ?? null)}</td>
                  <td className="px-3 py-2 tabular-nums">{fmtNum(row?.resistance20 ?? null)}</td>
                  <td className={`px-3 py-2 font-medium ${statusClass(row?.srStatus ?? '—')}`}>
                    {row?.error || row?.srStatus || (loading ? '…' : '—')}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{fmtNum(row?.rs ?? null)}</td>
                  <td className="px-3 py-2 tabular-nums">{fmtNum(row?.rsMom ?? null)}</td>
                  <td className="px-3 py-2 tabular-nums font-semibold">
                    {fmtNum(row?.sectorScore ?? null)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
    </div>
  )
}

type Props = { visible?: boolean }

export function IndexAnalysisPanel({ visible = true }: Props) {
  return (
    <div hidden={!visible} aria-hidden={!visible} className="mx-auto max-w-[1400px] px-3 py-6 sm:px-4">
      <PanelErrorBoundary title="Index Analysis">
        <IndexAnalysisBody paused={!visible} />
      </PanelErrorBoundary>
    </div>
  )
}
