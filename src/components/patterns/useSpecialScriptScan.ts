import { useEffect, useMemo, useRef, useState } from 'react'
import type { StockMetrics } from '../../data/types'
import { SPECIAL_PATTERN_CATALOG } from '../../lib/patterns/specialCatalog'
import { scanOhlcForSpecialPatterns } from '../../lib/patterns/specialScriptScan'
import { getTickerScriptScan, setManyTickerScriptScan } from '../../lib/specialScriptCache'
import type { ScriptScanHit } from '../../lib/specialScriptCache'
import { fetchYahooOhlcForPatternScan } from '../../lib/yahoo'

const CONCURRENCY = 6
const STALE_MS = 12 * 60 * 60 * 1000
const BATCH_WRITE = 30
const UI_TICK = 15
const INDEX_SYMBOL = '^AXJO'

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
      let indexOhlc: Awaited<ReturnType<typeof fetchYahooOhlcForPatternScan>> = null
      let indexReturn5 = 0
      let indexReturn20 = 0
      try {
        indexOhlc = await fetchYahooOhlcForPatternScan(INDEX_SYMBOL)
        const idx = indexOhlc ?? []
        if (!cancelled && g === gen.current && idx.length > 21) {
          const a = idx[idx.length - 1].c
          const b20 = idx[idx.length - 1 - 20].c
          const b5 = idx[idx.length - 1 - 5].c
          indexReturn20 = b20 ? ((a - b20) / b20) * 100 : 0
          indexReturn5 = b5 ? ((a - b5) / b5) * 100 : 0
        }
      } catch {
        /* index optional */
      }

      const indexCtx = {
        indexBars: indexOhlc ?? undefined,
        indexReturn5,
        indexReturn20,
      }

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
      const pendingWrites: Record<string, ScriptScanHit[]> = {}

      const flushWrites = () => {
        if (!Object.keys(pendingWrites).length) return
        setManyTickerScriptScan(pendingWrites)
        for (const k of Object.keys(pendingWrites)) delete pendingWrites[k]
        setVersion((v) => v + 1)
      }

      setScanning(true)
      setDone(0)
      setTotal(needFresh.length)

      const worker = async () => {
        while (!cancelled && g === gen.current) {
          const i = idx++
          if (i >= needFresh.length) break
          const ticker = needFresh[i]
          try {
            const ohlc = await fetchYahooOhlcForPatternScan(ticker)
            if (cancelled || g !== gen.current) return
            if (ohlc?.length) {
              const scanned = scanOhlcForSpecialPatterns(ohlc, SCAN_PATTERNS, {
                launchpad: indexCtx,
                landscape: indexCtx,
              })
              pendingWrites[ticker.toUpperCase()] = scanned.map((s) => ({
                patternId: s.patternId,
                startT: s.hit.startT,
                endT: s.hit.endT,
              }))
              if (Object.keys(pendingWrites).length >= BATCH_WRITE) flushWrites()
            }
          } catch {
            /* skip */
          }
          finished++
          if (!cancelled && g === gen.current && (finished % UI_TICK === 0 || finished === needFresh.length)) {
            setDone(finished)
          }
        }
      }

      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
      if (!cancelled && g === gen.current) {
        flushWrites()
        setDone(needFresh.length)
        setScanning(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [tickerKey, enabled])

  return { scanning, done, total, version }
}
