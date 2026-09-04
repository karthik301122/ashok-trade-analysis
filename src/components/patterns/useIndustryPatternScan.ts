import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchDeskOhlcForPatternScan } from '../../lib/deskSeries'
import { postPatternScanBatch, type PatternScanUploadRow } from '../../lib/patternScanApi'
import { detectAllCustomRules, filterHitsByWindow, scanPatterns } from '../../lib/patterns'
import {
  collectAlertWatchUploadRows,
  collectWatchPatternUploadRows,
} from '../../lib/patterns/watchPatternAlertUpload'
import type { PatternAlertWatch } from '../../lib/patterns/patternAlertWatches'
import { cacheMissingStartT, getTickerPatternHits } from '../../lib/patternHitsCache'
import { hasOverviewChartWatch } from '../../lib/overviewPatternHits'
import { usePatternPrefs } from './usePatternPrefs'

const SCAN_CAP = import.meta.env.PROD ? 60 : 500
const UPLOAD_BATCH = 50
/** Re-scan if older than 12h or scan window changed */
const STALE_MS = 12 * 60 * 60 * 1000

/**
 * When industries expand (or full universe for alerts), scan tickers for chart patterns
 * so starred + My Pattern hits show on the Sector Table and upload alert scores.
 */
export function useIndustryPatternScan(
  tickers: string[],
  enabled: boolean,
  fullUniverse = false,
  alertWatches: PatternAlertWatch[] = [],
) {
  const { rememberHits, prefs, hitsScanEpoch } = usePatternPrefs()
  const scanWindow = prefs.scanWindow
  const customPatterns = prefs.customPatterns
  const starredNames = prefs.starredNames
  const chartWatch = hasOverviewChartWatch(prefs) || alertWatches.length > 0
  const watchByTicker = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const w of alertWatches) {
      m.set(w.ticker.toUpperCase(), w.patternIds)
    }
    return m
  }, [alertWatches])
  const [scanning, setScanning] = useState(false)
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)
  const queueGen = useRef(0)
  const tickerScanKey = useMemo(() => {
    const unique = [...new Set(tickers)]
    if (!unique.length) return ''
    if (unique.length <= 80) return unique.sort().join(',')
    return `${unique.length}:${unique[0]}:${unique[unique.length - 1]}`
  }, [tickers])
  const concurrency = fullUniverse
    ? import.meta.env.PROD
      ? 4
      : 6
    : import.meta.env.PROD
      ? 1
      : 2

  useEffect(() => {
    const list = [...new Set(tickers)]
    if (!enabled || !chartWatch || list.length === 0) {
      setScanning(false)
      setDone(0)
      setTotal(0)
      return
    }

    const gen = ++queueGen.current
    const now = Date.now()
    const need = list.filter((t) => {
      const cached = getTickerPatternHits(t)
      return (
        !cached ||
        now - cached.updatedAt > STALE_MS ||
        cached.scanWindow !== scanWindow ||
        cacheMissingStartT(cached)
      )
    })

    const scanList = fullUniverse ? need : need.slice(0, SCAN_CAP)

    if (!scanList.length) {
      setScanning(false)
      setDone(0)
      setTotal(0)
      return
    }

    let cancelled = false
    let idx = 0
    let finished = 0
    const pendingUpload: PatternScanUploadRow[] = []

    const flushUpload = () => {
      if (!pendingUpload.length) return
      const chunk = pendingUpload.splice(0, pendingUpload.length)
      void postPatternScanBatch(chunk)
    }

    setScanning(true)
    setDone(0)
    setTotal(scanList.length)

    const worker = async () => {
      while (!cancelled && gen === queueGen.current) {
        const i = idx++
        if (i >= scanList.length) break
        const ticker = scanList[i]
        try {
          const ohlc = await fetchDeskOhlcForPatternScan(ticker)
          if (cancelled || gen !== queueGen.current) return
          if (ohlc?.length) {
            const result = scanPatterns(ohlc, { window: scanWindow })
            const customHits = result.asOf
              ? filterHitsByWindow(
                  detectAllCustomRules(ohlc, customPatterns),
                  scanWindow,
                  result.asOf,
                )
              : []
            rememberHits(
              ticker,
              [...result.hits, ...customHits].map((h) => ({
                name: h.name,
                bias: h.bias,
                startT: h.startT,
                endT: h.endT,
                confidence: h.confidence,
              })),
              { scanWindow, asOf: result.asOf },
            )
            pendingUpload.push(
              ...collectWatchPatternUploadRows(ticker, prefs, result.hits, customHits),
              ...collectAlertWatchUploadRows(
                ticker,
                watchByTicker.get(ticker.toUpperCase()) ?? [],
                result.hits,
                customHits,
                prefs,
              ),
            )
            if (pendingUpload.length >= UPLOAD_BATCH) flushUpload()
          }
        } catch {
          /* skip failed ticker */
        }
        finished++
        if (
          !cancelled &&
          gen === queueGen.current &&
          (finished % 12 === 0 || finished === scanList.length)
        ) {
          setDone(finished)
        }
      }
    }

    void (async () => {
      await Promise.all(Array.from({ length: concurrency }, () => worker()))
      if (!cancelled && gen === queueGen.current) {
        flushUpload()
        setScanning(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    tickerScanKey,
    tickers,
    enabled,
    fullUniverse,
    chartWatch,
    watchByTicker,
    alertWatches,
    scanWindow,
    customPatterns,
    starredNames,
    rememberHits,
    hitsScanEpoch,
    concurrency,
  ])

  return { scanning, done, total }
}
