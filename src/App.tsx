import { useCallback, useEffect, useRef, useState } from 'react'
import { Header } from './components/Header'
import { ViewTabs, type ViewId } from './components/ViewTabs'
import { SectorTable } from './components/SectorTable'
import { MoneyRotation } from './components/MoneyRotation'
import { RotationClock } from './components/RotationClock'
import { SectorAnalytics } from './components/SectorAnalytics'
import { IndustryAnalytics } from './components/IndustryAnalytics'
import { BreadthAnalysis } from './components/BreadthAnalysis'
import { AltAssetsPanel } from './components/AltAssetsPanel'
import { COMMODITIES, CRYPTO } from './data/altAssets'
import { buildMarketSnapshot } from './lib/market'
import { loadLiveMarketSnapshot, type LiveLoadProgress } from './lib/liveMarket'
import type { MarketSnapshot } from './data/types'
import { ASX_UNIVERSE_COUNT } from './data/universe'
import { RefreshCw } from 'lucide-react'

export default function App() {
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark')
  const [page, setPage] = useState<'sector' | 'breadth'>('sector')
  const [view, setView] = useState<ViewId>('sector-table')
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [backfilling, setBackfilling] = useState(false)
  const [progress, setProgress] = useState<LiveLoadProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [meta, setMeta] = useState<{ fromCache: boolean; loaded: number; failed: number } | null>(
    null,
  )
  const [live, setLive] = useState(true)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  const load = useCallback(async (forceRefresh = false) => {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    setLoading(true)
    setBackfilling(true)
    setError(null)
    setProgress({ done: 0, total: ASX_UNIVERSE_COUNT + 1, phase: 'fetch' })
    try {
      const result = await loadLiveMarketSnapshot({
        forceRefresh,
        signal: ac.signal,
        onProgress: setProgress,
        onPartial: (partial, loaded, failed) => {
          if (ac.signal.aborted) return
          setSnapshot(partial)
          setMeta({ fromCache: false, loaded, failed })
          setLive(true)
          // Keep backfilling=true until full run finishes
          setLoading(false)
        },
      })
      if (ac.signal.aborted) return
      setSnapshot(result.snapshot)
      setMeta({ fromCache: result.fromCache, loaded: result.loaded, failed: result.failed })
      setLive(true)
    } catch (e) {
      if (ac.signal.aborted) return
      const msg = e instanceof Error ? e.message : 'Failed to load live data'
      if (msg === 'Aborted') return
      setError(msg)
      if (!snapshot) {
        setSnapshot(buildMarketSnapshot())
        setLive(false)
        setMeta(null)
      }
    } finally {
      if (!ac.signal.aborted) {
        setLoading(false)
        setBackfilling(false)
        setProgress(null)
      }
    }
  }, [snapshot])

  useEffect(() => {
    void load(false)
    return () => abortRef.current?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pct =
    progress && progress.total
      ? Math.round((progress.done / progress.total) * 100)
      : loading
        ? 5
        : 100

  const statusLine = (() => {
    if (!meta) return null
    if (meta.fromCache && !backfilling) return ' · cached (6h)'
    if (backfilling) {
      const rem = progress?.remaining
      return rem != null
        ? ` · downloading… ${meta.loaded.toLocaleString()}/${ASX_UNIVERSE_COUNT.toLocaleString()} (${rem} left)`
        : ` · downloading… ${meta.loaded.toLocaleString()}/${ASX_UNIVERSE_COUNT.toLocaleString()}`
    }
    return ' · yahoo-finance2'
  })()

  return (
    <div className="min-h-screen bg-[var(--color-muted)] text-[var(--color-ink)]">
      <Header dark={dark} onToggleDark={() => setDark((d) => !d)} page={page} onPage={setPage} />

      <main className="mx-auto max-w-[1600px] px-4 py-5">
        {loading && !snapshot ? (
          <div className="mx-auto mt-16 max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center shadow-sm">
            <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-teal-200 border-t-teal-600" />
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
              Loading full ASX universe
            </h2>
            <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
              First ~50 stocks show quickly, then it keeps filling all{' '}
              {ASX_UNIVERSE_COUNT.toLocaleString()} names (can take several minutes).
            </p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--color-muted)]">
              <div className="h-full bg-teal-600 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
              {progress
                ? `${progress.phase} · ${progress.done}/${progress.total} (${pct}%)`
                : 'Starting…'}
            </p>
          </div>
        ) : snapshot ? (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-semibold ${
                  live
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-emerald-500' : 'bg-amber-500'} ${backfilling ? 'animate-pulse' : ''}`}
                />
                {backfilling ? 'LOADING' : live ? 'LIVE' : 'DEMO FALLBACK'}
              </span>
              {meta && (
                <span className="text-[var(--color-ink-soft)]">
                  {meta.loaded.toLocaleString()} / {ASX_UNIVERSE_COUNT.toLocaleString()} stocks
                  loaded
                  {meta.failed ? ` · ${meta.failed} failed` : ''}
                  {statusLine}
                </span>
              )}
              {error && <span className="text-rose-600">{error}</span>}
              {backfilling && (
                <div className="h-1.5 w-28 overflow-hidden rounded-full bg-[var(--color-muted)]">
                  <div className="h-full bg-teal-600 transition-all" style={{ width: `${pct}%` }} />
                </div>
              )}
              <button
                type="button"
                disabled={backfilling}
                onClick={() => void load(true)}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-teal-600 bg-teal-50 px-2.5 py-1 font-semibold text-teal-800 disabled:opacity-50 dark:bg-teal-950/40 dark:text-teal-200"
              >
                <RefreshCw size={12} className={backfilling ? 'animate-spin' : ''} />
                {backfilling ? 'Loading…' : 'Refresh live'}
              </button>
            </div>

            {page === 'breadth' ? (
              <BreadthAnalysis snapshot={snapshot} />
            ) : (
              <div className="space-y-4">
                <div>
                  <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight md:text-3xl">
                    Market Sector Intelligence
                  </h1>
                  <p className="text-sm text-[var(--color-ink-soft)]">
                    {snapshot.industries.length} industries · {snapshot.stocks.length} ASX stocks ·{' '}
                    {snapshot.asOf} · vs {snapshot.benchmark} · universe{' '}
                    {ASX_UNIVERSE_COUNT.toLocaleString()}
                    {backfilling ? ' · still filling…' : ''}
                  </p>
                </div>

                <ViewTabs active={view} onChange={setView} mood={snapshot.moodCounts} />

                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm md:p-5">
                  {view === 'sector-table' && <SectorTable snapshot={snapshot} />}
                  {view === 'money-rotation' && <MoneyRotation snapshot={snapshot} />}
                  {view === 'rotation-clock' && <RotationClock snapshot={snapshot} />}
                  {view === 'sector-analytics' && <SectorAnalytics snapshot={snapshot} />}
                  {view === 'industry-analytics' && <IndustryAnalytics snapshot={snapshot} />}
                  {view === 'commodities' && (
                    <AltAssetsPanel
                      title="Commodities Desk"
                      subtitle="Live futures / spot proxies — gold, silver, copper, oil, ags, AUD"
                      assets={COMMODITIES}
                      benchmarkYahoo="GC=F"
                    />
                  )}
                  {view === 'crypto' && (
                    <AltAssetsPanel
                      title="Crypto Desk"
                      subtitle="Major coins with mood / cycle / returns vs BTC"
                      assets={CRYPTO}
                      benchmarkYahoo="BTC-USD"
                    />
                  )}
                </div>
              </div>
            )}
          </>
        ) : null}
      </main>
    </div>
  )
}
