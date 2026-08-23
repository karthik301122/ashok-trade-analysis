import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Copy, Search, Star } from 'lucide-react'
import type { IndustryMetrics, MarketSnapshot, Mood } from '../data/types'
import { CYCLE_LABEL, MOOD_LABEL } from '../lib/market'
import { formatPct, formatVsIndex, perfCellClass } from '../lib/format'
import { copyTickersToTradingView } from '../lib/tradingview'
import { Sparkline } from './Sparkline'

type Props = { snapshot: MarketSnapshot }

export function SectorTable({ snapshot }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [sectorFilter, setSectorFilter] = useState<string | null>(null)
  const [moodFilter, setMoodFilter] = useState<Mood | 'all'>('all')
  const [starOnly, setStarOnly] = useState(false)
  const [query, setQuery] = useState('')
  const [stocksOnly, setStocksOnly] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copiedStars, setCopiedStars] = useState(false)
  const [copiedSectorStars, setCopiedSectorStars] = useState<string | null>(null)
  const [copiedIndustry, setCopiedIndustry] = useState<string | null>(null)

  const starCount = useMemo(
    () => snapshot.stocks.filter((s) => s.star).length,
    [snapshot.stocks],
  )

  const sectorStarCounts = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const s of snapshot.stocks) {
      if (!s.star) continue
      const list = map.get(s.sector) ?? []
      list.push(s.ticker)
      map.set(s.sector, list)
    }
    return map
  }, [snapshot.stocks])

  const sectors = snapshot.sectors
  const industries = useMemo(() => {
    let list = snapshot.industries
    if (sectorFilter) list = list.filter((i) => i.sector === sectorFilter)
    if (moodFilter !== 'all') list = list.filter((i) => i.mood === moodFilter)
    if (starOnly) {
      list = list
        .map((i) => ({ ...i, stocks: i.stocks.filter((s) => s.star) }))
        .filter((i) => i.stocks.length > 0)
    }
    if (query.trim()) {
      const q = query.toLowerCase().trim()
      list = list
        .map((i) => {
          const industryHit = i.name.toLowerCase().includes(q) || i.sector.toLowerCase().includes(q)
          const matchedStocks = i.stocks.filter(
            (s) => s.ticker.toLowerCase().includes(q) || s.name.toLowerCase().includes(q),
          )
          if (industryHit) return i
          if (matchedStocks.length) return { ...i, stocks: matchedStocks }
          return null
        })
        .filter((i): i is IndustryMetrics => i != null)
    }
    return list
  }, [snapshot.industries, sectorFilter, moodFilter, starOnly, query])

  const searching = query.trim().length > 0

  const toggle = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const expandAll = () => {
    setExpanded(new Set(industries.map((i) => i.name)))
  }

  const copyAll = async () => {
    const tickers = industries.flatMap((i) => i.stocks.map((s) => s.ticker))
    const ok = await copyTickersToTradingView([...new Set(tickers)])
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    }
  }

  const copyStars = async () => {
    const tickers = snapshot.stocks.filter((s) => s.star).map((s) => s.ticker)
    const ok = await copyTickersToTradingView(tickers)
    if (ok) {
      setCopiedStars(true)
      setTimeout(() => setCopiedStars(false), 1600)
    }
  }

  const copySectorStars = async (sectorName: string) => {
    const tickers = sectorStarCounts.get(sectorName) ?? []
    if (!tickers.length) return
    const ok = await copyTickersToTradingView(tickers)
    if (ok) {
      setCopiedSectorStars(sectorName)
      setTimeout(() => setCopiedSectorStars(null), 1600)
    }
  }

  const copyIndustryStars = async (industryName: string, tickers: string[]) => {
    if (!tickers.length) return
    const ok = await copyTickersToTradingView(tickers)
    if (ok) {
      setCopiedIndustry(industryName)
      setTimeout(() => setCopiedIndustry(null), 1600)
    }
  }

  const selectedSectorStars = sectorFilter ? (sectorStarCounts.get(sectorFilter) ?? []) : []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {sectors.map((s) => {
          const sectorStars = sectorStarCounts.get(s.name) ?? []
          const active = sectorFilter === s.name
          return (
            <div
              key={s.name}
              className={`inline-flex items-center overflow-hidden rounded-full border ${
                active
                  ? 'border-sky-500 bg-sky-100 dark:border-sky-400 dark:bg-sky-950'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)]'
              }`}
            >
              <button
                type="button"
                onClick={() => setSectorFilter(active ? null : s.name)}
                className={`px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition ${
                  active
                    ? 'text-sky-800 dark:text-sky-200'
                    : 'text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'
                }`}
              >
                {s.name}
                {sectorStars.length > 0 && (
                  <span className="ml-1.5 inline-flex items-center gap-0.5 normal-case text-amber-600">
                    <Star size={10} className="fill-amber-400 text-amber-400" />
                    {sectorStars.length}
                  </span>
                )}
              </button>
              {sectorStars.length > 0 && (
                <button
                  type="button"
                  onClick={() => copySectorStars(s.name)}
                  className="border-l border-inherit px-2 py-1 text-[10px] font-bold text-amber-800 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-950/50"
                  title={`Copy ${sectorStars.length} star stocks in ${s.name}`}
                >
                  {copiedSectorStars === s.name ? '✓' : 'Copy'}
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ['all', `ALL ${snapshot.industries.length}`],
            ['bullish', `${snapshot.moodCounts.bullish} BULLISH`],
            ['neutral', `${snapshot.moodCounts.neutral} NEUTRAL`],
            ['bearish', `${snapshot.moodCounts.bearish} BEARISH`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setMoodFilter(key)
              setStarOnly(false)
            }}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
              moodFilter === key && !starOnly
                ? 'border-teal-600 bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-200'
                : 'border-[var(--color-border)] bg-[var(--color-surface)]'
            }`}
          >
            {label}
          </button>
        ))}

        <button
          type="button"
          onClick={() => {
            setStarOnly((v) => !v)
            setStocksOnly(true)
            setMoodFilter('all')
          }}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
            starOnly
              ? 'border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200'
              : 'border-[var(--color-border)] bg-[var(--color-surface)]'
          }`}
          title="Outperformed ASX200 over the last 3 months"
        >
          <Star size={13} className={starOnly ? 'fill-amber-500 text-amber-500' : 'text-amber-500'} />
          {starCount} Star Stocks
        </button>

        <div className="relative ml-2 min-w-[200px] flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-soft)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sector or stock..."
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-2 pl-9 pr-3 text-sm outline-none focus:border-teal-500"
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
          <span
            className={`relative h-5 w-9 rounded-full transition ${stocksOnly || starOnly ? 'bg-teal-600' : 'bg-gray-300 dark:bg-gray-600'}`}
            onClick={() => setStocksOnly((v) => !v)}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${stocksOnly || starOnly ? 'left-4' : 'left-0.5'}`}
            />
          </span>
          Stocks Only
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[11px]">
        <span className="font-semibold text-[var(--color-ink-soft)]">Colour scale</span>
        {[
          ['>10%', 'bg-emerald-600 text-white'],
          ['3–10%', 'bg-emerald-400/80'],
          ['0–3%', 'bg-emerald-100'],
          ['0–3%', 'bg-rose-100'],
          ['3–10%', 'bg-rose-400/80'],
          ['>10%', 'bg-rose-600 text-white'],
        ].map(([label, cls], i) => (
          <span key={i} className={`rounded px-1.5 py-0.5 font-medium ${cls}`}>
            {i < 3 ? `↑ ${label}` : `↓ ${label}`}
          </span>
        ))}
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            onClick={copyStars}
            disabled={starCount === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 disabled:opacity-40 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <Star size={13} className="fill-amber-500 text-amber-500" />
            {copiedStars ? 'Copied!' : `Copy ${starCount} star stocks`}
          </button>
          {sectorFilter && (
            <button
              type="button"
              onClick={() => copySectorStars(sectorFilter)}
              disabled={selectedSectorStars.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 disabled:opacity-40 dark:bg-amber-950/40 dark:text-amber-200"
              title={`Star stocks in ${sectorFilter} only`}
            >
              <Star size={13} className="fill-amber-500 text-amber-500" />
              {copiedSectorStars === sectorFilter
                ? 'Copied!'
                : `Copy ${selectedSectorStars.length} stars · ${sectorFilter}`}
            </button>
          )}
          <button
            type="button"
            onClick={copyAll}
            className="inline-flex items-center gap-1.5 rounded-lg border border-teal-600 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800 dark:bg-teal-950/40 dark:text-teal-200"
          >
            <Copy size={13} />
            {copied ? 'Copied!' : 'Copy all to TradingView'}
          </button>
          <button
            type="button"
            onClick={expandAll}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-semibold"
          >
            Expand all
          </button>
        </div>
      </div>

      <div className="overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <table className="min-w-[1100px] w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-[var(--color-muted)] text-[10px] uppercase tracking-wide text-[var(--color-ink-soft)]">
            <tr>
              {[
                'Sector / Stock',
                'Weight',
                'Mood',
                'Cycle',
                'Trend',
                '52W',
                '1D',
                '1W',
                '1M',
                '3M',
                '6M',
                '1YR',
                '5YR',
                `VS ${snapshot.benchmark}`,
                'Copy stars',
              ].map((h) => (
                <th key={h} className="whitespace-nowrap px-2 py-2.5 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {industries.map((ind) => (
              <IndustryRows
                key={ind.name}
                ind={ind}
                open={expanded.has(ind.name) || stocksOnly || starOnly || searching}
                onToggle={() => toggle(ind.name)}
                benchmark={snapshot.benchmark}
                stocksOnly={stocksOnly || starOnly}
                onCopyStars={() =>
                  copyIndustryStars(
                    ind.name,
                    ind.stocks.filter((s) => s.star).map((s) => s.ticker),
                  )
                }
                starsCopied={copiedIndustry === ind.name}
              />
            ))}
            {!industries.length && (
              <tr>
                <td colSpan={15} className="px-4 py-10 text-center text-sm text-[var(--color-ink-soft)]">
                  No sectors/stocks match “{query}”
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ScoreDots({
  vsSector,
  vsIndex,
}: {
  vsSector: { w1: boolean; m1: boolean; m3: boolean }
  vsIndex: { w1: boolean; m1: boolean; m3: boolean }
}) {
  const Dot = ({ on }: { on: boolean }) => (
    <span className={`inline-block h-2 w-2 rounded-full ${on ? 'bg-emerald-500' : 'bg-rose-400'}`} />
  )
  return (
    <div className="flex flex-col gap-0.5 text-[9px] text-[var(--color-ink-soft)]">
      <div className="flex items-center gap-1">
        <span className="w-3">S</span>
        <Dot on={vsSector.w1} />
        <Dot on={vsSector.m1} />
        <Dot on={vsSector.m3} />
        <span className="ml-1">1W 1M 3M</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="w-3">I</span>
        <Dot on={vsIndex.w1} />
        <Dot on={vsIndex.m1} />
        <Dot on={vsIndex.m3} />
      </div>
    </div>
  )
}

function IndustryRows({
  ind,
  open,
  onToggle,
  benchmark,
  stocksOnly,
  onCopyStars,
  starsCopied,
}: {
  ind: IndustryMetrics
  open: boolean
  onToggle: () => void
  benchmark: string
  stocksOnly: boolean
  onCopyStars: () => void
  starsCopied: boolean
}) {
  const cycle = CYCLE_LABEL[ind.cycle]
  const mood = MOOD_LABEL[ind.mood]
  const p = ind.perf

  return (
    <>
      {!stocksOnly && (
        <tr
          className="cursor-pointer border-t border-[var(--color-border)] hover:bg-[var(--color-muted)]/70"
          onClick={onToggle}
        >
          <td className="px-2 py-2.5">
            <div className="flex flex-wrap items-center gap-1.5 font-semibold">
              {open ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />}
              <span>{ind.name}</span>
              {ind.starCount > 0 && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-600">
                  <Star size={11} className="fill-amber-400 text-amber-400" />
                  {ind.starCount}
                </span>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-5">
              <span className="text-[10px] text-[var(--color-ink-soft)]">{ind.sector}</span>
              {ind.starCount > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onCopyStars()
                  }}
                  className="inline-flex items-center gap-1 rounded-md border-2 border-amber-500 bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-950 hover:bg-amber-200 dark:border-amber-400 dark:bg-amber-950/70 dark:text-amber-100"
                >
                  <Copy size={12} />
                  {starsCopied ? 'Copied!' : `Copy ${ind.starCount} stars`}
                </button>
              )}
            </div>
          </td>
          <td className="px-2 tabular-nums">{ind.weight.toFixed(1)}%</td>
          <td className="px-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${mood.className}`}>
              {mood.label}
            </span>
          </td>
          <td className="px-2">
            <div
              className="inline-flex flex-col rounded-md px-2 py-0.5 text-[10px] font-bold text-white"
              style={{ background: cycle.color }}
            >
              {cycle.short}
              <span className="font-medium opacity-90">{cycle.action}</span>
            </div>
          </td>
          <td className="px-2">
            <Sparkline values={p.spark} positive={p.m3 >= 0} />
          </td>
          <td className={`px-2 tabular-nums ${perfCellClass(p.from52wHigh)}`}>{formatPct(p.from52wHigh)}</td>
          {[p.d1, p.w1, p.m1, p.m3, p.m6, p.y1, p.y5].map((v, i) => (
            <td key={i} className={`px-2 tabular-nums font-medium ${perfCellClass(v)}`}>
              {formatPct(v)}
            </td>
          ))}
          <td className={`px-2 text-[11px] font-semibold ${ind.vsIndex3m >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {formatVsIndex(ind.vsIndex3m, benchmark)}
          </td>
          <td className="px-2" onClick={(e) => e.stopPropagation()}>
            {ind.starCount > 0 ? (
              <button
                type="button"
                onClick={onCopyStars}
                className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border-2 border-amber-500 bg-amber-100 px-2.5 py-1.5 text-[11px] font-bold text-amber-950 hover:bg-amber-200 dark:border-amber-400 dark:bg-amber-950/70 dark:text-amber-100"
              >
                <Star size={12} className="fill-amber-500 text-amber-500" />
                {starsCopied ? 'Copied!' : `Copy ${ind.starCount}`}
              </button>
            ) : (
              <span className="text-[var(--color-ink-soft)]">—</span>
            )}
          </td>
        </tr>
      )}
      {open &&
        ind.stocks.map((s) => (
          <tr key={s.ticker} className="border-t border-[var(--color-border)]/60 bg-[var(--color-muted)]/40">
            <td className="px-2 py-2 pl-8">
              <div className="flex items-center gap-1.5">
                {s.star && <Star size={12} className="fill-amber-400 text-amber-400" />}
                <span className="font-semibold uppercase">{s.name}</span>
                <span className="text-[var(--color-ink-soft)]">| {s.ticker}</span>
              </div>
            </td>
            <td className="px-2 tabular-nums">{s.weight.toFixed(2)}</td>
            <td className="px-2">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${MOOD_LABEL[s.mood].className}`}>
                {MOOD_LABEL[s.mood].label}
              </span>
            </td>
            <td className="px-2">
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
                style={{ background: CYCLE_LABEL[s.cycle].color }}
              >
                {CYCLE_LABEL[s.cycle].short}
              </span>
            </td>
            <td className="px-2">
              <Sparkline values={s.spark} positive={s.m3 >= 0} />
            </td>
            <td className={`px-2 tabular-nums ${perfCellClass(s.from52wHigh)}`}>{formatPct(s.from52wHigh)}</td>
            {[s.d1, s.w1, s.m1, s.m3, s.m6, s.y1, s.y5].map((v, i) => (
              <td key={i} className={`px-2 tabular-nums font-medium ${perfCellClass(v)}`}>
                {formatPct(v)}
              </td>
            ))}
            <td className={`px-2 text-[11px] font-semibold ${s.m3 >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
              {formatPct(s.m3 - (ind.perf.m3 - ind.vsIndex3m))} vs idx
            </td>
            <td className="px-2">
              <ScoreDots vsSector={s.vsSector} vsIndex={s.vsIndex} />
            </td>
          </tr>
        ))}
    </>
  )
}
