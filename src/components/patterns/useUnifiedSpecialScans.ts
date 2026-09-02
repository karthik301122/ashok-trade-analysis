import { useEffect, useMemo, useRef, useState } from 'react'
import type { StockMetrics } from '../../data/types'
import { fetchYahooOhlcForPatternScan } from '../../lib/yahoo'
import { karthikPatternHit, type KarthikPatternId } from '../../lib/patterns/karthikWeekly'
import { KARTHIK_WEEKLY_PATTERNS, SPECIAL_PATTERN_CATALOG } from '../../lib/patterns/specialCatalog'
import {
  getTickerWeeklySpecial,
  setManyTickerWeeklySpecial,
  type WeeklySpecialHit,
} from '../../lib/specialWeeklyCache'
import { getTickerLivermore, setManyTickerLivermore } from '../../lib/livermoreCache'
import { computeLivermoreScores } from '../../lib/patterns/livermoreScores'
import type { LivermoreScores } from '../../lib/patterns/livermoreScores'
import { getTickerScriptScan, setManyTickerScriptScan } from '../../lib/specialScriptCache'
import type { ScriptScanHit } from '../../lib/specialScriptCache'
import { scanOhlcForSpecialPatterns } from '../../lib/patterns/specialScriptScan'
import { collectOhlcPatternUploadRows, collectSnapshotPatternUploadRows } from '../../lib/patterns/patternAlertScores'
import { postPatternScanBatch, type PatternScanUploadRow } from '../../lib/patternScanApi'

const CONCURRENCY = 6
const STALE_MS = 12 * 60 * 60 * 1000
const BATCH_WRITE = 25
const UI_TICK = 15
const FLUSH_DEBOUNCE_MS = 400
const INDEX_SYMBOL = '^AXJO'

const PATTERN_IDS = KARTHIK_WEEKLY_PATTERNS.map((p) => p.id as KarthikPatternId)
const SCAN_PATTERNS = SPECIAL_PATTERN_CATALOG.filter((p) => p.kind === 'scan')

function isStale(updatedAt: number | undefined, now: number) {
  return !updatedAt || now - updatedAt > STALE_MS
}

/**
 * One OHLC fetch per ticker, then weekly + Livermore + ScanScript in the same worker.
 * Replaces three staggered scans that each walked the full universe.
 */
export function useUnifiedSpecialScans(
  stocks: StockMetrics[],
  enabled: boolean,
  indexM3 = 0,
) {
  const [scanning, setScanning] = useState(false)
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)
  const [weeklyVersion, setWeeklyVersion] = useState(0)
  const [livermoreVersion, setLivermoreVersion] = useState(0)
  const [scriptVersion, setScriptVersion] = useState(0)
  const gen = useRef(0)

  const tickerKey = useMemo(() => {
    if (!stocks.length) return ''
    return `${stocks.length}:${stocks[0]?.ticker ?? ''}:${stocks[stocks.length - 1]?.ticker ?? ''}`
  }, [stocks.length, stocks[0]?.ticker, stocks[stocks.length - 1]?.ticker])

  const stockByTicker = useMemo(() => {
    const m = new Map<string, StockMetrics>()
    for (const s of stocks) m.set(s.ticker.toUpperCase(), s)
    return m
  }, [stocks])

  const stockByTickerRef = useRef(stockByTicker)
  stockByTickerRef.current = stockByTicker

  useEffect(() => {
    const list = stocks.map((s) => s.ticker)
    if (!enabled || list.length === 0) {
      setScanning(false)
      setDone(0)
      setTotal(0)
      return
    }

    const g = ++gen.current
    const now = Date.now()
    let cancelled = false
    let flushTimer: ReturnType<typeof setTimeout> | null = null

    const need = list.filter((t) => {
      const key = t.toUpperCase()
      const w = getTickerWeeklySpecial(key)
      const l = getTickerLivermore(key)
      const s = getTickerScriptScan(key)
      return (
        isStale(w?.updatedAt, now) ||
        isStale(l?.updatedAt, now) ||
        isStale(s?.updatedAt, now)
      )
    })

    if (!need.length) {
      setScanning(false)
      setDone(0)
      setTotal(0)
      return
    }

    void (async () => {
      let indexReturn20 = 0
      let indexReturn5 = 0
      let indexOhlc: Awaited<ReturnType<typeof fetchYahooOhlcForPatternScan>> = null
      try {
        indexOhlc = await fetchYahooOhlcForPatternScan(INDEX_SYMBOL)
        const idxCloses = indexOhlc ?? []
        if (!cancelled && g === gen.current && idxCloses.length > 21) {
          const a = idxCloses[idxCloses.length - 1].c
          const b20 = idxCloses[idxCloses.length - 1 - 20].c
          const b5 = idxCloses[idxCloses.length - 1 - 5].c
          indexReturn20 = b20 ? ((a - b20) / b20) * 100 : 0
          indexReturn5 = b5 ? ((a - b5) / b5) * 100 : 0
        }
      } catch {
        indexReturn20 = 0
        indexReturn5 = 0
      }

      const indexCtx = {
        indexBars: indexOhlc ?? undefined,
        indexReturn5,
        indexReturn20,
      }

      let idx = 0
      let finished = 0
      const pendingWeekly: Record<string, WeeklySpecialHit[]> = {}
      const pendingLivermore: Record<string, LivermoreScores> = {}
      const pendingScript: Record<string, ScriptScanHit[]> = {}
      const pendingPatternUpload: PatternScanUploadRow[] = []

      const flushWrites = () => {
        if (flushTimer) {
          clearTimeout(flushTimer)
          flushTimer = null
        }
        let bumpedWeekly = false
        let bumpedLivermore = false
        let bumpedScript = false
        if (Object.keys(pendingWeekly).length) {
          setManyTickerWeeklySpecial(pendingWeekly)
          for (const k of Object.keys(pendingWeekly)) delete pendingWeekly[k]
          bumpedWeekly = true
        }
        if (Object.keys(pendingLivermore).length) {
          setManyTickerLivermore(pendingLivermore)
          for (const k of Object.keys(pendingLivermore)) delete pendingLivermore[k]
          bumpedLivermore = true
        }
        if (Object.keys(pendingScript).length) {
          setManyTickerScriptScan(pendingScript)
          for (const k of Object.keys(pendingScript)) delete pendingScript[k]
          bumpedScript = true
        }
        if (bumpedWeekly) setWeeklyVersion((v) => v + 1)
        if (bumpedLivermore) setLivermoreVersion((v) => v + 1)
        if (bumpedScript) setScriptVersion((v) => v + 1)
        if (pendingPatternUpload.length) {
          const chunk = pendingPatternUpload.splice(0, pendingPatternUpload.length)
          void postPatternScanBatch(chunk)
        }
      }

      const scheduleFlush = () => {
        if (flushTimer) return
        flushTimer = setTimeout(() => {
          flushTimer = null
          if (!cancelled && g === gen.current) flushWrites()
        }, FLUSH_DEBOUNCE_MS)
      }

      setScanning(true)
      setDone(0)
      setTotal(need.length)

      const worker = async () => {
        while (!cancelled && g === gen.current) {
          const i = idx++
          if (i >= need.length) break
          const ticker = need[i]
          const key = ticker.toUpperCase()
          const meta = stockByTickerRef.current.get(key)
          const needWeekly = isStale(getTickerWeeklySpecial(key)?.updatedAt, now)
          const needLivermore = isStale(getTickerLivermore(key)?.updatedAt, now)
          const needScript = isStale(getTickerScriptScan(key)?.updatedAt, now)

          try {
            const ohlc = await fetchYahooOhlcForPatternScan(ticker)
            if (cancelled || g !== gen.current) return
            if (!ohlc?.length) continue

            let lmScores: LivermoreScores | null = null
            if (needLivermore && meta) {
              lmScores = computeLivermoreScores(ohlc, {
                indexReturn20,
                from52wHigh: meta.from52wHigh,
                relativeVolume: meta.relativeVolume ?? 0,
                rsRating: meta.rs ?? 0,
              })
              if (lmScores) pendingLivermore[key] = lmScores
            }

            const runOhlcAlerts =
              meta && (needWeekly || needLivermore || needScript)
            if (runOhlcAlerts) {
              const scanned =
                needScript && SCAN_PATTERNS.length
                  ? scanOhlcForSpecialPatterns(ohlc, SCAN_PATTERNS, {
                      launchpad: indexCtx,
                      landscape: indexCtx,
                    })
                  : []
              if (needScript && SCAN_PATTERNS.length) {
                const lastT = ohlc[ohlc.length - 1].t
                pendingScript[key] = scanned
                  .filter((s) => s.score >= 60)
                  .map((s) => ({
                    patternId: s.patternId,
                    startT: s.hit?.startT ?? lastT,
                    endT: s.hit?.endT ?? lastT,
                    score: s.score,
                    confirmed: s.confirmed,
                  }))
              }
              pendingPatternUpload.push(
                ...collectOhlcPatternUploadRows(
                  key,
                  ohlc,
                  lmScores,
                  {
                    from52wHigh: meta.from52wHigh,
                    relativeVolume: meta.relativeVolume ?? 0,
                  },
                  { launchpad: indexCtx, landscape: indexCtx },
                  scanned,
                ),
              )
            }

            if (needWeekly && meta) {
              const hits: WeeklySpecialHit[] = []
              for (const pid of PATTERN_IDS) {
                const r = karthikPatternHit(ohlc, pid)
                if (r.hit) {
                  hits.push({
                    patternId: pid,
                    ticker: meta.ticker,
                    name: meta.name,
                    sector: meta.sector,
                    industry: meta.industry,
                    rs: meta.rs,
                    relativeVolume: meta.relativeVolume,
                    tightness: r.tightness,
                    weekStartT: r.weekStartT,
                    weekEndT: r.weekEndT,
                  })
                }
              }
              pendingWeekly[key] = hits
            }
          } catch {
            /* skip ticker */
          }

          const pendingCount =
            Object.keys(pendingWeekly).length +
            Object.keys(pendingLivermore).length +
            Object.keys(pendingScript).length
          if (pendingCount >= BATCH_WRITE || pendingPatternUpload.length >= 200) {
            scheduleFlush()
          }

          finished++
          if (!cancelled && g === gen.current && (finished % UI_TICK === 0 || finished === need.length)) {
            setDone(finished)
          }
        }
      }

      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
      if (!cancelled && g === gen.current) {
        flushWrites()
        const snapshotRows = collectSnapshotPatternUploadRows(
          Array.from(stockByTickerRef.current.values()),
          indexM3,
        )
        if (snapshotRows.length) {
          void postPatternScanBatch(snapshotRows)
        }
        setDone(need.length)
        setScanning(false)
      }
    })()

    return () => {
      cancelled = true
      if (flushTimer) clearTimeout(flushTimer)
    }
  }, [tickerKey, stocks, enabled, indexM3])

  return {
    scanning,
    done,
    total,
    weeklyScanning: scanning,
    weeklyDone: done,
    weeklyTotal: total,
    livermoreScanning: scanning,
    livermoreDone: done,
    livermoreTotal: total,
    scriptScanning: scanning,
    scriptDone: done,
    scriptTotal: total,
    version: weeklyVersion,
    livermoreVersion,
    scriptScanVersion: scriptVersion,
  }
}
