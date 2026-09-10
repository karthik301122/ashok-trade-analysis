import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Header } from './components/Header'
import type { ViewId } from './components/ViewTabs'
import { MainPagePanels } from './components/MainPagePanels'
import { MarketingLanding } from './components/MarketingLanding'
import { AuthPage } from './components/AuthPage'
import { ProfilePage } from './components/ProfilePage'
import { OrgPage } from './components/OrgPage'
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
import { LegalDocumentPage } from './components/LegalDocumentPage'
import { InviteLandingPage } from './components/InviteLandingPage'
import { HowItWorksPage } from './components/HowItWorksPage'

const REFRESH_COOLDOWN_MS = 5 * 60_000

export default function App() {
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark')
  const [authChecking, setAuthChecking] = useState(true)
  const [authRequired, setAuthRequired] = useState(false)
  const [user, setUser] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [patternAlertWatches, setPatternAlertWatches] = useState<PatternAlertWatch[]>([])
  const [page, setPage] = useState<AppPage>(() => {
    if (typeof window === 'undefined') return 'sector'
    const path = window.location.pathname || '/'
    const search = window.location.search || ''
    if (search.includes('reset=')) return 'sector'
    if (path === '/terms') return 'terms'
    if (path === '/privacy') return 'privacy'
    if (path === '/how') return 'how'
    if (path === '/invite') return 'invite'
    if (path !== '/' && path !== '/index.html') return 'not-found'
    return 'sector'
  })
  const [inviteToken] = useState(() => {
    if (typeof window === 'undefined') return ''
    return new URLSearchParams(window.location.search).get('token') || ''
  })
  const [fullDeskAccess, setFullDeskAccess] = useState(true)
  const [, startNavTransition] = useTransition()
  const [view, setView] = useState<ViewId>('sector-table')
  const navigate = useCallback((next: AppPage) => {
    startNavTransition(() => {
      setPage(next)
      // Markets always opens on the sector table (not a leftover Crypto/Commodities view).
      if (next === 'sector') setView('sector-table')
      if (typeof window === 'undefined') return
      if (next === 'terms') {
        window.history.replaceState({}, '', '/terms')
        return
      }
      if (next === 'privacy') {
        window.history.replaceState({}, '', '/privacy')
        return
      }
      if (next === 'how') {
        window.history.replaceState({}, '', '/how')
        return
      }
      if (next === 'invite') {
        const token = new URLSearchParams(window.location.search).get('token')
        window.history.replaceState(
          {},
          '',
          token ? `/invite?token=${encodeURIComponent(token)}` : '/invite',
        )
        return
      }
      if (next !== 'not-found') {
        const path = window.location.pathname
        if (path && path !== '/' && path !== '/index.html') {
          window.history.replaceState({}, '', '/')
        }
      }
    })
  }, [])
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
  const [snapshotJob, setSnapshotJob] = useState<{
    status?: string
    message?: string
    loaded?: number
    failed?: number
    total?: number
    trigger?: string | null
    startedAt?: number
  } | null>(null)
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
  const lastManualRefreshAt = useRef(0)
  const [refreshCooldownUntil, setRefreshCooldownUntil] = useState(0)
  const [cooldownNow, setCooldownNow] = useState(() => Date.now())

  useEffect(() => {
    if (refreshCooldownUntil <= Date.now()) return
    const id = window.setInterval(() => setCooldownNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [refreshCooldownUntil])

  const refreshBlocked =
    backfilling ||
    retryingFailed ||
    snapshotJob?.status === 'running' ||
    refreshCooldownUntil > cooldownNow
  const refreshCooldownSec = Math.max(
    0,
    Math.ceil((refreshCooldownUntil - cooldownNow) / 1000),
  )

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
      setDisplayName(me.displayName ?? null)
      setPatternAlertWatches(me.patternAlertWatches ?? [])
      setAuthChecking(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!user) {
      setFullDeskAccess(true)
      return
    }
    setFullDeskAccess(false)
    ;(async () => {
      try {
        const res = await fetch('/api/entitlement', { credentials: 'include' })
        const json = await res.json().catch(() => ({}))
        if (cancelled) return
        if (res.ok) setFullDeskAccess(Boolean(json.fullDeskAccess))
        else setFullDeskAccess(false)
      } catch {
        if (!cancelled) setFullDeskAccess(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user])

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
      const runOnce = () =>
        loadLiveMarketSnapshot({
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
      let result
      try {
        result = await runOnce()
      } catch (firstErr) {
        if (ac.signal.aborted) return
        // Stay on the loading screen and soft-retry once before the wait/error UI.
        setProgress({ done: 0, total: ASX_UNIVERSE_COUNT + 1, phase: 'cache' })
        await new Promise((r) => setTimeout(r, 4000))
        if (ac.signal.aborted) return
        try {
          result = await runOnce()
        } catch {
          throw firstErr
        }
      }
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
    // Avoid force=1 on every click — that used to supersede (restart) the desk job.
    const jobAge = snapshotJob?.startedAt
      ? Date.now() - Number(snapshotJob.startedAt)
      : 0
    const hung =
      snapshotJob?.status === 'running' && Number.isFinite(jobAge) && jobAge >= 40 * 60_000
    const qs = hung ? 'force=1&priority=desk' : 'priority=desk'
    const res = await fetch(`/api/snapshot/refresh?${qs}`, {
      method: 'POST',
      credentials: 'include',
    })
    if (res.status === 429) {
      const body = await res.json().catch(() => ({}))
      const waitMs = Number(body?.retryAfterMs) || REFRESH_COOLDOWN_MS
      setRefreshCooldownUntil(Date.now() + waitMs)
      throw new Error(
        typeof body?.error === 'string'
          ? body.error
          : 'Refresh cooldown — wait before starting another rebuild',
      )
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(
        typeof body?.error === 'string'
          ? body.error
          : `Refresh failed (${res.status}) — admin access required in production`,
      )
    }
    const body = (await res.json().catch(() => ({}))) as {
      alreadyRunning?: boolean
      job?: { startedAt?: number; message?: string; status?: string }
    }
    if (body.job) setSnapshotJob(body.job)
    const waitFrom = body.alreadyRunning
      ? Number(body.job?.startedAt || 0) || startedAfter
      : startedAfter
    // Unlock UI once ASX200 is usable; mid/small keep running on the server.
    await waitForSnapshotJob(waitFrom, {
      readyOn: 'asx200',
      onStatus: setRefreshStatus,
    })
    return waitFrom
  }, [waitForSnapshotJob, snapshotJob?.status, snapshotJob?.startedAt])

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
        job?: {
          startedAt?: number
          message?: string
          status?: string
          failed?: number
          loaded?: number
          total?: number
          trigger?: string | null
        }
      }
      // If a desk pull is already mid-flight, track that job — don't wait for a new start.
      const startedAfter = body.alreadyRunning
        ? Number(body.job?.startedAt || 0)
        : Date.now()
      if (body.job) setSnapshotJob(body.job)
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
    const now = Date.now()
    if (
      backfilling ||
      retryingFailed ||
      snapshotJob?.status === 'running' ||
      now < lastManualRefreshAt.current + REFRESH_COOLDOWN_MS
    ) {
      if (snapshotJob?.status === 'running' || backfilling) {
        setRefreshStatus('Refresh already in progress — wait for it to finish')
      } else {
        const remain = Math.max(
          0,
          Math.ceil((lastManualRefreshAt.current + REFRESH_COOLDOWN_MS - now) / 1000),
        )
        if (remain > 0) setRefreshStatus(`Wait ${remain}s before refreshing again`)
      }
      return
    }
    lastManualRefreshAt.current = now
    setRefreshCooldownUntil(now + REFRESH_COOLDOWN_MS)

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
  }, [
    deskConfig,
    load,
    startAsx200ForceRefresh,
    backfilling,
    retryingFailed,
    snapshotJob?.status,
  ])

  const [authScreen, setAuthScreen] = useState<'landing' | 'signin'>('landing')

  const passwordResetPending = (() => {
    try {
      return Boolean(new URLSearchParams(window.location.search).get('reset')?.trim())
    } catch {
      return false
    }
  })()

  useEffect(() => {
    if (passwordResetPending) setAuthScreen('signin')
  }, [passwordResetPending])

  const canUseApp = !authChecking && (!authRequired || Boolean(user)) && !passwordResetPending

  useEffect(() => {
    if (!canUseApp) return
    void fetchDeskServerConfig().then(setDeskConfig)
  }, [canUseApp])

  /** Poll job status only while a retry/refresh is actually running. */
  useEffect(() => {
    if (!canUseApp) return
    const jobRunning = snapshotJob?.status === 'running' || retryingFailed
    if (!jobRunning) return

    let cancelled = false
    let wasRunning = true
    const poll = async () => {
      try {
        const res = await fetch(`/api/snapshot/refresh?_=${Date.now()}`, {
          credentials: 'include',
          cache: 'no-store',
          signal: AbortSignal.timeout(10_000),
        })
        if (!res.ok || cancelled) return
        const json = (await res.json()) as {
          job?: {
            status?: string
            message?: string
            loaded?: number
            failed?: number
            total?: number
            trigger?: string | null
          }
          snapshot?: { loaded?: number; failed?: number } | null
        }
        if (cancelled) return
        const job = json.job ?? null
        setSnapshotJob(job)
        if (json.snapshot) {
          setMeta((prev) =>
            prev
              ? {
                  ...prev,
                  loaded: json.snapshot!.loaded ?? prev.loaded,
                  failed: json.snapshot!.failed ?? prev.failed,
                }
              : prev,
          )
        }
        const running = job?.status === 'running'
        if (wasRunning && !running) {
          void loadRef.current(false)
        }
        wasRunning = Boolean(running)
      } catch {
        /* ignore transient poll errors */
      }
    }

    void poll()
    const id = window.setInterval(() => void poll(), 8000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [canUseApp, snapshotJob?.status, retryingFailed])

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
    if (fullDeskAccess) return
    if (page === 'special-patterns' || page === 'alerts' || page === 'create-pattern') {
      navigate('sector')
    }
  }, [fullDeskAccess, page, navigate])

  useEffect(() => {
    if (!canUseApp || startedLoad.current) return
    if (
      page === 'not-found' ||
      page === 'terms' ||
      page === 'privacy' ||
      page === 'invite' ||
      page === 'how'
    ) {
      return
    }
    startedLoad.current = true
    void loadRef.current(false)
    return () => abortRef.current?.abort()
  }, [canUseApp, page])

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
    setDisplayName(me.displayName ?? null)
    setPatternAlertWatches(me.patternAlertWatches ?? [])
    if (page === 'invite') setAuthScreen('landing')
  }

  const handleLogout = async () => {
    abortRef.current?.abort()
    await apiLogout()
    setUser(null)
    setDisplayName(null)
    setPatternAlertWatches([])
    setFullDeskAccess(true)
    setSnapshot(null)
    setMeta(null)
    setError(null)
    setLoading(false)
    setBackfilling(false)
    startedLoad.current = false
  }

  const handleProfileChange = (nextUser: string, nextDisplayName: string | null) => {
    setUser(nextUser)
    setDisplayName(nextDisplayName)
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

  const publicJobStatus = (() => {
    if (snapshotJob?.status === 'running') {
      const msg = (snapshotJob.message || '').trim()
      if (msg) return msg
      const n = snapshotJob.failed ?? meta?.failed
      if (n != null && n > 0) {
        return snapshotJob.trigger === 'auto-failed'
          ? `Auto-retrying ${n.toLocaleString()} failed stocks…`
          : `Retrying ${n.toLocaleString()} failed stocks…`
      }
      return 'Updating market snapshot…'
    }
    const failed = meta?.failed ?? 0
    if (failed > 300) {
      return `High failure count (${failed.toLocaleString()}) — admin can Retry failed names`
    }
    return null
  })()

  const shownJobStatus = refreshStatus || publicJobStatus

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

  if (page === 'how') {
    return (
      <HowItWorksPage
        onBack={() => {
          if (user) navigate('sector')
          else {
            setAuthScreen('landing')
            window.history.replaceState({}, '', '/')
            setPage('sector')
          }
        }}
        onSignIn={
          user
            ? undefined
            : () => {
                setAuthScreen('signin')
                window.history.replaceState({}, '', '/')
                setPage('sector')
              }
        }
      />
    )
  }

  if (page === 'invite') {
    if (authRequired && (!user || passwordResetPending) && authScreen === 'signin') {
      return (
        <div className="min-h-screen bg-[var(--color-muted)] text-[var(--color-ink)]">
          <main className="mx-auto max-w-[1600px] px-4 py-5">
            <AuthPage
              onSuccess={handleLogin}
              onBack={passwordResetPending ? undefined : () => setAuthScreen('landing')}
            />
          </main>
        </div>
      )
    }
    return (
      <div className="min-h-screen bg-[var(--color-muted)] text-[var(--color-ink)]">
        <InviteLandingPage
          token={inviteToken}
          user={user}
          authChecking={authChecking}
          onSignIn={() => setAuthScreen('signin')}
        />
      </div>
    )
  }

  if (page === 'terms' || page === 'privacy') {
    return (
      <LegalDocumentPage
        kind={page}
        onBack={() => {
          if (user) navigate('sector')
          else {
            setAuthScreen('landing')
            navigate('sector')
          }
        }}
        onOpenOther={(kind) => navigate(kind)}
      />
    )
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
          onPage={(p) => {
            if (
              !fullDeskAccess &&
              (p === 'special-patterns' || p === 'alerts' || p === 'create-pattern')
            ) {
              return
            }
            navigate(p)
          }}
          authRequired={authRequired}
          user={user}
          displayName={displayName}
          onLogout={authRequired ? handleLogout : undefined}
          fullDeskAccess={fullDeskAccess}
          onUpgrade={() => {
            void (async () => {
              const res = await fetch('/api/billing/individual/checkout', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  successUrl: `${window.location.origin}/?billing=success`,
                  cancelUrl: `${window.location.origin}/?billing=cancel`,
                }),
              })
              const json = await res.json().catch(() => ({}))
              if (res.ok && json.url) window.location.href = json.url
              else navigate('profile')
            })()
          }}
        />
      )}

      {!authChecking &&
      authRequired &&
      (!user || passwordResetPending) &&
      authScreen === 'landing' &&
      !passwordResetPending ? (
        <MarketingLanding onSignIn={() => setAuthScreen('signin')} />
      ) : (
      <main className="mx-auto max-w-[1600px] px-4 py-5">
        {authChecking ? (
          <div className="mx-auto mt-16 max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center shadow-sm">
            <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-teal-200 border-t-teal-600" />
            <p className="text-sm text-[var(--color-ink-soft)]">Checking session…</p>
          </div>
        ) : authRequired && (!user || passwordResetPending) ? (
            <AuthPage
              onSuccess={handleLogin}
              onBack={passwordResetPending ? undefined : () => setAuthScreen('landing')}
            />
        ) : page === 'not-found' ? (
          <div className="mx-auto mt-16 max-w-lg rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
              404
            </p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold">
              Page not found
            </h2>
            <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
              That URL is not part of Traders Scope. Head back to the markets desk.
            </p>
            <button
              type="button"
              onClick={() => navigate('sector')}
              className="mt-6 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
            >
              Back to Markets
            </button>
          </div>
        ) : page === 'org' && user ? (
          <OrgPage />
        ) : page === 'profile' && user ? (
          <ProfilePage user={user} onProfileChange={handleProfileChange} />
        ) : loading && !snapshot ? (
          <div className="mx-auto mt-16 max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center shadow-sm">
            <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-teal-200 border-t-teal-600" />
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
              Loading ASX universe
            </h2>
            <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
              {deskConfig?.productionMode
                ? 'Downloading whatever the server snapshot currently has. Progress is against the server map, not a fixed 2571 target.'
                : `First stocks show as they arrive, then it keeps filling all ${ASX_UNIVERSE_COUNT.toLocaleString()} names.`}
            </p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--color-muted)]">
              <div className="h-full bg-teal-600 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
              {progress
                ? `${progress.phase} · ${progress.done}/${progress.total} (${pct}%)`
                : 'Starting…'}
            </p>
            {progress?.phase === 'cache' && (progress.done ?? 0) === 0 && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                {deskConfig?.productionMode
                  ? 'Waiting for the shared server snapshot… Keeping this screen up while the server recovers.'
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
          <div className="mx-auto mt-16 max-w-lg rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center shadow-sm">
            <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-amber-200 border-t-amber-600" />
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
              Still waiting for snapshot
            </h2>
            <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
              Could not finish downloading the shared server snapshot (often after a mid-load network
              drop). Retry — the desk will resume chunk downloads instead of starting over from zero
              when possible.
            </p>
            {error && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={() => void load(false)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-teal-600 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 dark:bg-teal-950/40 dark:text-teal-200"
            >
              <RefreshCw size={14} />
              Retry live load
            </button>
          </div>
        ) : snapshot ? (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs">
              {(() => {
                const isDeskSnap = meta?.source === 'server-sqlite'
                const deskTotal = Math.max(1, (meta?.loaded ?? 0) + (meta?.failed ?? 0))
                const deskIncomplete =
                  Boolean(isDeskSnap) &&
                  (meta?.failed ?? 0) > 0 &&
                  (meta?.failed ?? 0) / deskTotal > 0.12
                const browserPartial =
                  !isDeskSnap && Boolean(meta && meta.loaded < ASX_UNIVERSE_COUNT * 0.98)
                const warn = deskIncomplete || browserPartial
                const label = backfilling
                  ? 'Loading'
                  : deskIncomplete
                    ? 'Partial'
                    : isDeskSnap
                      ? 'Desk'
                      : browserPartial
                        ? 'Partial'
                        : 'Live'
                return (
                  <>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-semibold ${
                  backfilling
                    ? 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300'
                    : warn
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    backfilling
                      ? 'animate-pulse bg-sky-500'
                      : warn
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                  }`}
                />
                {label}
              </span>
              {meta && (
                <span className="text-[var(--color-ink-soft)]">
                  {displaySnapshot
                    ? `${displaySnapshot.stocks.length.toLocaleString()} shown`
                    : `${meta.loaded.toLocaleString()} loaded`}
                  {meta.failed > 0 && warn ? ` · ${meta.failed} failed` : ''}
                  {statusLine}
                </span>
              )}
                  </>
                )
              })()}
              {shownJobStatus && (
                <span
                  className="inline-flex max-w-xl items-center gap-1.5 truncate text-sky-700 dark:text-sky-300"
                  title={shownJobStatus}
                >
                  <RefreshCw size={12} className="shrink-0 animate-spin" />
                  {shownJobStatus}
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
                disabled={refreshBlocked}
                onClick={() => void refreshLive()}
                title={
                  snapshotJob?.status === 'running' || backfilling
                    ? 'A refresh is already running'
                    : refreshCooldownSec > 0
                      ? `Wait ${refreshCooldownSec}s before refreshing again`
                      : 'Refresh market snapshot'
                }
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-teal-600 bg-teal-50 px-2.5 py-1 font-semibold text-teal-800 disabled:opacity-50 dark:bg-teal-950/40 dark:text-teal-200"
              >
                <RefreshCw size={12} className={backfilling ? 'animate-spin' : ''} />
                {backfilling || snapshotJob?.status === 'running'
                  ? 'Refreshing…'
                  : refreshCooldownSec > 0
                    ? `Wait ${refreshCooldownSec}s`
                    : 'Refresh'}
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
                onProfileChange={handleProfileChange}
              />
            </PanelErrorBoundary>
          </>
        ) : null}
      </main>
      )}
      {canUseApp && (
        <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
          <div className="mx-auto flex max-w-[1600px] flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <p className="text-[11px] leading-relaxed text-[var(--color-ink-soft)]">
              Traders Scope provides market information for education and research. It is not personal
              financial advice. Past pattern behaviour is not a guarantee of future results. Trading
              involves risk of loss.
            </p>
            <p className="shrink-0 text-[11px] text-[var(--color-ink-soft)]">
              <button
                type="button"
                className="underline underline-offset-2 hover:text-[var(--color-ink)]"
                onClick={() => navigate('terms')}
              >
                Terms
              </button>
              <span className="mx-1.5">·</span>
              <button
                type="button"
                className="underline underline-offset-2 hover:text-[var(--color-ink)]"
                onClick={() => navigate('privacy')}
              >
                Privacy
              </button>
            </p>
          </div>
        </footer>
      )}
    </div>
    </AppNavContext.Provider>
    </PatternPrefsProvider>
  )
}
