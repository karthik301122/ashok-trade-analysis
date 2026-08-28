import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchYahooOhlc } from '../../lib/yahoo'
import { detectAllCustomRules, filterHitsByWindow, scanPatterns } from '../../lib/patterns'
import { cacheMissingStartT, getTickerPatternHits } from '../../lib/patternHitsCache'
import { hasOverviewChartWatch } from '../../lib/overviewPatternHits'
import { usePatternPrefs } from './usePatternPrefs'

const CONCURRENCY = 2
/** Re-scan if older than 12h or scan window changed */
const STALE_MS = 12 * 60 * 60 * 1000

/**
 * When industries expand, quietly scan visible tickers for chart patterns
 * so starred + My Pattern hits show on the Sector Table overview.
 */
export function useIndustryPatternScan(tickers: string[], enabled: boolean) {
  const { rememberHits, prefs, hitsScanEpoch } = usePatternPrefs()
  const [scanning, setScanning] = useState(false)
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)
  const queueGen = useRef(0)
  const tickerKey = useMemo(() => [...new Set(tickers)].sort().join(','), [tickers])

  useEffect(() => {
    const list = tickerKey ? tickerKey.split(',') : []
    const watch = hasOverviewChartWatch(prefs)
    if (!enabled || !watch || list.length === 0) {
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
        cached.scanWindow !== prefs.scanWindow ||
        cacheMissingStartT(cached)
      )
    })

    if (!need.length) {
      setScanning(false)
      setDone(0)
      setTotal(0)
      return
    }

    let cancelled = false
    let idx = 0
    let finished = 0
    setScanning(true)
    setDone(0)
    setTotal(need.length)

    const worker = async () => {
      while (!cancelled && gen === queueGen.current) {
        const i = idx++
        if (i >= need.length) break
        const ticker = need[i]
        try {
          const ohlc = await fetchYahooOhlc(ticker)
          if (cancelled || gen !== queueGen.current) return
          if (ohlc?.length) {
            const result = scanPatterns(ohlc, { window: prefs.scanWindow })
            const customHits = result.asOf
              ? filterHitsByWindow(
                  detectAllCustomRules(ohlc, prefs.customPatterns),
                  prefs.scanWindow,
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
              { scanWindow: prefs.scanWindow, asOf: result.asOf },
            )
          }
        } catch {
          /* skip failed ticker */
        }
        finished++
        if (!cancelled && gen === queueGen.current) setDone(finished)
      }
    }

    void (async () => {
      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
      if (!cancelled && gen === queueGen.current) setScanning(false)
    })()

    return () => {
      cancelled = true
    }
  }, [tickerKey, enabled, prefs, rememberHits, hitsScanEpoch])

  return { scanning, done, total }
}
