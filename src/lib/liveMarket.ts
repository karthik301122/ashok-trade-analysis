import { ASX_UNIVERSE } from '../data/universe'
import type {
  IndustryMetrics,
  MarketSnapshot,
  PerfBundle,
  SectorMetrics,
  StockMetrics,
  StockRaw,
} from '../data/types'
import { fetchDeskServerConfig, type DeskServerConfig } from './deskConfig'
import { avgPerf, classifyCycle, classifyMood, round1 } from './market'
import {
  type CachedPerf,
  ema,
  fetchYahooSeries,
  loadPerfCache,
  mapPool,
  returnOver,
  rsi,
  savePerfCache,
  sma,
  type SeriesResult,
} from './yahoo'

const INDEX_SYMBOL = '^AXJO'

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

const API_FETCH_MS = 20_000
const SNAPSHOT_FETCH_MS = 120_000

async function fetchDeskJson<T>(
  url: string,
  signal?: AbortSignal,
  timeoutMs = API_FETCH_MS,
): Promise<T | null> {
  const timeout = new AbortController()
  const onAbort = () => timeout.abort()
  if (signal) {
    if (signal.aborted) return null
    signal.addEventListener('abort', onAbort)
  }
  const timer = setTimeout(() => timeout.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      credentials: 'include',
      signal: signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal,
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', onAbort)
  }
}

type ServerSnapshotJson = {
  fresh?: boolean
  loaded?: number
  failed?: number
  builtAt?: number
  indexPerf?: CachedPerf
  stocks?: Record<string, CachedPerf>
  store?: string
}

function minSnapshotRatio(config: DeskServerConfig, fromServerStore = false) {
  if (fromServerStore) return 0.15
  return config.productionMode ? 0.35 : 0.5
}

function parseServerSnapshot(
  json: ServerSnapshotJson,
  tickers: string[],
  config: DeskServerConfig,
  acceptStale: boolean,
): { stockPerfs: Map<string, CachedPerf>; indexPerf: CachedPerf; failed: number } | null {
  const stockCount =
    typeof json.loaded === 'number' && json.loaded > 0
      ? json.loaded
      : json.stocks
        ? Object.keys(json.stocks).length
        : 0
  const minRatio = minSnapshotRatio(config, json.store === 'sqlite')
  const enough = stockCount >= tickers.length * minRatio
  const freshOk = Boolean(json.fresh) && enough
  const staleOk = acceptStale && Boolean(json.indexPerf) && enough
  const serverStore = json.store === 'sqlite'
  const serverOk = serverStore && Boolean(json.indexPerf) && enough
  if (!json.indexPerf || (!freshOk && !staleOk && !serverOk)) return null
  const stockPerfs = new Map<string, CachedPerf>()
  for (const [t, p] of Object.entries(json.stocks || {})) stockPerfs.set(t, p)
  return {
    stockPerfs,
    indexPerf: json.indexPerf,
    failed: json.failed ?? tickers.length - stockPerfs.size,
  }
}

async function probeDeskApi(signal?: AbortSignal): Promise<boolean> {
  const json = await fetchDeskJson<{ ok?: boolean }>('/api/health', signal)
  return Boolean(json?.ok)
}

async function waitForServerSnapshotJob(
  signal?: AbortSignal,
  onProgress?: (p: LiveLoadProgress) => void,
  total = 0,
  tryReady?: () => Promise<{
    snapshot: MarketSnapshot
    fromCache: boolean
    loaded: number
    failed: number
    source?: 'server-sqlite' | 'browser-yahoo'
  } | null>,
): Promise<{
  snapshot: MarketSnapshot
  fromCache: boolean
  loaded: number
  failed: number
  source?: 'server-sqlite' | 'browser-yahoo'
} | null> {
  for (let i = 0; i < 300; i++) {
    if (signal?.aborted) throw new Error('Aborted')
    if (tryReady) {
      const ready = await tryReady()
      if (ready) return ready
    }
    const res = await fetch('/api/snapshot/refresh', {
      credentials: 'include',
      signal,
    })
    if (!res.ok) break
    const json = (await res.json()) as {
      job?: { status?: string; loaded?: number; total?: number; message?: string }
    }
    const job = json.job
    if (job?.status !== 'running') return null
    const loaded = job.loaded ?? 0
    const jobTotal = job.total ?? total
    onProgress?.({
      done: loaded,
      total: jobTotal > 0 ? jobTotal + 1 : total,
      phase: 'cache',
      loaded,
      remaining: Math.max(0, jobTotal - loaded),
    })
    await sleep(2000)
  }
  return null
}

async function fetchServerSnapshotJson(
  signal?: AbortSignal,
  onProgress?: (p: LiveLoadProgress) => void,
  total = 0,
): Promise<ServerSnapshotJson | null> {
  const meta = await fetchDeskJson<ServerSnapshotJson>('/api/snapshot/meta', signal, 15_000)
  if (!meta?.indexPerf) {
    // Older servers without /meta — fall back to monolithic snapshot.
    return fetchDeskJson<ServerSnapshotJson>('/api/snapshot', signal, SNAPSHOT_FETCH_MS)
  }

  const stocks: Record<string, CachedPerf> = {}
  const stockTotal = meta.loaded ?? 0
  const chunkSize = 400
  let offset = 0

  while (offset < stockTotal) {
    const chunk = await fetchDeskJson<{
      stocks?: Record<string, CachedPerf>
      count?: number
      total?: number
    }>(
      `/api/snapshot/stocks?offset=${offset}&limit=${chunkSize}`,
      signal,
      SNAPSHOT_FETCH_MS,
    )
    if (!chunk?.stocks) break
    Object.assign(stocks, chunk.stocks)
    offset += chunk.count ?? chunkSize
    const loaded = Object.keys(stocks).length
    onProgress?.({
      done: loaded,
      total,
      phase: 'cache',
      loaded,
      remaining: Math.max(0, stockTotal - loaded),
    })
    if ((chunk.count ?? 0) < chunkSize) break
  }

  if (Object.keys(stocks).length === 0) {
    const full = await fetchDeskJson<ServerSnapshotJson>('/api/snapshot', signal, SNAPSHOT_FETCH_MS)
    if (full?.stocks && Object.keys(full.stocks).length > 0) return full
    return null
  }

  return {
    builtAt: meta.builtAt,
    loaded: meta.loaded,
    failed: meta.failed,
    fresh: meta.fresh,
    indexPerf: meta.indexPerf,
    stocks,
    store: 'sqlite',
  }
}

function seriesToCachedPerf(series: SeriesResult, indexM3: number): CachedPerf {
  const closes = series.closes.map((b) => b.c)
  const vols = series.closes.map((b) => (typeof b.v === 'number' && Number.isFinite(b.v) ? b.v : 0))
  const last = closes[closes.length - 1]

  const d1 = returnOver(series.closes, 1) ?? 0
  const w1 = returnOver(series.closes, 5) ?? 0
  const m1 = returnOver(series.closes, 21) ?? 0
  const m3 = returnOver(series.closes, 63) ?? 0
  const m6 = returnOver(series.closes, 126) ?? 0
  const y1 = returnOver(series.closes, 252) ?? 0
  const y5 =
    returnOver(series.closes, Math.min(252 * 5, Math.max(series.closes.length - 1, 1))) ?? y1

  const ma200 = closes.length >= 200 ? sma(closes, 200) : null
  const ma50 = closes.length >= 50 ? sma(closes, 50) : null
  const ma20 = closes.length >= 20 ? sma(closes, 20) : null
  const e21 = closes.length >= 21 ? ema(closes, 21) : null

  const from52wHigh = series.high52 ? ((last - series.high52) / series.high52) * 100 : 0
  const rawRs = 50 + (m3 - indexM3) * 2.2
  const rs = Math.round(Math.max(1, Math.min(99, rawRs)))

  const sparkSrc = closes.slice(-24)
  const base = sparkSrc[0] || last
  const spark = sparkSrc.map((c) => round1((c / base) * 100))

  const volume = vols[vols.length - 1] || 0
  const lookback = vols.slice(-21, -1) // prior 20 sessions (exclude today)
  const avgVolume20 =
    lookback.length > 0 ? lookback.reduce((a, b) => a + b, 0) / lookback.length : volume
  const relativeVolume = avgVolume20 > 0 ? volume / avgVolume20 : 0
  const dollarVolume = volume * last

  return {
    d1: round1(d1),
    w1: round1(w1),
    m1: round1(m1),
    m3: round1(m3),
    m6: round1(m6),
    y1: round1(y1),
    y5: round1(y5),
    from52wHigh: round1(from52wHigh),
    above200ma: ma200 != null ? last > ma200 : false,
    above50ma: ma50 != null ? last > ma50 : false,
    above21ema: e21 != null ? last > e21 : false,
    above20ma: ma20 != null ? last > ma20 : false,
    rs,
    spark: spark.length ? spark : [100],
    volume: Math.round(volume),
    avgVolume20: Math.round(avgVolume20),
    relativeVolume: round1(relativeVolume),
    dollarVolume: Math.round(dollarVolume),
    rsi: rsi(closes, 14) ?? 50,
  }
}

function toPerfBundle(p: CachedPerf): PerfBundle {
  return {
    d1: p.d1,
    w1: p.w1,
    m1: p.m1,
    m3: p.m3,
    m6: p.m6,
    y1: p.y1,
    y5: p.y5,
    from52wHigh: p.from52wHigh,
    above200ma: p.above200ma,
    above50ma: p.above50ma,
    above21ema: p.above21ema,
    above20ma: p.above20ma,
    rs: p.rs,
    spark: p.spark,
  }
}

export function assembleSnapshotFromPerfs(
  stockPerfs: Map<string, CachedPerf>,
  indexPerf: CachedPerf,
  universe: StockRaw[] = ASX_UNIVERSE,
): MarketSnapshot {
  const benchmarkPerf = toPerfBundle(indexPerf)
  benchmarkPerf.rs = 50

  const stockMetrics: StockMetrics[] = []
  for (const raw of universe) {
    const perfCached = stockPerfs.get(raw.ticker)
    if (!perfCached) continue
    const perf = toPerfBundle(perfCached)
    const vsIndex3m = round1(perf.m3 - benchmarkPerf.m3)
    stockMetrics.push({
      ...raw,
      ...perf,
      mood: classifyMood(perf, vsIndex3m),
      cycle: classifyCycle(perf, vsIndex3m),
      vsSector: { w1: false, m1: false, m3: false },
      vsIndex: {
        w1: perf.w1 > benchmarkPerf.w1,
        m1: perf.m1 > benchmarkPerf.m1,
        m3: perf.m3 > benchmarkPerf.m3,
      },
      star: false,
      score: perf.rs,
      volume: perfCached.volume ?? 0,
      avgVolume20: perfCached.avgVolume20 ?? 0,
      relativeVolume: perfCached.relativeVolume ?? 0,
      dollarVolume: perfCached.dollarVolume ?? 0,
      rsi: perfCached.rsi ?? 50,
    })
  }

  const byIndustry = new Map<string, StockMetrics[]>()
  for (const s of stockMetrics) {
    const list = byIndustry.get(s.industry) ?? []
    list.push(s)
    byIndustry.set(s.industry, list)
  }

  const industries: IndustryMetrics[] = [...byIndustry.entries()].map(([name, stocks]) => {
    const weights = stocks.map((s) => s.weight)
    const perf = avgPerf(stocks, weights)
    const vsIndex3m = round1(perf.m3 - benchmarkPerf.m3)
    const tw = weights.reduce((a, b) => a + b, 0)

    for (const s of stocks) {
      s.vsSector = {
        w1: s.w1 > perf.w1,
        m1: s.m1 > perf.m1,
        m3: s.m3 > perf.m3,
      }
      s.star = s.vsIndex.m3
      s.cycle = classifyCycle(s, s.m3 - benchmarkPerf.m3)
      s.mood = classifyMood(s, s.m3 - benchmarkPerf.m3)
    }

    return {
      name,
      sector: stocks[0].sector,
      weight: round1(tw),
      mood: classifyMood(perf, vsIndex3m),
      cycle: classifyCycle(perf, vsIndex3m),
      stocks: stocks.sort((a, b) => b.weight - a.weight),
      perf,
      vsIndex3m,
      pctAbove200ma: round1((stocks.filter((s) => s.above200ma).length / stocks.length) * 100),
      pctAbove50ma: round1((stocks.filter((s) => s.above50ma).length / stocks.length) * 100),
      pctAbove21ema: round1((stocks.filter((s) => s.above21ema).length / stocks.length) * 100),
      pctAbove20ma: round1((stocks.filter((s) => s.above20ma).length / stocks.length) * 100),
      avgRs: Math.round(stocks.reduce((a, s) => a + s.rs, 0) / stocks.length),
      pctNear52w: round1(
        (stocks.filter((s) => Math.abs(s.from52wHigh) <= 5).length / stocks.length) * 100,
      ),
      starCount: stocks.filter((s) => s.star).length,
    }
  })

  const bySector = new Map<string, IndustryMetrics[]>()
  for (const ind of industries) {
    const list = bySector.get(ind.sector) ?? []
    list.push(ind)
    bySector.set(ind.sector, list)
  }

  const sectors: SectorMetrics[] = [...bySector.entries()].map(([name, inds]) => {
    const stocks = inds.flatMap((i) => i.stocks)
    const weights = stocks.map((s) => s.weight)
    const perf = avgPerf(stocks, weights)
    const vsIndex3m = round1(perf.m3 - benchmarkPerf.m3)
    const tw = weights.reduce((a, b) => a + b, 0)
    return {
      name,
      weight: round1(tw),
      mood: classifyMood(perf, vsIndex3m),
      cycle: classifyCycle(perf, vsIndex3m),
      industries: inds.sort((a, b) => b.weight - a.weight),
      stocks: stocks.sort((a, b) => b.weight - a.weight),
      perf,
      vsIndex3m,
      pctAbove200ma: round1((stocks.filter((s) => s.above200ma).length / stocks.length) * 100),
      pctAbove50ma: round1((stocks.filter((s) => s.above50ma).length / stocks.length) * 100),
      pctAbove21ema: round1((stocks.filter((s) => s.above21ema).length / stocks.length) * 100),
      pctAbove20ma: round1((stocks.filter((s) => s.above20ma).length / stocks.length) * 100),
      avgRs: Math.round(stocks.reduce((a, s) => a + s.rs, 0) / stocks.length),
      pctNear52w: round1(
        (stocks.filter((s) => Math.abs(s.from52wHigh) <= 5).length / stocks.length) * 100,
      ),
      starCount: stocks.filter((s) => s.star).length,
    }
  })

  sectors.sort((a, b) => b.weight - a.weight)
  industries.sort((a, b) => b.perf.m3 - a.perf.m3)

  return {
    asOf: new Date().toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
    benchmark: 'ASX200',
    benchmarkPerf,
    sectors,
    industries,
    stocks: stockMetrics,
    moodCounts: {
      bullish: industries.filter((i) => i.mood === 'bullish').length,
      neutral: industries.filter((i) => i.mood === 'neutral').length,
      bearish: industries.filter((i) => i.mood === 'bearish').length,
    },
  }
}

export type LiveLoadProgress = {
  done: number
  total: number
  phase: 'cache' | 'fetch' | 'compute' | 'done'
  partial?: boolean
  loaded?: number
  remaining?: number
}

function persist(stockPerfs: Map<string, CachedPerf>, indexPerf: CachedPerf) {
  const cacheObj: Record<string, CachedPerf> = {}
  for (const [t, p] of stockPerfs) cacheObj[t] = p
  savePerfCache({ savedAt: Date.now(), index: indexPerf, stocks: cacheObj })
}

export async function loadLiveMarketSnapshot(
  opts: {
    forceRefresh?: boolean
    signal?: AbortSignal
    deskConfig?: DeskServerConfig
    onProgress?: (p: LiveLoadProgress) => void
    onPartial?: (snapshot: MarketSnapshot, loaded: number, failed: number) => void
  } = {},
): Promise<{
  snapshot: MarketSnapshot
  fromCache: boolean
  loaded: number
  failed: number
  source?: 'server-sqlite' | 'browser-yahoo'
}> {
  const { forceRefresh = false, signal, onProgress, onPartial } = opts
  const config = opts.deskConfig ?? await fetchDeskServerConfig(signal)
  const tickers = ASX_UNIVERSE.map((s) => s.ticker)
  const total = tickers.length + 1

  // Show cached universe immediately while server snapshot loads (dev / repeat visits).
  if (!forceRefresh) {
    const browserCached = loadPerfCache()
    if (browserCached?.index) {
      const cachedPerfs = new Map<string, CachedPerf>()
      for (const t of tickers) {
        if (browserCached.stocks[t]) cachedPerfs.set(t, browserCached.stocks[t])
      }
      if (cachedPerfs.size >= tickers.length * 0.15) {
        onPartial?.(
          assembleSnapshotFromPerfs(cachedPerfs, browserCached.index),
          cachedPerfs.size,
          tickers.length - cachedPerfs.size,
        )
        onProgress?.({
          done: cachedPerfs.size,
          total,
          phase: 'cache',
          loaded: cachedPerfs.size,
          remaining: tickers.length - cachedPerfs.size,
        })
      }
    }
  }

  const finishFromServer = (
    parsed: { stockPerfs: Map<string, CachedPerf>; indexPerf: CachedPerf; failed: number },
    fromCache: boolean,
  ) => {
    const snapshot = assembleSnapshotFromPerfs(parsed.stockPerfs, parsed.indexPerf)
    persist(parsed.stockPerfs, parsed.indexPerf)
    onProgress?.({
      done: total,
      total,
      phase: 'done',
      loaded: parsed.stockPerfs.size,
      remaining: 0,
    })
    onPartial?.(snapshot, parsed.stockPerfs.size, parsed.failed)
    return {
      snapshot,
      fromCache,
      loaded: parsed.stockPerfs.size,
      failed: parsed.failed,
      source: 'server-sqlite' as const,
    }
  }

  const tryServer = async (acceptStale: boolean) => {
    const json = await fetchServerSnapshotJson(signal, onProgress, total)
    if (!json) return null
    const parsed = parseServerSnapshot(json, tickers, config, acceptStale)
    if (!parsed) return null
    return finishFromServer(parsed, !forceRefresh)
  }

  if (!forceRefresh) {
    onProgress?.({ done: 0, total, phase: 'cache', loaded: 0, remaining: tickers.length })
    const got = await tryServer(true)
    if (got) return got
  }

  if (!config.browserUniverseFetch) {
    if (forceRefresh && config.isAdmin) {
      await fetch('/api/snapshot/refresh?force=1', {
        method: 'POST',
        credentials: 'include',
        signal,
      })
    } else if (!forceRefresh) {
      maybeStartBackgroundSnapshotClient()
    }
    onProgress?.({ done: 0, total, phase: 'cache', loaded: 0, remaining: tickers.length })
    const waited = await waitForServerSnapshotJob(signal, onProgress, total, () => tryServer(true))
    if (waited) return waited
    const got = await tryServer(true)
    if (got) return got
    throw new Error(
      'Server snapshot is still building. Wait a few minutes and reload — browser universe fetch is disabled in production mode.',
    )
  }

  // Dev / local fallback: progressive browser fetch (never used when productionMode)
  if (!await probeDeskApi(signal)) {
    throw new Error(
      `Desk API is not available on ${window.location.origin} (GET /api/health failed or timed out). Stop other dev servers on this port and run npm run dev, or use npm run build && npm start. The app needs the Node API — not vite preview alone.`,
    )
  }

  const stockPerfs = new Map<string, CachedPerf>()
  let indexPerf: CachedPerf | null = null
  let fromCache = false

  if (!forceRefresh) {
    const cached = loadPerfCache()
    if (cached?.index) {
      indexPerf = cached.index
      for (const t of tickers) {
        if (cached.stocks[t]) stockPerfs.set(t, cached.stocks[t])
      }
      fromCache = stockPerfs.size > 0
      if (stockPerfs.size > 0) {
        onPartial?.(assembleSnapshotFromPerfs(stockPerfs, indexPerf), stockPerfs.size, 0)
      }
      // If we already have nearly everything, stop here
      if (stockPerfs.size >= tickers.length * 0.92) {
        onProgress?.({ done: total, total, phase: 'done', loaded: stockPerfs.size, remaining: 0 })
        return {
          snapshot: assembleSnapshotFromPerfs(stockPerfs, indexPerf),
          fromCache: true,
          loaded: stockPerfs.size,
          failed: tickers.length - stockPerfs.size,
          source: 'browser-yahoo',
        }
      }
    }
  }

  onProgress?.({
    done: stockPerfs.size,
    total,
    phase: 'fetch',
    loaded: stockPerfs.size,
    remaining: tickers.length - stockPerfs.size,
  })

  if (signal?.aborted) throw new Error('Aborted')

  if (!indexPerf) {
    const indexSeries = await fetchYahooSeries(INDEX_SYMBOL, '5y')
    if (!indexSeries) {
      throw new Error('Could not load ASX200 (^AXJO). Is the dev server running?')
    }
    const indexM3 = returnOver(indexSeries.closes, 63) ?? 0
    indexPerf = seriesToCachedPerf(indexSeries, indexM3)
  }

  const indexM3 = indexPerf.m3
  const missing = tickers.filter((t) => !stockPerfs.has(t))
  let failed = 0
  let lastPartialAt = stockPerfs.size
  const PARTIAL_EVERY = 50

  // Lower concurrency to avoid Yahoo throttling after ~100 calls
  await mapPool(
    missing,
    4,
    async (ticker) => {
      if (signal?.aborted) return ticker
      const series = await fetchYahooSeries(ticker, '2y')
      if (series) {
        stockPerfs.set(ticker, seriesToCachedPerf(series, indexM3))
      } else {
        failed++
      }
      return ticker
    },
    (d) => {
      void d
      if (signal?.aborted) return
      const loaded = stockPerfs.size
      onProgress?.({
        done: 1 + stockPerfs.size + failed,
        total,
        phase: 'fetch',
        partial: true,
        loaded,
        remaining: tickers.length - loaded,
      })
      if (onPartial && loaded - lastPartialAt >= PARTIAL_EVERY) {
        lastPartialAt = loaded
        onPartial(assembleSnapshotFromPerfs(stockPerfs, indexPerf!), loaded, failed)
        persist(stockPerfs, indexPerf!)
      }
    },
  )

  if (signal?.aborted) throw new Error('Aborted')

  persist(stockPerfs, indexPerf)
  onProgress?.({ done: total, total, phase: 'compute', loaded: stockPerfs.size, remaining: 0 })
  const snapshot = assembleSnapshotFromPerfs(stockPerfs, indexPerf)
  onProgress?.({ done: total, total, phase: 'done', loaded: stockPerfs.size, remaining: 0 })
  onPartial?.(snapshot, stockPerfs.size, failed)

  return {
    snapshot,
    fromCache: fromCache && missing.length === 0,
    loaded: stockPerfs.size,
    failed: tickers.length - stockPerfs.size,
    source: 'browser-yahoo',
  }
}

/** Hint server to start background snapshot when GET /api/snapshot returns 404. */
function maybeStartBackgroundSnapshotClient() {
  void fetch('/api/snapshot', { credentials: 'include' }).catch(() => {})
}
