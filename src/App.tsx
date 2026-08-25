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
import { AlertsPanel } from './components/AlertsPanel'
import { SpecialPatternsPanel } from './components/SpecialPatternsPanel'
import { VolumeScan } from './components/VolumeScan'
import { LoginPage } from './components/LoginPage'
import { COMMODITIES, CRYPTO } from './data/altAssets'
import { loadLiveMarketSnapshot, type LiveLoadProgress } from './lib/liveMarket'
import { fetchAuthMe, logout as apiLogout } from './lib/auth'
import type { MarketSnapshot } from './data/types'
import { ASX_UNIVERSE_COUNT } from './data/universe'
import { RefreshCw } from 'lucide-react'
import { PatternPrefsProvider } from './components/patterns/PatternPrefsContext'

export default function App() {
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark')
  const [authChecking, setAuthChecking] = useState(true)
  const [authRequired, setAuthRequired] = useState(false)
  const [user, setUser] = useState<string | null>(null)
  const [page, setPage] = useState<'sector' | 'breadth' | 'alerts' | 'special-patterns'>('sector')
  const [view, setView] = useState<ViewId>('sector-table')
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [backfilling, setBackfilling] = useState(false)
  const [progress, setProgress] = useState<LiveLoadProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [meta, setMeta] = useState<{
    fromCache: boolean
    loaded: number
    failed: number
    source?: string
  } | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const startedLoad = useRef(false)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const me = await fetchAuthMe()
      if (cancelled) return
      setAuthRequired(me.authRequired)
      setUser(me.user)
      setAuthChecking(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

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
          setLoading(false)
        },
      })
      if (ac.signal.aborted) return
      setSnapshot(result.snapshot)
      setMeta({
        fromCache: result.fromCache,
        loaded: result.loaded,
        failed: result.failed,
        source: result.source,
      })
    } catch (e) {
      if (ac.signal.aborted) return
      const msg = e instanceof Error ? e.message : 'Failed to load live data'
      if (msg === 'Aborted') return
      setError(msg)
      // Keep any prior live/cache snapshot; never invent synthetic DEMO markets.
      setSnapshot((prev) => {
        if (prev) return prev
        setMeta(null)
        return null
      })
    } finally {
      if (!ac.signal.aborted) {
        setLoading(false)
        setBackfilling(false)
        setProgress(null)
      }
    }
  }, [])

  const canUseApp = !authChecking && (!authRequired || Boolean(user))

  useEffect(() => {
    if (!canUseApp || startedLoad.current) return
    startedLoad.current = true
    void load(false)
    return () => abortRef.current?.abort()
  }, [canUseApp, load])

  const handleLogin = (u: string) => {
    startedLoad.current = false
    setUser(u)
  }

  const handleLogout = async () => {
    abortRef.current?.abort()
    await apiLogout()
    setUser(null)
    setSnapshot(null)
    setMeta(null)
    setError(null)
    setLoading(false)
    setBackfilling(false)
    startedLoad.current = false
  }

  const pct =
    progress && progress.total
      ? Math.round((progress.done / progress.total) * 100)
      : loading
        ? 5
        : 100

  const statusLine = (() => {
    if (!meta) return null
    if (meta.source === 'server-sqlite') return ' · server SQLite snapshot'
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
    <PatternPrefsProvider user={user}>
    <div className="min-h-screen bg-[var(--color-muted)] text-[var(--color-ink)]">
      <Header
        dark={dark}
        onToggleDark={() => setDark((d) => !d)}
        page={page}
        onPage={setPage}
        user={user}
        onLogout={authRequired ? handleLogout : undefined}
      />

      <main className="mx-auto max-w-[1600px] px-4 py-5">
        {authChecking ? (
          <div className="mx-auto mt-16 max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center shadow-sm">
            <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-teal-200 border-t-teal-600" />
            <p className="text-sm text-[var(--color-ink-soft)]">Checking session…</p>
          </div>
        ) : authRequired && !user ? (
          <LoginPage onSuccess={handleLogin} />
        ) : loading && !snapshot ? (
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
        ) : !snapshot ? (
          <div className="mx-auto mt-16 max-w-lg rounded-2xl border border-rose-300 bg-[var(--color-surface)] p-6 shadow-sm dark:border-rose-800">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-rose-700 dark:text-rose-300">
              Live data unavailable
            </h2>
            <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
              Could not load ASX prices from Yahoo. No synthetic demo market is shown — retry when
              the API is reachable.
            </p>
            {error && (
              <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={() => void load(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-teal-600 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 dark:bg-teal-950/40 dark:text-teal-200"
            >
              <RefreshCw size={14} />
              Retry live load
            </button>
          </div>
        ) : snapshot ? (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-semibold ${
                  backfilling
                    ? 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300'
                    : meta && meta.loaded < ASX_UNIVERSE_COUNT * 0.98
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    backfilling
                      ? 'animate-pulse bg-sky-500'
                      : meta && meta.loaded < ASX_UNIVERSE_COUNT * 0.98
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                  }`}
                />
                {backfilling
                  ? 'LOADING'
                  : meta && meta.loaded < ASX_UNIVERSE_COUNT * 0.98
                    ? 'PARTIAL'
                    : 'LIVE'}
              </span>
              {meta && (
                <span className="text-[var(--color-ink-soft)]">
                  {meta.loaded.toLocaleString()} / {ASX_UNIVERSE_COUNT.toLocaleString()} stocks
                  loaded
                  {meta.failed
                    ? ` · ${meta.failed} failed (${Math.round((meta.failed / ASX_UNIVERSE_COUNT) * 100)}%)`
                    : ''}
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

            {page === 'alerts' ? (
              <AlertsPanel />
            ) : page === 'special-patterns' ? (
              <SpecialPatternsPanel snapshot={snapshot} />
            ) : page === 'breadth' ? (
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
                  {view === 'volume-scan' && <VolumeScan snapshot={snapshot} />}
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
    </PatternPrefsProvider>
  )
}
