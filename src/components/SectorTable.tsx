import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Search, Star } from 'lucide-react'
import type { IndustryMetrics, MarketSnapshot, Mood, StockMetrics } from '../data/types'
import { ASX_UNIVERSE_COUNT } from '../data/universe'
import type { PatternPrefs } from '../lib/patternPrefs'
import { CYCLE_LABEL, MOOD_LABEL } from '../lib/market'
import { formatPct, formatPrice, formatVsIndex, perfCellClass, resolveStockPrice } from '../lib/format'
import { matchesSectorFilters } from '../lib/sectorFilter'
import {
  matchesPriceRange,
  parsePriceInput,
  PRICE_PRESETS,
} from '../lib/priceFilter'
import { copyTickersToTradingView } from '../lib/tradingview'
import { Sparkline } from './Sparkline'
import { StockChartModal } from './StockChartModal'
import { usePatternPrefs } from './patterns/usePatternPrefs'
import { useIndustryPatternScan } from './patterns/useIndustryPatternScan'
import type { CachedPatternHit } from '../lib/patternHitsCache'
import {
  hasOverviewChartWatch,
  hitDisplayStartT,
  isCustomOverviewHit,
  isSpecialOverviewHit,
  isStarredOverviewHit,
} from '../lib/overviewPatternHits'
import { useUnifiedSpecialScans } from './patterns/useUnifiedSpecialScans'

type Props = {
  snapshot: MarketSnapshot
  /** EODHD live (delayed) prices applied on server */
  livePricesActive?: boolean
  /** Pause OHLC pattern scans when Markets tab is hidden */
  active?: boolean
}

function biasChipClass(bias: string) {
  if (bias === 'bullish') return 'border-emerald-400/60 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
  if (bias === 'bearish') return 'border-rose-400/60 bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200'
  return 'border-amber-400/60 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100'
}

function formatHitDate(t: number) {
  return new Date(t * 1000).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  })
}

function PatternHitChips({ hits, prefs }: { hits: CachedPatternHit[]; prefs: PatternPrefs }) {
  if (!hits.length) return null
  const show = hits.slice(0, 4)
  const extra = hits.length - show.length
  return (
    <div className="mt-1 flex flex-wrap gap-1 pl-0">
      {show.map((h) => {
        const starred = isStarredOverviewHit(h.name, prefs)
        const custom = isCustomOverviewHit(h.name, prefs)
        const special = isSpecialOverviewHit(h.name)
        const prefix = special ? '✦ ' : starred ? '★ ' : custom ? 'My ' : ''
        const when = formatHitDate(hitDisplayStartT(h))
        return (
          <span
            key={h.name}
            title={`${h.name} · ${h.bias} · started ${when} · ${Math.round(h.confidence * 100)}% conf.`}
            className={`inline-flex max-w-[11rem] items-center truncate rounded border px-1.5 py-0.5 text-[9px] font-semibold ${
              special && starred
                ? 'border-violet-400/60 bg-violet-50 text-violet-900 dark:bg-violet-950/40 dark:text-violet-100'
                : custom && !starred
                  ? 'border-teal-400/60 bg-teal-50 text-teal-900 dark:bg-teal-950/40 dark:text-teal-100'
                  : biasChipClass(h.bias)
            }`}
          >
            {prefix}
            {h.name}
            <span className="ml-1 font-normal opacity-75">· {when}</span>
          </span>
        )
      })}
      {extra > 0 && (
        <span className="rounded border border-[var(--color-border)] px-1.5 py-0.5 text-[9px] text-[var(--color-ink-soft)]">
          +{extra}
        </span>
      )}
    </div>
  )
}

export function SectorTable({ snapshot, livePricesActive = false, active = true }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [sectorFilters, setSectorFilters] = useState<string[]>([])
  const [industryFilter, setIndustryFilter] = useState<string | null>(null)
  const [moodFilter, setMoodFilter] = useState<Mood | 'all'>('all')
  const [starOnly, setStarOnly] = useState(false)
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [query, setQuery] = useState('')
  const [copiedStars, setCopiedStars] = useState(false)
  const [copiedSectorStars, setCopiedSectorStars] = useState<string | null>(null)
  const [copiedIndustry, setCopiedIndustry] = useState<string | null>(null)
  const [chartStock, setChartStock] = useState<{ ticker: string; name: string } | null>(null)
  const { prefs, overviewHitsFor } = usePatternPrefs()

  const heavyPatternScans =
    snapshot.stocks.length >= Math.floor(ASX_UNIVERSE_COUNT * 0.85)

  const {
    scanning: specialScanning,
    done: specialDone,
    total: specialTotal,
    version: weeklyVersion,
    livermoreVersion,
    scriptScanVersion,
  } = useUnifiedSpecialScans(
    snapshot.stocks,
    heavyPatternScans && active,
    snapshot.benchmarkPerf.m3,
  )

  const indexM3 = snapshot.benchmarkPerf.m3
  const universe = snapshot.stocks

  const priceMinNum = parsePriceInput(priceMin)
  const priceMaxNum = parsePriceInput(priceMax)
  const priceFilterActive = priceMinNum != null || priceMaxNum != null
  const activePricePreset = PRICE_PRESETS.find(
    (p) => p.min === priceMinNum && p.max === priceMaxNum,
  )?.label

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

  const industriesInSector = useMemo(() => {
    if (!sectorFilters.length) return []
    return snapshot.industries
      .filter((i) => matchesSectorFilters(i.sector, sectorFilters))
      .slice()
      .sort((a, b) => b.weight - a.weight)
  }, [snapshot.industries, sectorFilters])

  const industries = useMemo(() => {
    let list = snapshot.industries
    if (sectorFilters.length) list = list.filter((i) => matchesSectorFilters(i.sector, sectorFilters))
    if (industryFilter) list = list.filter((i) => i.name === industryFilter)
    if (moodFilter !== 'all') list = list.filter((i) => i.mood === moodFilter)
    if (starOnly) {
      list = list
        .map((i) => ({ ...i, stocks: i.stocks.filter((s) => s.star) }))
        .filter((i) => i.stocks.length > 0)
    }
    if (priceFilterActive) {
      list = list
        .map((i) => ({
          ...i,
          stocks: i.stocks.filter((s) => matchesPriceRange(s, priceMinNum, priceMaxNum)),
        }))
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
  }, [
    snapshot.industries,
    sectorFilters,
    industryFilter,
    moodFilter,
    starOnly,
    priceFilterActive,
    priceMinNum,
    priceMaxNum,
    query,
  ])

  const searching =
    query.trim().length > 0 || Boolean(industryFilter) || priceFilterActive

  const chartWatch = hasOverviewChartWatch(prefs)
  const heavyChartScans =
    chartWatch && snapshot.stocks.length >= Math.floor(ASX_UNIVERSE_COUNT * 0.85)

  const visibleTickers = useMemo(() => {
    const set = new Set<string>()
    for (const ind of industries) {
      const open = expanded.has(ind.name) || starOnly || searching
      if (!open) continue
      for (const s of ind.stocks) set.add(s.ticker)
    }
    return [...set]
  }, [industries, expanded, starOnly, searching])

  const { scanning: patternScanning, done: patternDone, total: patternTotal } =
    useIndustryPatternScan(visibleTickers, chartWatch && !heavyChartScans && active, false)

  const toggleSectorFilter = (name: string) => {
    setSectorFilters((prev) => {
      const next = prev.includes(name)
        ? prev.filter((s) => s !== name)
        : [...prev, name].sort((a, b) => a.localeCompare(b))
      if (next.length) {
        const names = snapshot.industries
          .filter((i) => matchesSectorFilters(i.sector, next))
          .map((i) => i.name)
        setExpanded(new Set(names))
      }
      return next
    })
    setIndustryFilter(null)
  }

  const clearSectorFilters = () => {
    setSectorFilters([])
    setIndustryFilter(null)
  }

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

  const selectedSectorStars = useMemo(() => {
    if (!sectorFilters.length) return []
    const out: string[] = []
    for (const sec of sectorFilters) {
      out.push(...(sectorStarCounts.get(sec) ?? []))
    }
    return out
  }, [sectorFilters, sectorStarCounts])

  const copySelectedSectorStars = async () => {
    if (!selectedSectorStars.length) return
    const ok = await copyTickersToTradingView(selectedSectorStars)
    if (ok) {
      setCopiedSectorStars('selected')
      setTimeout(() => setCopiedSectorStars(null), 1600)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {sectors.map((s) => {
          const sectorStars = sectorStarCounts.get(s.name) ?? []
          const active = sectorFilters.includes(s.name)
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
                onClick={() => toggleSectorFilter(s.name)}
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
        {sectorFilters.length > 0 && (
          <button
            type="button"
            onClick={clearSectorFilters}
            className="rounded-full border border-[var(--color-border)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)]"
          >
            Clear sectors ({sectorFilters.length})
          </button>
        )}
      </div>

      {sectorFilters.length > 0 && industriesInSector.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-50/80 p-3 dark:bg-amber-950/30">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-amber-900 dark:text-amber-200">
            {sectorFilters.length === 1
              ? sectorFilters[0]
              : `${sectorFilters.length} sectors`}{' '}
            · pick a category ({industriesInSector.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setIndustryFilter(null)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                !industryFilter
                  ? 'border-amber-600 bg-amber-200 text-amber-950 dark:bg-amber-800 dark:text-amber-50'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink-soft)]'
              }`}
            >
              All categories
            </button>
            {industriesInSector.map((ind) => {
              const active = industryFilter === ind.name
              return (
                <button
                  key={ind.name}
                  type="button"
                  onClick={() => {
                    setIndustryFilter(active ? null : ind.name)
                    setExpanded(new Set([ind.name]))
                  }}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                    active
                      ? 'border-amber-600 bg-amber-200 text-amber-950 dark:bg-amber-800 dark:text-amber-50'
                      : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)] hover:border-amber-400'
                  }`}
                >
                  {ind.name}
                  <span className="ml-1 text-[var(--color-ink-soft)]">({ind.stocks.length})</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

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

        <div
          className={`flex flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1.5 ${
            priceFilterActive
              ? 'border-teal-600 bg-teal-50/80 dark:bg-teal-950/30'
              : 'border-[var(--color-border)] bg-[var(--color-surface)]'
          }`}
          title="Filter stocks by last price (AUD)"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
            Price
          </span>
          <input
            type="number"
            min={0}
            step="any"
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)}
            placeholder="Min"
            className="w-16 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-1 text-xs outline-none focus:border-teal-500"
            aria-label="Minimum price"
          />
          <span className="text-[var(--color-ink-soft)]">–</span>
          <input
            type="number"
            min={0}
            step="any"
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            placeholder="Max"
            className="w-16 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-1 text-xs outline-none focus:border-teal-500"
            aria-label="Maximum price"
          />
          {PRICE_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setPriceMin(p.min != null ? String(p.min) : '')
                setPriceMax(p.max != null ? String(p.max) : '')
              }}
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                activePricePreset === p.label
                  ? 'bg-teal-600 text-white'
                  : 'text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)]'
              }`}
            >
              {p.label}
            </button>
          ))}
          {priceFilterActive && (
            <button
              type="button"
              onClick={() => {
                setPriceMin('')
                setPriceMax('')
              }}
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-teal-700 dark:text-teal-300"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="text-[var(--color-ink-soft)]">
          {specialScanning ? (
            <span className="font-medium text-amber-700 dark:text-amber-300">
              Scanning special patterns… {specialDone}/{specialTotal}
            </span>
          ) : patternScanning ? (
            <span className="font-medium text-amber-700 dark:text-amber-300">
              Pattern scan… {patternDone}/{patternTotal}
            </span>
          ) : (
            <span>✦ Special patterns on desk · ★ when you star a chart pattern</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={copyStars}
            disabled={starCount === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/80 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-900 disabled:opacity-40 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <Star size={13} className="fill-amber-500 text-amber-500" />
            {copiedStars ? 'Copied!' : `Copy ${starCount} stars`}
          </button>
          {sectorFilters.length > 0 && selectedSectorStars.length > 0 && (
            <button
              type="button"
              onClick={() => copySelectedSectorStars()}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-semibold"
            >
              {copiedSectorStars === 'selected' ? 'Copied!' : `Copy sector stars (${selectedSectorStars.length})`}
            </button>
          )}
          <button
            type="button"
            onClick={expandAll}
            className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-semibold hover:bg-[var(--color-muted)]"
          >
            Expand all
          </button>
        </div>
      </div>

      <div className="overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <table className="min-w-[1100px] w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-[var(--color-muted)] text-[10px] uppercase tracking-wide text-[var(--color-ink-soft)]">
            <tr>
              <th className="whitespace-nowrap px-2 py-2.5 font-semibold">Sector / Stock</th>
              <th
                className={`whitespace-nowrap px-2 py-2.5 font-semibold ${
                  priceFilterActive ? 'text-teal-700 dark:text-teal-300' : ''
                }`}
              >
                {livePricesActive ? 'Price (live)' : 'Price'}
                {priceFilterActive && (
                  <span className="ml-1 normal-case text-[9px] font-normal text-teal-600 dark:text-teal-400">
                    filtered
                  </span>
                )}
              </th>
              {[
                'Weight',
                'Mood',
                'Cycle',
                'RS',
                'RV',
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
                open={expanded.has(ind.name) || starOnly || searching}
                onToggle={() => toggle(ind.name)}
                benchmark={snapshot.benchmark}
                flatView={starOnly}
                onCopyStars={() =>
                  copyIndustryStars(
                    ind.name,
                    ind.stocks.filter((s) => s.star).map((s) => s.ticker),
                  )
                }
                starsCopied={copiedIndustry === ind.name}
                onOpenChart={(ticker, name) => setChartStock({ ticker, name })}
                overviewHitsFor={overviewHitsFor}
                prefs={prefs}
                indexM3={indexM3}
                universe={universe}
                weeklyVersion={weeklyVersion}
                livermoreVersion={livermoreVersion}
                scriptScanVersion={scriptScanVersion}
                livePricesActive={livePricesActive}
              />
            ))}
            {!industries.length && (
              <tr>
                <td colSpan={17} className="px-4 py-10 text-center text-sm text-[var(--color-ink-soft)]">
                  {query.trim()
                    ? `No sectors/stocks match “${query}”`
                    : priceFilterActive
                      ? 'No stocks in this price range'
                      : 'No sectors/stocks match the current filters'}
                </td>
              </tr>
            )}
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
  flatView,
  onCopyStars,
  starsCopied,
  onOpenChart,
  overviewHitsFor,
  prefs,
  indexM3,
  universe,
  weeklyVersion,
  livermoreVersion,
  scriptScanVersion,
  livePricesActive = false,
}: {
  ind: IndustryMetrics
  open: boolean
  onToggle: () => void
  benchmark: string
  flatView: boolean
  onCopyStars: () => void
  starsCopied: boolean
  onOpenChart: (ticker: string, name: string) => void
  overviewHitsFor: (
    ticker: string,
    extras?: {
      stock?: StockMetrics
      indexM3?: number
      universe?: StockMetrics[]
      weeklyVersion?: number
      livermoreVersion?: number
      scriptScanVersion?: number
    },
  ) => CachedPatternHit[]
  prefs: PatternPrefs
  indexM3: number
  universe: StockMetrics[]
  weeklyVersion: number
  livermoreVersion: number
  scriptScanVersion: number
  livePricesActive?: boolean
}) {
  const cycle = CYCLE_LABEL[ind.cycle]
  const mood = MOOD_LABEL[ind.mood]
  const p = ind.perf

  return (
    <>
      {!flatView && (
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
            </div>
          </td>
          <td className="px-2 tabular-nums text-[var(--color-ink-soft)]">—</td>
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
            <td className="px-2 font-semibold tabular-nums">{Math.round(ind.avgRs)}</td>
            <td className="px-2 tabular-nums text-[var(--color-ink-soft)]">
              {ind.stocks.length
                ? `${(ind.stocks.reduce((a, s) => a + (s.relativeVolume ?? 0), 0) / ind.stocks.length).toFixed(1)}×`
                : '—'}
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
        ind.stocks.map((s) => {
          const patternHits = overviewHitsFor(s.ticker, {
            stock: s,
            indexM3,
            universe,
            weeklyVersion,
            livermoreVersion,
            scriptScanVersion,
          })
          return (
          <tr key={s.ticker} className="border-t border-[var(--color-border)]/60 bg-[var(--color-muted)]/40">
            <td className="px-2 py-2 pl-8">
              <div className="flex items-center gap-1.5">
                {s.star && <Star size={12} className="fill-amber-400 text-amber-400" />}
                <button
                  type="button"
                  onClick={() => onOpenChart(s.ticker, s.name)}
                  className="text-left font-semibold uppercase text-sky-700 underline-offset-2 hover:underline dark:text-sky-300"
                  title={`Open ${s.ticker} TradingView chart`}
                >
                  {s.name}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenChart(s.ticker, s.name)}
                  className="text-[var(--color-ink-soft)] hover:text-sky-600"
                  title={`Open ${s.ticker} TradingView chart`}
                >
                  | {s.ticker}
                </button>
              </div>
              <PatternHitChips hits={patternHits} prefs={prefs} />
            </td>
            <td className="px-2 tabular-nums font-semibold">
              {formatPrice(resolveStockPrice(s) ?? 0)}
              {livePricesActive && s.liveAt ? (
                <span className="ml-1 text-[9px] font-normal text-sky-600 dark:text-sky-400">●</span>
              ) : null}
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
            <td
              className={`px-2 font-bold tabular-nums ${(s.rs ?? 0) >= 50 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600'}`}
            >
              {Math.round(s.rs ?? 0)}
            </td>
            <td
              className={`px-2 font-semibold tabular-nums ${
                (s.relativeVolume ?? 0) >= 1.5 ? 'text-amber-700 dark:text-amber-300' : ''
              }`}
            >
              {(s.relativeVolume ?? 0).toFixed(1)}×
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
          )
        })}
    </>
  )
}
