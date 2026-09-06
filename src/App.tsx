import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Header } from './components/Header'
import type { ViewId } from './components/ViewTabs'
import { MainPagePanels } from './components/MainPagePanels'
import { AuthPage } from './components/AuthPage'
import { ProfilePage } from './components/ProfilePage'
import { loadLiveMarketSnapshot, type LiveLoadProgress } from './lib/liveMarket'
import { clearPerfCache, clearOhlcSessionCache } from './lib/deskSeries'
import { fetchDeskServerConfig, type DeskServerConfig } from './lib/deskConfig'
import { fetchAuthMe, logout as apiLogout, type PatternAlertWatch } from './lib/auth'
import type { MarketSnapshot } from './data/types'
import { ASX_UNIVERSE_COUNT } from './data/universe'
import { applyStocksOnlyFilter, STOCKS_ONLY_LS_KEY } from './lib/instrumentFilter'
import { RefreshCw } from 'lucide-react'
import { MaintenancePage } from './components/MaintenancePage'
import { PatternPrefsProvider } from './components/patterns/PatternPrefsContext'
import { WatchPatternAlertScan } from './components/patterns/WatchPatternAlertScan'
import { PrewarmSnapshotPatterns } from './components/PrewarmSnapshotPatterns'
import { PanelErrorBoundary } from './components/PanelErrorBoundary'
import { AppNavContext, type AppPage } from './lib/appPage'

export default function App() {
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark')
  const [authChecking, setAuthChecking] = useState(true)
  const [authRequired, setAuthRequired] = useState(false)
  const [user, setUser] = useState<string | null>(null)
  const [patternAlertWatches, setPatternAlertWatches] = useState<PatternAlertWatch[]>([])
  const [page, setPage] = useState<AppPage>('sector')
  const [, startNavTransition] = useTransition()
  const navigate = useCallback((next: AppPage) => {
    startNavTransition(() => setPage(next))
  }, [])
  const [view, setView] = useState<ViewId>('sector-table')
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [backfilling, setBackfilling] = useState(false)
  const [refreshStatus, setRefreshStatus] = useState<string | null>(null)
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
  const [siteMaintenance, setSiteMaintenance] = useState<{
    checking: boolean
    active: boolean
    message?: string
  }>({ checking: true, active: false })
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

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const cfg = await fetchDeskServerConfig()
      if (cancelled) return
      setDeskConfig(cfg)
      setSiteMaintenance({
        checking: false,
        active: Boolean(cfg.maintenance),
        message: cfg.maintenanceMessage,
      })
    })()
    return () => {
      cancelled = true
    }
  }, [])

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
      setPatternAlertWatches(me.patternAlertWatches ?? [])
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
      clearPerfCache()
      clearOhlcSessionCache()
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

  const waitForSnapshotJob = useCallback(
    async (
      startedAfter = 0,
      opts?: { readyOn?: 'asx200' | 'desk'; onStatus?: (message: string) => void },
    ) => {
      const readyOn = opts?.readyOn ?? 'asx200'
      for (let i = 0; i < 600; i++) {
        try {
          const res = await fetch(`/api/snapshot/refresh?_=${Date.now()}`, {
            credentials: 'include',
            cache: 'no-store',
          })
          if (res.status === 502 || res.status === 503 || res.status === 504) {
            await new Promise((r) => setTimeout(r, 3000))
            continue
          }
          if (!res.ok) return null
          const json = (await res.json()) as {
            job?: {
              status?: string
              message?: string
              startedAt?: number
              finishedAt?: number
              loaded?: number
              total?: number
            }
          }
          const job = json.job
          const startedAt = Number(job?.startedAt || 0)
          // Ignore stale status from a previous job until this refresh has started.
          if (startedAfter > 0 && startedAt > 0 && startedAt < startedAfter - 2000) {
            await new Promise((r) => setTimeout(r, 1000))
            continue
          }
          const msg = job?.message || ''
          if (msg) opts?.onStatus?.(msg)
          // Markets can reload as soon as ASX200 is done; mid/small continue in background.
          if (readyOn === 'asx200' && msg.includes('asx200-ready')) return job
          if (msg.includes('desk-ready')) return job
          if (job?.status !== 'running') return job
        } catch {
          await new Promise((r) => setTimeout(r, 3000))
          continue
        }
        await new Promise((r) => setTimeout(r, 2000))
      }
      return null
    },
    [],
  )

  const startAsx200ForceRefresh = useCallback(async () => {
    const startedAfter = Date.now()
    const res = await fetch('/api/snapshot/refresh?force=1&priority=desk', {
      method: 'POST',
      credentials: 'include',
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(
        typeof body?.error === 'string'
          ? body.error
          : `Refresh failed (${res.status}) — admin access required in production`,
      )
    }
    // Unlock UI once ASX200 is usable; mid/small keep running on the server.
    await waitForSnapshotJob(startedAfter, {
      readyOn: 'asx200',
      onStatus: setRefreshStatus,
    })
    return startedAfter
  }, [waitForSnapshotJob])

  const retryFailedLoads = useCallback(async () => {
    setRetryingFailed(true)
    setError(null)
    setRefreshStatus(null)
    try {
      clearPerfCache()
      clearOhlcSessionCache()
      const res = await fetch('/api/snapshot/retry-failed', {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(
          typeof body?.error === 'string'
            ? body.error
            : `Retry failed (${res.status}) — admin access required in production`,
        )
      }
      const body = (await res.json().catch(() => ({}))) as {
        alreadyRunning?: boolean
        job?: { startedAt?: number; message?: string }
      }
      // If a desk pull is already mid-flight, track that job — don't wait for a new start.
      const startedAfter = body.alreadyRunning
        ? Number(body.job?.startedAt || 0)
        : Date.now()
      if (body.job?.message) setRefreshStatus(body.job.message)
      await waitForSnapshotJob(startedAfter, {
        readyOn: 'desk',
        onStatus: setRefreshStatus,
      })
      await load(false)
      setRefreshStatus(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Retry failed'
      setError(msg)
      setRefreshStatus(null)
    } finally {
      setRetryingFailed(false)
    }
  }, [load, waitForSnapshotJob])

  const refreshLive = useCallback(async () => {
    const config = deskConfig ?? await fetchDeskServerConfig()
    if (!deskConfig) setDeskConfig(config)
    setError(null)
    setRefreshStatus(null)
    clearPerfCache()
    clearOhlcSessionCache()
    if (config.productionMode) {
      if (!config.isAdmin) {
        setError('Admin access required to refresh market data in production.')
        await load(false)
        return
      }
      setBackfilling(true)
      try {
        await startAsx200ForceRefresh()
        await load(false)
        setRefreshStatus(null)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Refresh failed'
        setError(msg)
        setRefreshStatus(null)
      } finally {
        setBackfilling(false)
      }
      return
    }
    await load(true)
  }, [deskConfig, load, startAsx200ForceRefresh, waitForSnapshotJob])

  const passwordResetPending = (() => {
    try {
      return Boolean(new URLSearchParams(window.location.search).get('reset')?.trim())
    } catch {
      return false
    }
  })()

  const canUseApp = !authChecking && (!authRequired || Boolean(user)) && !passwordResetPending

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
      if (
        cfg.liveQuotes?.marketOpen &&
        (cfg.liveQuotes?.usable || cfg.liveQuotes?.fresh) &&
        liveAt > lastLiveAt
      ) {
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

  // When a chart loads fresh OHLC, keep Markets overview Price on that last close.
  useEffect(() => {
    const onPrice = (ev: Event) => {
      const detail = (ev as CustomEvent<{ ticker?: string; lastPrice?: number }>).detail
      const ticker = String(detail?.ticker || '').toUpperCase()
      const lastPrice = Number(detail?.lastPrice)
      if (!ticker || !Number.isFinite(lastPrice) || lastPrice <= 0) return
      setSnapshot((prev) => {
        if (!prev?.stocks?.length) return prev
        let changed = false
        const stocks = prev.stocks.map((s) => {
          if (s.ticker !== ticker) return s
          if (Number(s.lastPrice) === lastPrice) return s
          changed = true
          return { ...s, lastPrice }
        })
        // Sector table renders industry.stocks — must patch nested copies too.
        const industries = prev.industries.map((ind) => {
          let indChanged = false
          const nextStocks = ind.stocks.map((s) => {
            if (s.ticker !== ticker) return s
            if (Number(s.lastPrice) === lastPrice) return s
            indChanged = true
            changed = true
            return { ...s, lastPrice }
          })
          return indChanged ? { ...ind, stocks: nextStocks } : ind
        })
        const sectors = prev.sectors.map((sec) => {
          let secChanged = false
          const nextStocks = sec.stocks.map((s) => {
            if (s.ticker !== ticker) return s
            if (Number(s.lastPrice) === lastPrice) return s
            secChanged = true
            changed = true
            return { ...s, lastPrice }
          })
          return secChanged ? { ...sec, stocks: nextStocks } : sec
        })
        return changed ? { ...prev, stocks, industries, sectors } : prev
      })
    }
    window.addEventListener('desk-last-price', onPrice)
    return () => window.removeEventListener('desk-last-price', onPrice)
  }, [])

  const handleLogin = async (u: string) => {
    startedLoad.current = false
    setUser(u)
    const me = await fetchAuthMe()
    setPatternAlertWatches(me.patternAlertWatches ?? [])
  }

  const handleLogout = async () => {
    abortRef.current?.abort()
    await apiLogout()
    setUser(null)
    setPatternAlertWatches([])
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
      if (deskConfig?.eodhdOnly || prov === 'eodhd') return ` · desk snapshot${live}`
      return ` · server snapshot${live}`
    }
    if (meta.fromCache && !backfilling) return ' · cached (15m)'
    if (backfilling) {
      const rem = progress?.remaining
      return rem != null
        ? ` · downloading… ${meta.loaded.toLocaleString()}/${ASX_UNIVERSE_COUNT.toLocaleString()} (${rem} left)`
        : ` · downloading… ${meta.loaded.toLocaleString()}/${ASX_UNIVERSE_COUNT.toLocaleString()}`
    }
    return ' · live desk data'
  })()

  if (siteMaintenance.checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-teal-200 border-t-teal-600" />
      </div>
    )
  }

  if (siteMaintenance.active) {
    return <MaintenancePage message={siteMaintenance.message} />
  }

  return (
    <PatternPrefsProvider user={user}>
    <AppNavContext.Provider value={{ page, setPage: navigate }}>
    <div className="min-h-screen bg-[var(--color-muted)] text-[var(--color-ink)]">
      {canUseApp && (
        <Header
          dark={dark}
          onToggleDark={() => setDark((d) => !d)}
          page={page}
          onPage={navigate}
          authRequired={authRequired}
          user={user}
          onLogout={authRequired ? handleLogout : undefined}
        />
      )}

      <main className="mx-auto max-w-[1600px] px-4 py-5">
        {authChecking ? (
          <div className="mx-auto mt-16 max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center shadow-sm">
            <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-teal-200 border-t-teal-600" />
            <p className="text-sm text-[var(--color-ink-soft)]">Checking session…</p>
          </div>
        ) : authRequired && (!user || passwordResetPending) ? (
          <AuthPage onSuccess={handleLogin} />
        ) : page === 'profile' && user ? (
          <ProfilePage user={user} onUserChange={setUser} />
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
                {deskConfig?.productionMode
                  ? 'Waiting for the shared server snapshot… If this stays at 0%, try Refresh or reload in a minute.'
                  : (
                    <>
                      Stuck at 0% usually means this URL has no desk API (wrong port or vite preview).
                      Use <span className="font-mono">npm run dev</span> at{' '}
                      <span className="font-mono">http://localhost:5173</span> — check{' '}
                      <span className="font-mono">/api/health</span> in the browser.
                    </>
                  )}
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
              crawl prices per user — retry after the server build finishes.
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
              {refreshStatus && (
                <span className="max-w-md truncate text-sky-700 dark:text-sky-300" title={refreshStatus}>
                  {refreshStatus}
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
                  title="Admin: re-fetch only tickers missing from the snapshot"
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

            <PanelErrorBoundary title="This tab failed to load">
              <PrewarmSnapshotPatterns snapshot={displaySnapshot!} />
              <WatchPatternAlertScan
                snapshot={displaySnapshot!}
                alertWatches={patternAlertWatches}
                paused={
                  page !== 'sector' && page !== 'special-patterns' && page !== 'alerts'
                }
              />
              <MainPagePanels
                page={page}
                snapshot={displaySnapshot!}
                view={view}
                onViewChange={setView}
                livePricesActive={Boolean(
                  deskConfig?.liveQuotes?.marketOpen &&
                    (deskConfig?.liveQuotes?.usable || deskConfig?.liveQuotes?.fresh),
                )}
                backfilling={backfilling}
                patternAlertWatches={patternAlertWatches}
                onPatternAlertWatchesChange={setPatternAlertWatches}
                user={user}
                onUserChange={setUser}
              />
            </PanelErrorBoundary>
          </>
        ) : null}
      </main>
    </div>
    </AppNavContext.Provider>
    </PatternPrefsProvider>
  )
}
