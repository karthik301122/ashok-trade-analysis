import { useEffect, useMemo, useRef, useState } from 'react'
import type { StockMetrics } from '../../data/types'
import { SPECIAL_PATTERN_CATALOG } from '../../lib/patterns/specialCatalog'
import { scanOhlcForSpecialPatterns } from '../../lib/patterns/specialScriptScan'
import { getTickerScriptScan, setTickerScriptScan } from '../../lib/specialScriptCache'
import { fetchYahooOhlc } from '../../lib/yahoo'

const CONCURRENCY = 2
const STALE_MS = 12 * 60 * 60 * 1000

const SCAN_PATTERNS = SPECIAL_PATTERN_CATALOG.filter((p) => p.kind === 'scan')

/**
 * Background ScanScript special-pattern scan (VCP setup / breakout on daily OHLC).
 */
export function useSpecialScriptScan(stocks: StockMetrics[], enabled: boolean) {
  const [scanning, setScanning] = useState(false)
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)
  const [version, setVersion] = useState(0)
  const gen = useRef(0)

  const tickerKey = useMemo(
    () => stocks.map((s) => s.ticker).sort().join(','),
    [stocks],
  )

  useEffect(() => {
    const list = tickerKey ? tickerKey.split(',') : []
    if (!enabled || list.length === 0 || SCAN_PATTERNS.length === 0) {
      setScanning(false)
      setDone(0)
      setTotal(0)
      return
    }

    const g = ++gen.current
    const now = Date.now()
    let cancelled = false

    void (async () => {
      const needFresh = list.filter((t) => {
        const c = getTickerScriptScan(t)
        return !c || now - c.updatedAt > STALE_MS
      })

      if (!needFresh.length) {
        if (!cancelled && g === gen.current) {
          setScanning(false)
          setDone(0)
          setTotal(0)
        }
        return
      }

      let idx = 0
      let finished = 0
      setScanning(true)
      setDone(0)
      setTotal(needFresh.length)

      const worker = async () => {
        while (!cancelled && g === gen.current) {
          const i = idx++
          if (i >= needFresh.length) break
          const ticker = needFresh[i]
          try {
            const ohlc = await fetchYahooOhlc(ticker)
            if (cancelled || g !== gen.current) return
            if (ohlc?.length) {
              const scanned = scanOhlcForSpecialPatterns(ohlc, SCAN_PATTERNS)
              setTickerScriptScan(
                ticker,
                scanned.map((s) => ({
                  patternId: s.patternId,
                  startT: s.hit.startT,
                  endT: s.hit.endT,
                })),
              )
            }
          } catch {
            /* skip */
          }
          finished++
          if (!cancelled && g === gen.current) {
            setDone(finished)
            setVersion((v) => v + 1)
          }
        }
      }

      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
      if (!cancelled && g === gen.current) setScanning(false)
    })()

    return () => {
      cancelled = true
    }
  }, [tickerKey, enabled])

  return { scanning, done, total, version }
}
