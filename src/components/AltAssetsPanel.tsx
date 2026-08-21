import { useEffect, useMemo, useState } from 'react'
import { Copy, Search } from 'lucide-react'
import type { AltAsset } from '../data/altAssets'
import { classifyCycle, classifyMood, CYCLE_LABEL, MOOD_LABEL, round1 } from '../lib/market'
import { formatPct, perfCellClass } from '../lib/format'
import { fetchYahooSeries, returnOver, sma, ema, type SeriesResult } from '../lib/yahoo'
import { Sparkline } from './Sparkline'

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
  benchmarkYahoo?: string
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

export function AltAssetsPanel({ title, subtitle, assets, benchmarkYahoo = 'BTC-USD' }: Props) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const bench = await fetchYahooSeries(benchmarkYahoo)
        const benchM3 = bench ? returnOver(bench.closes, 63) ?? 0 : 0
        const out: Row[] = []
        for (const asset of assets) {
          if (cancelled) return
          const series = await fetchYahooSeries(asset.yahoo)
          if (series) out.push(toRow(asset, series, benchM3))
        }
        if (!cancelled) {
          out.sort((a, b) => b.m3 - a.m3)
          setRows(out)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [assets, benchmarkYahoo])

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
        <div className="relative min-w-[200px] flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-soft)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or symbol..."
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-2 pl-9 pr-3 text-sm outline-none focus:border-teal-500"
          />
        </div>
        <button
          type="button"
          onClick={copyAll}
          className="inline-flex items-center gap-1.5 rounded-lg border border-teal-600 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800 dark:bg-teal-950/40 dark:text-teal-200"
        >
          <Copy size={13} />
          {copied ? 'Copied!' : 'Copy to TradingView'}
        </button>
      </div>

      {loading && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] px-4 py-6 text-center text-sm text-[var(--color-ink-soft)]">
          Loading live prices…
        </div>
      )}
      {error && <div className="text-sm text-rose-600">{error}</div>}

      {!loading && (
        <div className="overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
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
                  <td className="px-2 py-2">
                    <div className="font-semibold">{r.name}</div>
                    <div className="text-[10px] text-[var(--color-ink-soft)]">
                      {r.symbol} · {r.yahoo}
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
