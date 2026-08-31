import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Header } from './components/Header'
import type { ViewId } from './components/ViewTabs'
import { MainPagePanels } from './components/MainPagePanels'
import { AuthPage } from './components/AuthPage'
import { loadLiveMarketSnapshot, type LiveLoadProgress } from './lib/liveMarket'
import { fetchDeskServerConfig, type DeskServerConfig } from './lib/deskConfig'
import { fetchAuthMe, logout as apiLogout } from './lib/auth'
import type { MarketSnapshot } from './data/types'
import { ASX_UNIVERSE_COUNT } from './data/universe'
import { applyStocksOnlyFilter, STOCKS_ONLY_LS_KEY } from './lib/instrumentFilter'
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
  const [retryingFailed, setRetryingFailed] = useState(false)
  const [deskConfig, setDeskConfig] = useState<DeskServerConfig | null>(null)
  const [stocksOnly, setStocksOnly] = useState(
    () => localStorage.getItem(STOCKS_ONLY_LS_KEY) === '1',
  )
  const abortRef = useRef<AbortController | null>(null)
  const startedLoad = useRef(false)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  useEffect(() => {
    localStorage.setItem(STOCKS_ONLY_LS_KEY, stocksOnly ? '1' : '0')
  }, [stocksOnly])

  const displaySnapshot = useMemo(
    () => (snapshot ? applyStocksOnlyFilter(snapshot, stocksOnly) : null),
    [snapshot, stocksOnly],
  )

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

    const config = deskConfig ?? await fetchDeskServerConfig()
    if (!deskConfig) setDeskConfig(config)

    setLoading(true)
    setBackfilling(true)
    setError(null)
    setProgress({ done: 0, total: ASX_UNIVERSE_COUNT + 1, phase: 'fetch' })
    try {
      const result = await loadLiveMarketSnapshot({
        forceRefresh,
        deskConfig: config,
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
  }, [deskConfig])

  const loadRef = useRef(load)
  loadRef.current = load

  const waitForSnapshotJob = useCallback(async () => {
    for (let i = 0; i < 600; i++) {
      const res = await fetch('/api/snapshot/refresh', { credentials: 'include' })
      if (!res.ok) return null
      const json = (await res.json()) as { job?: { status?: string; message?: string } }
      if (json.job?.status !== 'running') return json.job
      await new Promise((r) => setTimeout(r, 2000))
    }
    return null
  }, [])

  const retryFailedLoads = useCallback(async () => {
    setRetryingFailed(true)
    setError(null)
    try {
      const res = await fetch('/api/snapshot/retry-failed', {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(
          typeof body?.error === 'string' ? body.error : `Retry failed (${res.status})`,
        )
      }
      await waitForSnapshotJob()
      await load(false)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Retry failed'
      setError(msg)
    } finally {
      setRetryingFailed(false)
    }
  }, [load, waitForSnapshotJob])

  const refreshLive = useCallback(async () => {
    const config = deskConfig ?? await fetchDeskServerConfig()
    if (!deskConfig) setDeskConfig(config)
    if (config.productionMode) {
      if (config.isAdmin) {
        const rebuildRes = await fetch('/api/snapshot/rebuild-cache', {
          method: 'POST',
          credentials: 'include',
        })
        if (rebuildRes.status === 404) {
          // Server not yet deployed with rebuild-cache — fall back to refresh
          await fetch('/api/snapshot/refresh', {
            method: 'POST',
            credentials: 'include',
          })
        }
        await waitForSnapshotJob()
      }
      await load(false)
      return
    }
    await load(true)
  }, [deskConfig, load, waitForSnapshotJob])

  const canUseApp = !authChecking && (!authRequired || Boolean(user))

  useEffect(() => {
    if (!canUseApp) return
    void fetchDeskServerConfig().then(setDeskConfig)
  }, [canUseApp])

  useEffect(() => {
    if (!canUseApp || !deskConfig?.productionMode) return
    let lastLiveAt = deskConfig.liveQuotes?.updatedAt ?? 0
    const id = setInterval(async () => {
      const cfg = await fetchDeskServerConfig()
      setDeskConfig(cfg)
      const liveAt = cfg.liveQuotes?.updatedAt ?? 0
      if (cfg.liveQuotes?.fresh && liveAt > lastLiveAt) {
        lastLiveAt = liveAt
        await load(false)
      }
    }, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [canUseApp, deskConfig?.productionMode, load])

  useEffect(() => {
    if (!canUseApp || startedLoad.current) return
    startedLoad.current = true
    void loadRef.current(false)
    return () => abortRef.current?.abort()
  }, [canUseApp])

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
    if (meta.source === 'server-sqlite') {
      const prov = deskConfig?.provider
      const live =
        deskConfig?.liveQuotes?.fresh && deskConfig.liveQuotes.marketOpen
          ? ` · live (~${deskConfig.liveQuotes.delayedMinutes}m delay)`
          : ''
      if (deskConfig?.eodhdOnly || prov === 'eodhd') return ` · EODHD snapshot${live}`
      return ` · server SQLite snapshot${live}`
    }
    if (meta.fromCache && !backfilling) return ' · cached (6h)'
    if (backfilling) {
      const rem = progress?.remaining
      return rem != null
        ? ` · downloading… ${meta.loaded.toLocaleString()}/${ASX_UNIVERSE_COUNT.toLocaleString()} (${rem} left)`
        : ` · downloading… ${meta.loaded.toLocaleString()}/${ASX_UNIVERSE_COUNT.toLocaleString()}`
    }
    if (deskConfig?.eodhdOnly || deskConfig?.provider === 'eodhd') return ' · EODHD'
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
        authRequired={authRequired}
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
          <AuthPage onSuccess={handleLogin} />
        ) : loading && !snapshot ? (
          <div className="mx-auto mt-16 max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center shadow-sm">
            <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-teal-200 border-t-teal-600" />
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
              Loading full ASX universe
            </h2>
            <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
              {deskConfig?.productionMode
                ? 'Downloading server snapshot for the full ASX universe (shared for all users).'
                : `First ~50 stocks show quickly, then it keeps filling all ${ASX_UNIVERSE_COUNT.toLocaleString()} names (can take several minutes).`}
            </p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--color-muted)]">
              <div className="h-full bg-teal-600 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
              {progress
                ? `${progress.phase} · ${progress.done}/${progress.total} (${pct}%)`
                : 'Starting…'}
            </p>
            {progress?.phase === 'cache' && progress.done === 0 && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                Stuck at 0% usually means this URL has no desk API (wrong port or vite preview).
                Use <span className="font-mono">npm run dev</span> at{' '}
                <span className="font-mono">http://localhost:5173</span> — check{' '}
                <span className="font-mono">/api/health</span> in the browser.
              </p>
            )}
          </div>
        ) : !snapshot ? (
          <div className="mx-auto mt-16 max-w-lg rounded-2xl border border-rose-300 bg-[var(--color-surface)] p-6 shadow-sm dark:border-rose-800">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-rose-700 dark:text-rose-300">
              Live data unavailable
            </h2>
            <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
              Could not load the shared server snapshot. In production mode the browser does not
              crawl Yahoo per user — retry after the server build finishes.
            </p>
            {error && (
              <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={() => void refreshLive()}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-teal-600 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 dark:bg-teal-950/40 dark:text-teal-200"
            >
              <RefreshCw size={14} />
              Retry live load
            </button>
          </div>
        ) : snapshot ? (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs">
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
                  ? 'Loading'
                  : meta && meta.loaded < ASX_UNIVERSE_COUNT * 0.98
                    ? 'Partial'
                    : 'Live'}
              </span>
              {meta && (
                <span className="text-[var(--color-ink-soft)]">
                  {displaySnapshot
                    ? `${displaySnapshot.stocks.length.toLocaleString()} shown`
                    : `${meta.loaded.toLocaleString()} loaded`}
                  {meta.failed > 0 ? ` · ${meta.failed} failed` : ''}
                  {statusLine}
                </span>
              )}
              <button
                type="button"
                onClick={() => setStocksOnly((v) => !v)}
                className={`rounded-lg border px-2.5 py-1 font-semibold transition ${
                  stocksOnly
                    ? 'border-teal-600 bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-200'
                    : 'border-[var(--color-border)] hover:border-teal-400'
                }`}
                title="Hide ETFs, funds, and other non-equity instruments"
              >
                {stocksOnly ? 'Stocks only' : 'All instruments'}
              </button>
              {error && <span className="text-rose-600">{error}</span>}
              {backfilling && (
                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--color-muted)]">
                  <div className="h-full bg-teal-600 transition-all" style={{ width: `${pct}%` }} />
                </div>
              )}
              {meta && meta.failed > 0 && deskConfig?.isAdmin && (
                <button
                  type="button"
                  disabled={backfilling || retryingFailed}
                  onClick={() => void retryFailedLoads()}
                  className="rounded-lg border border-amber-600/80 px-2.5 py-1 font-semibold text-amber-900 disabled:opacity-50 dark:text-amber-200"
                  title="Admin: re-fetch missing tickers on the server"
                >
                  <RefreshCw size={12} className={retryingFailed ? 'animate-spin' : ''} />
                  {retryingFailed ? 'Retrying…' : `Retry ${meta.failed}`}
                </button>
              )}
              <button
                type="button"
                disabled={backfilling || retryingFailed}
                onClick={() => void refreshLive()}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-teal-600 bg-teal-50 px-2.5 py-1 font-semibold text-teal-800 disabled:opacity-50 dark:bg-teal-950/40 dark:text-teal-200"
              >
                <RefreshCw size={12} className={backfilling ? 'animate-spin' : ''} />
                {backfilling ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>

            <MainPagePanels
              page={page}
              snapshot={displaySnapshot!}
              view={view}
              onViewChange={setView}
              livePricesActive={Boolean(
                deskConfig?.liveQuotes?.fresh && deskConfig.liveQuotes.marketOpen,
              )}
              backfilling={backfilling}
            />
          </>
        ) : null}
      </main>
    </div>
    </PatternPrefsProvider>
  )
}
