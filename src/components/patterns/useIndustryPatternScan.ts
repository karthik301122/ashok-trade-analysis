import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchYahooOhlc } from '../../lib/yahoo'
import { detectAllCustomRules, filterHitsByWindow, scanPatterns } from '../../lib/patterns'
import { getTickerPatternHits } from '../../lib/patternHitsCache'
import { usePatternPrefs } from './PatternPrefsContext'

const CONCURRENCY = 2
/** Re-scan if older than 12h */
const STALE_MS = 12 * 60 * 60 * 1000

/**
 * When industries expand, quietly scan visible tickers for patterns
 * so starred results can show next to stock names.
 */
export function useIndustryPatternScan(tickers: string[], enabled: boolean) {
  const { rememberHits, prefs } = usePatternPrefs()
  const [scanning, setScanning] = useState(false)
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)
  const queueGen = useRef(0)
  const tickerKey = useMemo(() => [...new Set(tickers)].sort().join(','), [tickers])

  useEffect(() => {
    const list = tickerKey ? tickerKey.split(',') : []
    if (!enabled || prefs.starredNames.length === 0 || list.length === 0) {
      setScanning(false)
      setDone(0)
      setTotal(0)
      return
    }

    const gen = ++queueGen.current
    const now = Date.now()
    const need = list.filter((t) => {
      const cached = getTickerPatternHits(t)
      return !cached || now - cached.updatedAt > STALE_MS
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
              ? filterHitsByWindow(detectAllCustomRules(ohlc, prefs.customPatterns), prefs.scanWindow, result.asOf)
              : []
            rememberHits(
              ticker,
              [...result.hits, ...customHits].map((h) => ({
                name: h.name,
                bias: h.bias,
                endT: h.endT,
                confidence: h.confidence,
              })),
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
  }, [tickerKey, enabled, prefs.starredNames.length, prefs.customPatterns, prefs.scanWindow, rememberHits])

  return { scanning, done, total }
}
