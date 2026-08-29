import { useMemo, useState } from 'react'
import { Copy, Search, Sparkles, Star } from 'lucide-react'
import type { MarketSnapshot } from '../data/types'
import { formatPct, perfCellClass } from '../lib/format'
import {
  SPECIAL_PATTERN_CATALOG,
  SPECIAL_PATTERN_CATEGORIES,
  type SpecialPatternDef,
} from '../lib/patterns/specialCatalog'
import { scanAllSpecialPatterns, type SpecialPatternHit } from '../lib/patterns/specialDetect'
import type { KarthikPatternId } from '../lib/patterns/karthikWeekly'
import { aggregateWeeklyHits, type WeeklySpecialHit } from '../lib/specialWeeklyCache'
import { aggregateLivermoreHits, type LivermoreHit } from '../lib/livermoreCache'
import { aggregateScriptHits, type ScriptScanRow } from '../lib/specialScriptCache'
import { copyTickersToTradingView } from '../lib/tradingview'
import { useKarthikWeeklyScan } from './patterns/useKarthikWeeklyScan'
import { useLivermoreScan } from './patterns/useLivermoreScan'
import { useSpecialScriptScan } from './patterns/useSpecialScriptScan'
import { usePatternPrefs } from './patterns/usePatternPrefs'
import { StockChartModal, type ChartPatternFocus } from './StockChartModal'

type Props = { snapshot: MarketSnapshot }

function biasClass(bias: string) {
  if (bias === 'bullish') return 'text-emerald-600 dark:text-emerald-400'
  if (bias === 'bearish') return 'text-rose-600 dark:text-rose-400'
  return 'text-amber-600 dark:text-amber-400'
}

function biasBadge(bias: string) {
  if (bias === 'bullish')
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
  if (bias === 'bearish') return 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200'
  return 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100'
}

function formatWeekDate(t: number | null) {
  if (!t) return '—'
  return new Date(t * 1000).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  })
}

function matchSectorIndustry(
  sector: string,
  industry: string,
  sectorFilter: string | null,
  industryFilter: string | null,
) {
  if (sectorFilter && sector !== sectorFilter) return false
  if (industryFilter && industry !== industryFilter) return false
  return true
}

export function SpecialPatternsPanel({ snapshot }: Props) {
  const [selectedId, setSelectedId] = useState('stage-2')
  const [category, setCategory] = useState<string>('weekly-karthik')
  const [query, setQuery] = useState('')
  const [sectorFilter, setSectorFilter] = useState<string | null>(null)
  const [industryFilter, setIndustryFilter] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [chartStock, setChartStock] = useState<{
    ticker: string
    name: string
    focus: ChartPatternFocus | null
  } | null>(null)
  const { isStarred, toggleStar } = usePatternPrefs()

  const indexM3 = snapshot.benchmarkPerf.m3
  const tickers = useMemo(() => snapshot.stocks.map((s) => s.ticker), [snapshot.stocks])

  const stockByTicker = useMemo(() => {
    const m = new Map<string, typeof snapshot.stocks[0]>()
    for (const s of snapshot.stocks) m.set(s.ticker.toUpperCase(), s)
    return m
  }, [snapshot.stocks])

  const sectors = useMemo(
    () => snapshot.sectors.map((s) => s.name).sort((a, b) => a.localeCompare(b)),
    [snapshot.sectors],
  )

  const industries = useMemo(() => {
    let list = snapshot.industries
    if (sectorFilter) list = list.filter((i) => i.sector === sectorFilter)
    return list
      .map((i) => i.name)
      .sort((a, b) => a.localeCompare(b))
  }, [snapshot.industries, sectorFilter])

  const hasSectorFilter = Boolean(sectorFilter || industryFilter)

  const { scanning: weeklyScanning, done: weeklyDone, total: weeklyTotal, version } =
    useKarthikWeeklyScan(snapshot.stocks, true)

  const {
    scanning: livermoreScanning,
    done: livermoreDone,
    total: livermoreTotal,
    version: livermoreVersion,
  } = useLivermoreScan(snapshot.stocks, true)

  const {
    scanning: scriptScanning,
    done: scriptDone,
    total: scriptTotal,
    version: scriptScanVersion,
  } = useSpecialScriptScan(snapshot.stocks, true)

  const snapshotScan = useMemo(
    () => scanAllSpecialPatterns(snapshot.stocks, indexM3),
    [snapshot.stocks, indexM3],
  )
  const snapshotById = useMemo(
    () => new Map(snapshotScan.map((r) => [r.pattern.id, r])),
    [snapshotScan],
  )

  const selected =
    SPECIAL_PATTERN_CATALOG.find((p) => p.id === selectedId) ?? SPECIAL_PATTERN_CATALOG[0]

  const weeklyHitsAll = useMemo(() => {
    if (!selected || selected.kind !== 'weekly') return [] as WeeklySpecialHit[]
    void version
    return aggregateWeeklyHits(tickers, selected.id as KarthikPatternId).map((h) => {
      const stock = stockByTicker.get(h.ticker.toUpperCase())
      return {
        ...h,
        rs: h.rs ?? stock?.rs ?? 0,
        relativeVolume: h.relativeVolume ?? stock?.relativeVolume ?? 0,
      }
    })
  }, [selected, tickers, version, stockByTicker])

  const weeklyHits = useMemo(
    () =>
      weeklyHitsAll.filter((h) => matchSectorIndustry(h.sector, h.industry, sectorFilter, industryFilter)),
    [weeklyHitsAll, sectorFilter, industryFilter],
  )

  const snapshotHitsAll = useMemo(() => {
    if (!selected || selected.kind !== 'snapshot') return [] as SpecialPatternHit[]
    return snapshotById.get(selected.id)?.hits ?? []
  }, [selected, snapshotById])

  const snapshotHits = useMemo(
    () =>
      snapshotHitsAll.filter((h) =>
        matchSectorIndustry(h.sector, h.industry, sectorFilter, industryFilter),
      ),
    [snapshotHitsAll, sectorFilter, industryFilter],
  )

  const livermoreHitsAll = useMemo(() => {
    if (!selected || selected.kind !== 'livermore') return [] as LivermoreHit[]
    void livermoreVersion
    return aggregateLivermoreHits(snapshot.stocks, selected.id)
  }, [selected, snapshot.stocks, livermoreVersion])

  const livermoreHits = useMemo(
    () =>
      livermoreHitsAll.filter((h) =>
        matchSectorIndustry(h.sector, h.industry, sectorFilter, industryFilter),
      ),
    [livermoreHitsAll, sectorFilter, industryFilter],
  )

  const scriptHitsAll = useMemo(() => {
    if (!selected || selected.kind !== 'scan') return [] as ScriptScanRow[]
    void scriptScanVersion
    return aggregateScriptHits(snapshot.stocks, selected.id)
  }, [selected, snapshot.stocks, scriptScanVersion])

  const scriptHits = useMemo(
    () =>
      scriptHitsAll.filter((h) =>
        matchSectorIndustry(h.sector, h.industry, sectorFilter, industryFilter),
      ),
    [scriptHitsAll, sectorFilter, industryFilter],
  )

  const hitCountTotal =
    selected?.kind === 'weekly'
      ? weeklyHitsAll.length
      : selected?.kind === 'livermore'
        ? livermoreHitsAll.length
        : selected?.kind === 'scan'
          ? scriptHitsAll.length
          : snapshotHitsAll.length

  const displayedHitCount =
    selected?.kind === 'weekly'
      ? weeklyHits.length
      : selected?.kind === 'livermore'
        ? livermoreHits.length
        : selected?.kind === 'scan'
          ? scriptHits.length
          : snapshotHits.length

  const filteredCatalog = useMemo(() => {
    let list = SPECIAL_PATTERN_CATALOG
    if (category !== 'all') list = list.filter((p) => p.category === category)
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.formula.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q),
      )
    }
    return list
  }, [category, query])

  const patternCount = (p: SpecialPatternDef) => {
    if (p.kind === 'weekly') {
      void version
      return aggregateWeeklyHits(tickers, p.id as KarthikPatternId).length
    }
    if (p.kind === 'livermore') {
      void livermoreVersion
      return aggregateLivermoreHits(snapshot.stocks, p.id).length
    }
    if (p.kind === 'scan') {
      void scriptScanVersion
      return aggregateScriptHits(snapshot.stocks, p.id).length
    }
    return snapshotById.get(p.id)?.count ?? 0
  }

  const copyHits = async () => {
    const list =
      selected?.kind === 'weekly'
        ? weeklyHits.map((h) => h.ticker)
        : selected?.kind === 'livermore'
          ? livermoreHits.map((h) => h.ticker)
          : selected?.kind === 'scan'
            ? scriptHits.map((h) => h.ticker)
            : snapshotHits.map((h) => h.ticker)
    if (!list.length) return
    const ok = await copyTickersToTradingView(list)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-violet-400/50 bg-gradient-to-br from-violet-50/80 to-[var(--color-surface)] p-5 dark:from-violet-950/30">
        <div className="flex flex-wrap items-start gap-3">
          <Sparkles className="mt-0.5 shrink-0 text-violet-600 dark:text-violet-300" size={22} />
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight">
              Special Patterns
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-[var(--color-ink-soft)]">
              Karthik weekly, Livermore scores, and desk snapshot rules (RS, RVOL, mood).
              All specials show as ✦ chips on the Sector Table automatically. Star chart patterns
              (★) or create My Patterns for extra chips.
            </p>
            {weeklyScanning && (
              <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                Scanning weekly patterns… {weeklyDone}/{weeklyTotal}
              </p>
            )}
            {livermoreScanning && (
              <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                Scanning Livermore scores… {livermoreDone}/{livermoreTotal}
              </p>
            )}
            {scriptScanning && (
              <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                Scanning VCP / ScanScript patterns… {scriptDone}/{scriptTotal}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <aside className="w-full shrink-0 lg:w-80">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <div className="relative mb-2">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-ink-soft)]"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search patterns or formulas…"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] py-2 pl-8 pr-2 text-xs outline-none focus:border-violet-500"
              />
            </div>
            <div className="mb-2 flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setCategory('all')}
                className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                  category === 'all'
                    ? 'bg-violet-700 text-white'
                    : 'border border-[var(--color-border)] text-[var(--color-ink-soft)]'
                }`}
              >
                All
              </button>
              {SPECIAL_PATTERN_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                    category === c.id
                      ? 'bg-violet-700 text-white'
                      : 'border border-[var(--color-border)] text-[var(--color-ink-soft)]'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <ul className="max-h-[420px] space-y-1 overflow-auto">
              {filteredCatalog.map((p) => {
                const count = patternCount(p)
                const active = p.id === selected?.id
                const starred = isStarred(p.name)
                return (
                  <li key={p.id}>
                    <div
                      className={`flex w-full items-stretch gap-0.5 rounded-lg border ${
                        active
                          ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/40'
                          : 'border-[var(--color-border)] hover:border-violet-400'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedId(p.id)}
                        className="min-w-0 flex-1 px-2.5 py-2 text-left"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold">
                            {p.kind === 'weekly'
                              ? '📅 '
                              : p.kind === 'livermore'
                                ? '◆ '
                                : p.kind === 'scan'
                                  ? '⌗ '
                                  : ''}
                            {p.name}
                          </span>
                          <span
                            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                              count > 0
                                ? 'bg-violet-200 text-violet-900 dark:bg-violet-900 dark:text-violet-100'
                                : 'bg-[var(--color-muted)] text-[var(--color-ink-soft)]'
                            }`}
                          >
                            {(weeklyScanning && p.kind === 'weekly' && count === 0) ||
                            (livermoreScanning && p.kind === 'livermore' && count === 0) ||
                            (scriptScanning && p.kind === 'scan' && count === 0)
                              ? '…'
                              : count}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 font-mono text-[9px] text-[var(--color-ink-soft)]">
                          {p.formula}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleStar(p.name)}
                        title={starred ? 'Unstar — hide from Sector Table' : 'Star — show on Sector Table'}
                        aria-label={starred ? 'Unstar' : 'Star'}
                        className="shrink-0 px-2 text-amber-500 hover:bg-violet-100/80 dark:hover:bg-violet-900/40"
                      >
                        <Star size={14} className={starred ? 'fill-amber-500' : ''} />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </aside>

        <div className="min-w-0 flex-1 space-y-3">
          {selected && (
            <PatternDetail
              pattern={selected}
              hitCount={displayedHitCount}
              indexM3={indexM3}
              onCopy={copyHits}
              copied={copied}
              canCopy={displayedHitCount > 0}
              starred={isStarred(selected.name)}
              onToggleStar={() => toggleStar(selected.name)}
            />
          )}

          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
            <label className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
              Filter
            </label>
            <select
              value={sectorFilter ?? ''}
              onChange={(e) => {
                setSectorFilter(e.target.value || null)
                setIndustryFilter(null)
              }}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-xs"
            >
              <option value="">All sectors</option>
              {sectors.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              value={industryFilter ?? ''}
              onChange={(e) => setIndustryFilter(e.target.value || null)}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-xs"
            >
              <option value="">All industries</option>
              {industries.map((ind) => (
                <option key={ind} value={ind}>{ind}</option>
              ))}
            </select>
            {hasSectorFilter && (
              <button
                type="button"
                onClick={() => {
                  setSectorFilter(null)
                  setIndustryFilter(null)
                }}
                className="text-[10px] font-semibold text-violet-700 hover:underline dark:text-violet-300"
              >
                Clear filters
              </button>
            )}
            {hasSectorFilter && hitCountTotal > 0 && (
              <span className="text-[10px] text-[var(--color-ink-soft)]">
                Showing {displayedHitCount} of {hitCountTotal}
              </span>
            )}
          </div>

          <div className="overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
            {selected?.kind === 'weekly' ? (
              <WeeklyHitsTable
                hits={weeklyHits}
                patternName={selected.name}
                patternBias={selected.bias}
                showTightness={selected.id === 'three-weeks-tight'}
                scanning={weeklyScanning}
                onOpenChart={(ticker, name, focus) => setChartStock({ ticker, name, focus })}
              />
            ) : selected?.kind === 'livermore' ? (
              <LivermoreHitsTable
                hits={livermoreHits}
                patternName={selected.name}
                patternBias={selected.bias}
                scanning={livermoreScanning}
                showDashboard={selected.id === 'livermore-dashboard'}
                onOpenChart={(ticker, name, focus) => setChartStock({ ticker, name, focus })}
              />
            ) : selected?.kind === 'scan' ? (
              <ScriptHitsTable
                hits={scriptHits}
                patternName={selected.name}
                patternBias={selected.bias}
                scanning={scriptScanning}
                onOpenChart={(ticker, name, focus) => setChartStock({ ticker, name, focus })}
              />
            ) : (
              <SnapshotHitsTable
                hits={snapshotHits}
                patternName={selected?.name ?? 'Special pattern'}
                patternBias={selected?.bias ?? 'neutral'}
                onOpenChart={(ticker, name, focus) => setChartStock({ ticker, name, focus })}
              />
            )}
          </div>
        </div>
      </div>

      {chartStock && (
        <StockChartModal
          ticker={chartStock.ticker}
          name={chartStock.name}
          initialFocus={chartStock.focus}
          onClose={() => setChartStock(null)}
        />
      )}
    </div>
  )
}

function WeeklyHitsTable({
  hits,
  patternName,
  patternBias,
  showTightness,
  scanning,
  onOpenChart,
}: {
  hits: WeeklySpecialHit[]
  patternName: string
  patternBias: SpecialPatternDef['bias']
  showTightness: boolean
  scanning: boolean
  onOpenChart: (ticker: string, name: string, focus: ChartPatternFocus) => void
}) {
  const headers = showTightness
    ? ['Stock', 'Sector', 'RS', 'RVOL', 'Tightness', 'Pattern started', 'Bias']
    : ['Stock', 'Sector', 'RS', 'RVOL', 'Pattern started', 'Bias']

  const open = (h: WeeklySpecialHit) => {
    const startT = h.weekStartT ?? h.weekEndT ?? Math.floor(Date.now() / 1000)
    const endT = h.weekEndT ?? startT
    onOpenChart(h.ticker, h.name, {
      name: patternName,
      bias: patternBias,
      startT,
      endT,
    })
  }

  return (
    <table className="min-w-[640px] w-full border-collapse text-left text-xs">
      <thead className="sticky top-0 bg-[var(--color-muted)] text-[10px] uppercase tracking-wide text-[var(--color-ink-soft)]">
        <tr>
          {headers.map((h) => (
            <th key={h} className="whitespace-nowrap px-3 py-2.5 font-semibold">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {!hits.length ? (
          <tr>
            <td colSpan={headers.length} className="px-3 py-8 text-center text-[var(--color-ink-soft)]">
              {scanning
                ? 'Scanning weekly OHLC across the universe…'
                : 'No stocks match this weekly formula right now.'}
            </td>
          </tr>
        ) : (
          hits.map((h) => (
            <tr
              key={h.ticker}
              className="border-t border-[var(--color-border)] hover:bg-[var(--color-muted)]/60"
            >
              <td className="px-3 py-2">
                <button
                  type="button"
                  onClick={() => open(h)}
                  className="font-semibold uppercase text-sky-700 hover:underline dark:text-sky-300"
                  title="Open chart at this pattern hit"
                >
                  {h.ticker}
                </button>
                <div className="text-[10px] text-[var(--color-ink-soft)]">{h.name}</div>
              </td>
              <td className="px-3 py-2 text-[var(--color-ink-soft)]">{h.sector}</td>
              <td className="px-3 py-2 font-bold tabular-nums">{h.rs}</td>
              <td className="px-3 py-2 tabular-nums">{h.relativeVolume.toFixed(1)}×</td>
              {showTightness && (
                <td className="px-3 py-2 tabular-nums font-semibold">
                  {h.tightness != null ? `${(h.tightness * 100).toFixed(2)}%` : '—'}
                </td>
              )}
              <td className="px-3 py-2 tabular-nums">
                {formatWeekDate(h.weekStartT ?? h.weekEndT)}
              </td>
              <td className="px-3 py-2">
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
                  weekly hit
                </span>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  )
}

function tierBadge(tier: LivermoreHit['scores']['tier']) {
  if (tier === 'elite')
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
  if (tier === 'strong')
    return 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200'
  if (tier === 'emerging')
    return 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200'
  return 'bg-[var(--color-muted)] text-[var(--color-ink-soft)]'
}

function LivermoreHitsTable({
  hits,
  patternName,
  patternBias,
  scanning,
  showDashboard,
  onOpenChart,
}: {
  hits: LivermoreHit[]
  patternName: string
  patternBias: SpecialPatternDef['bias']
  scanning: boolean
  showDashboard: boolean
  onOpenChart: (ticker: string, name: string, focus: ChartPatternFocus) => void
}) {
  const headers = showDashboard
    ? [
        'Stock',
        'Sector',
        'Final',
        'Acc',
        'Liq',
        'Brk',
        'RS',
        'RVOL',
        '52W',
        'ADX',
        'Tier',
      ]
    : ['Stock', 'Sector', 'Final', 'Acc', 'Liq', 'Brk', 'RVOL', 'Tier']

  const open = (h: LivermoreHit) => {
    const endT = Math.floor(Date.now() / 1000)
    const startT = endT - 30 * 86400
    onOpenChart(h.ticker, h.name, {
      name: patternName,
      bias: patternBias,
      startT,
      endT,
    })
  }

  return (
    <table className="min-w-[900px] w-full border-collapse text-left text-xs">
      <thead className="sticky top-0 bg-[var(--color-muted)] text-[10px] uppercase tracking-wide text-[var(--color-ink-soft)]">
        <tr>
          {headers.map((h) => (
            <th key={h} className="whitespace-nowrap px-3 py-2.5 font-semibold">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {!hits.length ? (
          <tr>
            <td colSpan={headers.length} className="px-3 py-8 text-center text-[var(--color-ink-soft)]">
              {scanning
                ? 'Scanning Livermore scores across the universe…'
                : 'No stocks match this Livermore formula right now.'}
            </td>
          </tr>
        ) : (
          hits.map((h) => (
            <tr
              key={h.ticker}
              className="border-t border-[var(--color-border)] hover:bg-[var(--color-muted)]/60"
            >
              <td className="px-3 py-2">
                <button
                  type="button"
                  onClick={() => open(h)}
                  className="font-semibold uppercase text-sky-700 hover:underline dark:text-sky-300"
                >
                  {h.ticker}
                </button>
                <div className="text-[10px] text-[var(--color-ink-soft)]">{h.name}</div>
              </td>
              <td className="px-3 py-2 text-[var(--color-ink-soft)]">{h.sector}</td>
              <td className="px-3 py-2 font-bold tabular-nums">{h.scores.finalScore}</td>
              <td className="px-3 py-2 tabular-nums">{h.scores.accumulation}</td>
              <td className="px-3 py-2 tabular-nums">{h.scores.liquidityGrab}</td>
              <td className="px-3 py-2 tabular-nums">{h.scores.breakout}</td>
              {showDashboard && (
                <td className="px-3 py-2 tabular-nums">{h.scores.rsScore}</td>
              )}
              <td className="px-3 py-2 tabular-nums">{h.relativeVolume.toFixed(1)}×</td>
              {showDashboard && (
                <>
                  <td className="px-3 py-2 tabular-nums">{formatPct(h.from52wHigh)}</td>
                  <td className="px-3 py-2 tabular-nums">{h.adx ?? '—'}</td>
                </>
              )}
              <td className="px-3 py-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${tierBadge(h.scores.tier)}`}
                >
                  {h.scores.tier}
                </span>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  )
}

function ScriptHitsTable({
  hits,
  patternName,
  patternBias,
  scanning,
  onOpenChart,
}: {
  hits: ScriptScanRow[]
  patternName: string
  patternBias: SpecialPatternDef['bias']
  scanning: boolean
  onOpenChart: (ticker: string, name: string, focus: ChartPatternFocus) => void
}) {
  const open = (h: ScriptScanRow) => {
    onOpenChart(h.ticker, h.name, {
      name: patternName,
      bias: patternBias,
      startT: h.startT,
      endT: h.endT,
    })
  }

  return (
    <table className="min-w-[720px] w-full border-collapse text-left text-xs">
      <thead className="sticky top-0 bg-[var(--color-muted)] text-[10px] uppercase tracking-wide text-[var(--color-ink-soft)]">
        <tr>
          {['Stock', 'Sector', 'RS', '3M', 'RVOL', 'RSI', 'Pattern started', 'Bias'].map((h) => (
            <th key={h} className="whitespace-nowrap px-3 py-2.5 font-semibold">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {!hits.length ? (
          <tr>
            <td colSpan={8} className="px-3 py-8 text-center text-[var(--color-ink-soft)]">
              {scanning
                ? 'Scanning daily OHLC across the universe…'
                : 'No stocks match this ScanScript formula right now.'}
            </td>
          </tr>
        ) : (
          hits.map((h) => (
            <tr
              key={h.ticker}
              className="border-t border-[var(--color-border)] hover:bg-[var(--color-muted)]/60"
            >
              <td className="px-3 py-2">
                <button
                  type="button"
                  onClick={() => open(h)}
                  className="font-semibold uppercase text-sky-700 hover:underline dark:text-sky-300"
                  title="Open chart at this pattern hit"
                >
                  {h.ticker}
                </button>
                <div className="text-[10px] text-[var(--color-ink-soft)]">{h.name}</div>
              </td>
              <td className="px-3 py-2 text-[var(--color-ink-soft)]">{h.sector}</td>
              <td className="px-3 py-2 font-bold tabular-nums">{h.rs}</td>
              <td className={`px-3 py-2 tabular-nums font-medium ${perfCellClass(h.m3)}`}>
                {formatPct(h.m3)}
              </td>
              <td className="px-3 py-2 tabular-nums">{h.relativeVolume.toFixed(1)}×</td>
              <td className="px-3 py-2 tabular-nums">{h.rsi.toFixed(0)}</td>
              <td className="px-3 py-2 tabular-nums text-[var(--color-ink-soft)]">
                {formatWeekDate(h.startT)}
              </td>
              <td className="px-3 py-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${biasBadge(patternBias)}`}
                >
                  {patternBias}
                </span>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  )
}

function SnapshotHitsTable({
  hits,
  patternName,
  patternBias,
  onOpenChart,
}: {
  hits: SpecialPatternHit[]
  patternName: string
  patternBias: SpecialPatternDef['bias']
  onOpenChart: (ticker: string, name: string, focus: ChartPatternFocus) => void
}) {
  const open = (h: SpecialPatternHit) => {
    const endT = Math.floor(Date.now() / 1000)
    const startT = endT - 21 * 86400
    onOpenChart(h.ticker, h.name, {
      name: patternName,
      bias: patternBias,
      startT,
      endT,
    })
  }

  return (
    <table className="min-w-[720px] w-full border-collapse text-left text-xs">
      <thead className="sticky top-0 bg-[var(--color-muted)] text-[10px] uppercase tracking-wide text-[var(--color-ink-soft)]">
        <tr>
          {['Stock', 'Sector', 'RS', '3M', 'RVOL', 'RSI', 'Bias'].map((h) => (
            <th key={h} className="whitespace-nowrap px-3 py-2.5 font-semibold">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {!hits.length ? (
          <tr>
            <td colSpan={7} className="px-3 py-8 text-center text-[var(--color-ink-soft)]">
              No stocks match this formula in the loaded universe right now.
            </td>
          </tr>
        ) : (
          hits.map((h) => (
            <tr
              key={h.ticker}
              className="border-t border-[var(--color-border)] hover:bg-[var(--color-muted)]/60"
            >
              <td className="px-3 py-2">
                <button
                  type="button"
                  onClick={() => open(h)}
                  className="font-semibold uppercase text-sky-700 hover:underline dark:text-sky-300"
                  title="Open chart highlighting this pattern"
                >
                  {h.ticker}
                </button>
                <div className="text-[10px] text-[var(--color-ink-soft)]">{h.name}</div>
              </td>
              <td className="px-3 py-2 text-[var(--color-ink-soft)]">{h.sector}</td>
              <td className="px-3 py-2 font-bold tabular-nums">{h.rs}</td>
              <td className={`px-3 py-2 tabular-nums font-medium ${perfCellClass(h.m3)}`}>
                {formatPct(h.m3)}
              </td>
              <td className="px-3 py-2 tabular-nums">{(h.relativeVolume ?? 0).toFixed(1)}×</td>
              <td className="px-3 py-2 tabular-nums">{Math.round(h.rsi)}</td>
              <td className="px-3 py-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${biasBadge(h.bias)}`}>
                  {h.bias}
                </span>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  )
}

function PatternDetail({
  pattern,
  hitCount,
  indexM3,
  onCopy,
  copied,
  canCopy,
  starred,
  onToggleStar,
}: {
  pattern: SpecialPatternDef
  hitCount: number
  indexM3: number
  onCopy: () => void
  copied: boolean
  canCopy: boolean
  starred: boolean
  onToggleStar: () => void
}) {
  const catLabel =
    SPECIAL_PATTERN_CATEGORIES.find((c) => c.id === pattern.category)?.label ?? pattern.category

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold">{pattern.name}</h3>
            <button
              type="button"
              onClick={onToggleStar}
              title={starred ? 'Unstar — hide from Sector Table chips' : 'Star — show hits on Sector Table'}
              aria-label={starred ? 'Unstar' : 'Star'}
              className="rounded-md border border-amber-400/60 bg-amber-50 p-1 text-amber-600 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300"
            >
              <Star size={16} className={starred ? 'fill-amber-500' : ''} />
            </button>
            <span className={`text-xs font-bold uppercase ${biasClass(pattern.bias)}`}>
              {pattern.bias}
            </span>
            <span className="rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-ink-soft)]">
              {catLabel}
            </span>
            {pattern.kind === 'weekly' && (
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-200">
                Weekly OHLC
              </span>
            )}
            {pattern.kind === 'livermore' && (
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-900 dark:bg-sky-950/50 dark:text-sky-200">
                Livermore OHLC
              </span>
            )}
            {pattern.kind === 'scan' && (
              <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-900 dark:bg-teal-950/50 dark:text-teal-200">
                ScanScript OHLC
              </span>
            )}
            {starred && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                On Sector Table
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{pattern.description}</p>
        </div>
        <button
          type="button"
          disabled={!canCopy}
          onClick={onCopy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-violet-600 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-900 disabled:opacity-40 dark:bg-violet-950/40 dark:text-violet-100"
        >
          <Copy size={13} />
          {copied ? 'Copied!' : `Copy ${hitCount} to TradingView`}
        </button>
      </div>
      <div className="mt-3 rounded-lg border border-violet-300/60 bg-violet-50/50 p-3 dark:border-violet-800 dark:bg-violet-950/20">
        <p className="text-[10px] font-bold uppercase tracking-wide text-violet-800 dark:text-violet-200">
          Formula
        </p>
        <p className="mt-1 whitespace-pre-wrap font-mono text-sm leading-relaxed text-violet-950 dark:text-violet-100">
          {pattern.formula}
        </p>
        {pattern.kind === 'snapshot' ? (
          <p className="mt-2 text-[10px] text-[var(--color-ink-soft)]">
            Benchmark 3M ({indexM3 >= 0 ? '+' : ''}
            {indexM3.toFixed(1)}%) used where the formula references index 3M.
          </p>
        ) : pattern.kind === 'weekly' ? (
          <p className="mt-2 text-[10px] text-[var(--color-ink-soft)]">
            Daily bars → ISO weeks (completed weeks only). Date shown = pattern{' '}
            <em>start</em> (oldest week in the setup). All weekly patterns require Stage 2 or ≥30%
            rally over ~13 weeks.
          </p>
        ) : pattern.kind === 'scan' ? (
          <p className="mt-2 text-[10px] text-[var(--color-ink-soft)]">
            Daily OHLC ScanScript scan. Breakout uses prior 4-day tightness + dry RVOL before the
            signal bar (pct_chg(5) and rvol cannot be both low and high on the same bar).
          </p>
        ) : (
          <p className="mt-2 text-[10px] text-[var(--color-ink-soft)]">
            Daily OHLC vs index 20d return. RVOL, RS rating, 52W distance, ADX included. Institutional
            ownership / earnings growth not available from Yahoo.
          </p>
        )}
      </div>
    </div>
  )
}
