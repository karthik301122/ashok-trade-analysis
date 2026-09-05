import { useMemo, useState } from 'react'
import { Copy, Star, Volume2 } from 'lucide-react'
import type { MarketSnapshot, Mood } from '../data/types'
import { CYCLE_LABEL, MOOD_LABEL } from '../lib/market'
import { formatPct, formatPrice, formatVolume, perfCellClass, resolveStockPrice } from '../lib/format'
import { matchesSectorFilters } from '../lib/sectorFilter'
import { copyTickersToTradingView } from '../lib/tradingview'
import { DebouncedSearchInput } from './DebouncedSearchInput'
import { MultiSelectDropdown } from './MultiSelectDropdown'
import { Sparkline } from './Sparkline'
import { StockChartModal } from './StockChartModal'

type Props = { snapshot: MarketSnapshot }
type SortKey = 'dollarVolume' | 'volume' | 'relativeVolume'

const LIMITS = [25, 50, 100, 200] as const

export function VolumeScan({ snapshot }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('dollarVolume')
  const [limit, setLimit] = useState<(typeof LIMITS)[number]>(50)
  const [sectorFilters, setSectorFilters] = useState<string[]>([])
  const [moodFilter, setMoodFilter] = useState<Mood | 'all'>('all')
  const [minRvol, setMinRvol] = useState(0)
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState(false)
  const [chartStock, setChartStock] = useState<{ ticker: string; name: string } | null>(null)

  const sectors = useMemo(
    () => [...new Set(snapshot.stocks.map((s) => s.sector))].sort(),
    [snapshot.stocks],
  )

  const ranked = useMemo(() => {
    let list = snapshot.stocks.filter((s) => (s.dollarVolume ?? 0) > 0 || (s.volume ?? 0) > 0)
    if (sectorFilters.length) list = list.filter((s) => matchesSectorFilters(s.sector, sectorFilters))
    if (moodFilter !== 'all') list = list.filter((s) => s.mood === moodFilter)
    if (minRvol > 0) list = list.filter((s) => (s.relativeVolume ?? 0) >= minRvol)
    if (query.trim()) {
      const q = query.toLowerCase().trim()
      list = list.filter(
        (s) =>
          s.ticker.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          s.industry.toLowerCase().includes(q),
      )
    }
    return [...list]
      .sort((a, b) => (b[sortKey] ?? 0) - (a[sortKey] ?? 0))
      .slice(0, limit)
  }, [snapshot.stocks, sortKey, limit, sectorFilters, moodFilter, minRvol, query])

  const totals = useMemo(() => {
    const dollar = ranked.reduce((a, s) => a + (s.dollarVolume ?? 0), 0)
    const shares = ranked.reduce((a, s) => a + (s.volume ?? 0), 0)
    const hot = ranked.filter((s) => (s.relativeVolume ?? 0) >= 1.5).length
    return { dollar, shares, hot }
  }, [ranked])

  const copyTop = async () => {
    const ok = await copyTickersToTradingView(ranked.map((s) => s.ticker))
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    }
  }

  const sortLabel =
    sortKey === 'dollarVolume'
      ? 'AUD turnover (price × volume)'
      : sortKey === 'volume'
        ? 'share volume'
        : 'relative volume vs 20-day avg'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-semibold">
            <Volume2 size={18} className="text-teal-700" />
            Highest volumes traded
          </h3>
          <p className="text-sm text-[var(--color-ink-soft)]">
            Rank ASX names by last-session {sortLabel}. Rel vol = today ÷ 20-day average.
          </p>
        </div>
        <button
          type="button"
          onClick={copyTop}
          className="inline-flex items-center gap-1.5 rounded-lg border border-teal-600 bg-teal-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-teal-800 dark:bg-teal-950/40 dark:text-teal-200"
        >
          <Copy size={13} />
          {copied ? 'Copied!' : `Copy top ${ranked.length} to TradingView`}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
            Combined turnover
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{formatVolume(totals.dollar, true)}</div>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
            Combined shares
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{formatVolume(totals.shares)}</div>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
            Unusual (≥1.5× avg)
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-300">
            {totals.hot}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase text-[var(--color-ink-soft)]">Rank by</span>
        {(
          [
            ['dollarVolume', 'AUD $ volume'],
            ['volume', 'Share volume'],
            ['relativeVolume', 'Rel. volume'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSortKey(id)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase ${
              sortKey === id
                ? 'border-teal-600 bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-200'
                : 'border-[var(--color-border)] bg-[var(--color-surface)]'
            }`}
          >
            {label}
          </button>
        ))}

        <span className="ml-2 text-xs font-semibold uppercase text-[var(--color-ink-soft)]">Show</span>
        {LIMITS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setLimit(n)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
              limit === n
                ? 'border-teal-600 bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-200'
                : 'border-[var(--color-border)]'
            }`}
          >
            Top {n}
          </button>
        ))}

        <span className="ml-2 text-xs font-semibold uppercase text-[var(--color-ink-soft)]">Min RVOL</span>
        {([0, 1.5, 2, 3] as const).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setMinRvol(n)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
              minRvol === n
                ? 'border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
                : 'border-[var(--color-border)]'
            }`}
          >
            {n === 0 ? 'Any' : `${n}×`}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DebouncedSearchInput
          value={query}
          onDebouncedChange={setQuery}
          placeholder="Search ticker, name, industry…"
        />
        <MultiSelectDropdown
          options={sectors}
          value={sectorFilters}
          onChange={setSectorFilters}
          emptyLabel="All sectors"
          title="Filter by sector (multi-select)"
        />
        <select
          value={moodFilter}
          onChange={(e) => setMoodFilter(e.target.value as Mood | 'all')}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)]"
        >
          <option value="all">All moods</option>
          <option value="bullish">Bullish</option>
          <option value="neutral">Neutral</option>
          <option value="bearish">Bearish</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)]/50 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
              <th className="px-3 py-2.5">#</th>
              <th className="px-3 py-2.5">Stock</th>
              <th className="px-3 py-2.5 text-right">Price</th>
              <th className="px-3 py-2.5">Mood</th>
              <th className="px-3 py-2.5">Cycle</th>
              <th className="px-3 py-2.5 text-right">$ Volume</th>
              <th className="px-3 py-2.5 text-right">Shares</th>
              <th className="px-3 py-2.5 text-right">Avg 20d</th>
              <th className="px-3 py-2.5 text-right">RVOL</th>
              <th className="px-3 py-2.5">Spark</th>
              <th className="px-3 py-2.5 text-right">1D</th>
              <th className="px-3 py-2.5 text-right">1W</th>
              <th className="px-3 py-2.5 text-right">1M</th>
              <th className="px-3 py-2.5 text-right">3M</th>
            </tr>
          </thead>
          <tbody>
            {ranked.length === 0 && (
              <tr>
                <td colSpan={14} className="px-3 py-8 text-center text-[var(--color-ink-soft)]">
                  No stocks match — try lowering Min RVOL or wait for live volume to finish loading.
                </td>
              </tr>
            )}
            {ranked.map((s, idx) => {
              const mood = MOOD_LABEL[s.mood]
              const cycle = CYCLE_LABEL[s.cycle]
              const hot = (s.relativeVolume ?? 0) >= 1.5
              return (
                <tr
                  key={s.ticker}
                  className="border-t border-[var(--color-border)]/70 hover:bg-[var(--color-muted)]/50"
                >
                  <td className="px-3 py-2 tabular-nums text-[var(--color-ink-soft)]">{idx + 1}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      {s.star && <Star size={12} className="fill-amber-400 text-amber-400" />}
                      <button
                        type="button"
                        onClick={() => setChartStock({ ticker: s.ticker, name: s.name })}
                        className="font-semibold uppercase text-sky-700 underline-offset-2 hover:underline dark:text-sky-300"
                        title={`Open ${s.ticker} TradingView chart`}
                      >
                        {s.ticker}
                      </button>
                      <button
                        type="button"
                        onClick={() => setChartStock({ ticker: s.ticker, name: s.name })}
                        className="truncate text-[var(--color-ink-soft)] hover:text-sky-600"
                        title={`Open ${s.ticker} TradingView chart`}
                      >
                        {s.name}
                      </button>
                    </div>
                    <div className="text-[10px] text-[var(--color-ink-soft)]">
                      {s.industry} · {s.sector}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">
                    {formatPrice(resolveStockPrice(s) ?? 0)}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${mood.className}`}>
                      {mood.label}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
                      style={{ background: cycle.color }}
                    >
                      {cycle.short}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {formatVolume(s.dollarVolume ?? 0, true)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatVolume(s.volume ?? 0)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--color-ink-soft)]">
                    {formatVolume(s.avgVolume20 ?? 0)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-bold tabular-nums ${
                      hot ? 'text-amber-700 dark:text-amber-300' : ''
                    }`}
                  >
                    {(s.relativeVolume ?? 0).toFixed(1)}×
                  </td>
                  <td className="px-3 py-2">
                    <Sparkline values={s.spark} positive={s.m3 >= 0} />
                  </td>
                  {[s.d1, s.w1, s.m1, s.m3].map((v, i) => (
                    <td key={i} className={`px-3 py-2 text-right tabular-nums font-medium ${perfCellClass(v)}`}>
                      {formatPct(v)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {chartStock && (
        <StockChartModal
          ticker={chartStock.ticker}
          name={chartStock.name}
          onClose={() => setChartStock(null)}
        />
      )}
    </div>
  )
}
