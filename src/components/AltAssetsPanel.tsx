import { useEffect, useMemo, useState } from 'react'
import { Copy } from 'lucide-react'
import type { AltAsset } from '../data/altAssets'
import { classifyCycle, classifyMood, CYCLE_LABEL, MOOD_LABEL, round1 } from '../lib/market'
import { formatPct, perfCellClass } from '../lib/format'
import { fetchDeskSeries, returnOver, sma, ema, type SeriesResult } from '../lib/deskSeries'
import { DebouncedSearchInput } from './DebouncedSearchInput'
import { Sparkline } from './Sparkline'

const PANEL_BUDGET_MS = 15_000
const PER_SYMBOL_MS = 4_000

type Row = AltAsset & {
  d1: number
  w1: number
  m1: number
  m3: number
  m6: number
  y1: number
  from52wHigh: number
  rs: number
  mood: 'bullish' | 'neutral' | 'bearish'
  cycle: 'early' | 'mid' | 'late' | 'recession'
  spark: number[]
  last: number
}

type Props = {
  title: string
  subtitle: string
  assets: AltAsset[]
  /** EODHD symbol used as relative-strength benchmark */
  benchmarkSymbol?: string
}

function toRow(asset: AltAsset, series: SeriesResult, benchM3: number): Row {
  const closes = series.closes.map((b) => b.c)
  const last = series.last
  const d1 = returnOver(series.closes, 1) ?? 0
  const w1 = returnOver(series.closes, 5) ?? 0
  const m1 = returnOver(series.closes, 21) ?? 0
  const m3 = returnOver(series.closes, 63) ?? 0
  const m6 = returnOver(series.closes, 126) ?? 0
  const y1 = returnOver(series.closes, 252) ?? 0
  const from52wHigh = series.high52 ? ((last - series.high52) / series.high52) * 100 : 0
  const ma50 = closes.length >= 50 ? sma(closes, 50) : null
  const above50ma = ma50 != null ? last > ma50 : false
  const ma200 = closes.length >= 200 ? sma(closes, 200) : null
  const above200ma = ma200 != null ? last > ma200 : false
  const e21 = closes.length >= 21 ? ema(closes, 21) : null
  const above21ema = e21 != null ? last > e21 : false
  const vs = m3 - benchM3
  const perf = {
    d1: round1(d1),
    w1: round1(w1),
    m1: round1(m1),
    m3: round1(m3),
    m6: round1(m6),
    y1: round1(y1),
    y5: round1(y1),
    from52wHigh: round1(from52wHigh),
    above200ma,
    above50ma,
    above21ema,
    above20ma: above21ema,
    rs: Math.round(Math.max(1, Math.min(99, 50 + vs * 2.2))),
    spark: (() => {
      const src = closes.slice(-24)
      const base = src[0] || last
      return src.map((c) => round1((c / base) * 100))
    })(),
  }
  return {
    ...asset,
    ...perf,
    mood: classifyMood(perf, vs),
    cycle: classifyCycle(perf, vs),
    last,
  }
}

function withBudget<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = window.setTimeout(() => resolve(null), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      () => {
        clearTimeout(t)
        resolve(null)
      },
    )
  })
}

export function AltAssetsPanel({ title, subtitle, assets, benchmarkSymbol = 'BTC-USD.CC' }: Props) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [partialNote, setPartialNote] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const started = Date.now()
    ;(async () => {
      setLoading(true)
      setError(null)
      setPartialNote(null)
      try {
        const bench = await withBudget(fetchDeskSeries(benchmarkSymbol), PER_SYMBOL_MS)
        const benchM3 = bench ? returnOver(bench.closes, 63) ?? 0 : 0
        const out: Row[] = []
        let missed = 0
        for (const asset of assets) {
          if (cancelled) return
          if (Date.now() - started >= PANEL_BUDGET_MS) {
            missed += assets.length - out.length - missed
            break
          }
          const series = await withBudget(fetchDeskSeries(asset.eodhd), PER_SYMBOL_MS)
          if (series) out.push(toRow(asset, series, benchM3))
          else missed += 1
        }
        if (cancelled) return
        out.sort((a, b) => b.m3 - a.m3)
        setRows(out)
        if (!out.length) {
          setError(
            'Live prices for this desk are temporarily unavailable — the ASX Markets desk is unaffected. Try again in a minute.',
          )
        } else if (missed > 0 || Date.now() - started >= PANEL_BUDGET_MS) {
          setPartialNote(
            `Showing ${out.length} of ${assets.length} — market data was busy; refresh to load more.`,
          )
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [assets, benchmarkSymbol])

  const groups = useMemo(() => [...new Set(assets.map((a) => a.group))], [assets])

  const filtered = useMemo(() => {
    let list = rows
    if (group) list = list.filter((r) => r.group === group)
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(
        (r) =>
          r.symbol.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          r.group.toLowerCase().includes(q),
      )
    }
    return list
  }, [rows, group, query])

  const copyAll = async () => {
    if (!filtered.length) return
    const text = filtered.map((r) => r.tradingView).join(',')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">{title}</h2>
        <p className="text-sm text-[var(--color-ink-soft)]">{subtitle}</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {groups.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGroup(group === g ? null : g)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase ${
              group === g
                ? 'border-sky-500 bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200'
                : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink-soft)]'
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DebouncedSearchInput
          value={query}
          onDebouncedChange={setQuery}
          placeholder="Search name or symbol..."
        />
        <button
          type="button"
          disabled={!filtered.length}
          onClick={() => void copyAll()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-teal-600 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800 disabled:opacity-50 dark:bg-teal-950/40 dark:text-teal-200"
        >
          <Copy size={13} />
          {copied ? 'Copied!' : filtered.length ? `Copy ${filtered.length} to TradingView` : 'Copy to TradingView'}
        </button>
      </div>

      {loading && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] px-4 py-6 text-center text-sm text-[var(--color-ink-soft)]">
          Loading prices (max {PANEL_BUDGET_MS / 1000}s)…
        </div>
      )}
      {error && !loading && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-50 px-4 py-4 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
          {error}
        </div>
      )}
      {partialNote && !loading && !error && (
        <div className="text-xs text-[var(--color-ink-soft)]">{partialNote}</div>
      )}

      {!loading && rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          <table className="min-w-[900px] w-full border-collapse text-left text-xs">
            <thead className="bg-[var(--color-muted)] text-[10px] uppercase tracking-wide text-[var(--color-ink-soft)]">
              <tr>
                {['Asset', 'Group', 'Last', 'Mood', 'Cycle', 'Trend', '1D', '1W', '1M', '3M', '6M', '1YR', '52W'].map(
                  (h) => (
                    <th key={h} className="whitespace-nowrap px-2 py-2.5 font-semibold">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.symbol} className="border-t border-[var(--color-border)]">
                  <td className="sticky left-0 z-[1] bg-[var(--color-surface)] px-2 py-2">
                    <div className="font-semibold">{r.name}</div>
                    <div className="text-[10px] text-[var(--color-ink-soft)]">
                      {r.symbol}
                    </div>
                  </td>
                  <td className="px-2">{r.group}</td>
                  <td className="px-2 tabular-nums font-medium">{r.last < 1 ? r.last.toPrecision(3) : r.last.toFixed(2)}</td>
                  <td className="px-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${MOOD_LABEL[r.mood].className}`}>
                      {MOOD_LABEL[r.mood].label}
                    </span>
                  </td>
                  <td className="px-2">
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
                      style={{ background: CYCLE_LABEL[r.cycle].color }}
                    >
                      {CYCLE_LABEL[r.cycle].short}
                    </span>
                  </td>
                  <td className="px-2">
                    <Sparkline values={r.spark} positive={r.m3 >= 0} />
                  </td>
                  {[r.d1, r.w1, r.m1, r.m3, r.m6, r.y1, r.from52wHigh].map((v, i) => (
                    <td key={i} className={`px-2 tabular-nums font-medium ${perfCellClass(v)}`}>
                      {formatPct(v)}
                    </td>
                  ))}
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={13} className="px-4 py-8 text-center text-[var(--color-ink-soft)]">
                    No matches
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
