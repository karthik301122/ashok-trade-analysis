import { useEffect, useMemo, useRef, useState } from 'react'
import type { StockMetrics } from '../../data/types'
import { fetchYahooOhlcForPatternScan } from '../../lib/yahoo'
import { karthikPatternHit, type KarthikPatternId } from '../../lib/patterns/karthikWeekly'
import { KARTHIK_WEEKLY_PATTERNS } from '../../lib/patterns/specialCatalog'
import {
  getTickerWeeklySpecial,
  setManyTickerWeeklySpecial,
  type WeeklySpecialHit,
} from '../../lib/specialWeeklyCache'

const CONCURRENCY = 6
const STALE_MS = 12 * 60 * 60 * 1000
const BATCH_WRITE = 30
const UI_TICK = 15

const PATTERN_IDS = KARTHIK_WEEKLY_PATTERNS.map((p) => p.id as KarthikPatternId)

/**
 * Background scan of weekly Karthik patterns across the loaded universe.
 * Uses daily OHLC resampled to weekly bars.
 */
export function useKarthikWeeklyScan(stocks: StockMetrics[], enabled: boolean) {
  const [scanning, setScanning] = useState(false)
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)
  const [version, setVersion] = useState(0)
  const gen = useRef(0)

  const tickerKey = useMemo(
    () => stocks.map((s) => s.ticker).sort().join(','),
    [stocks],
  )

  const stockByTicker = useMemo(() => {
    const m = new Map<string, StockMetrics>()
    for (const s of stocks) m.set(s.ticker.toUpperCase(), s)
    return m
  }, [stocks])

  useEffect(() => {
    const list = tickerKey ? tickerKey.split(',') : []
    if (!enabled || list.length === 0) {
      setScanning(false)
      setDone(0)
      setTotal(0)
      return
    }

    const g = ++gen.current
    const now = Date.now()
    const need = list.filter((t) => {
      const c = getTickerWeeklySpecial(t)
      return !c || now - c.updatedAt > STALE_MS
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
    const pendingWrites: Record<string, WeeklySpecialHit[]> = {}

    const flushWrites = () => {
      if (!Object.keys(pendingWrites).length) return
      setManyTickerWeeklySpecial(pendingWrites)
      for (const k of Object.keys(pendingWrites)) delete pendingWrites[k]
      setVersion((v) => v + 1)
    }

    setScanning(true)
    setDone(0)
    setTotal(need.length)

    const worker = async () => {
      while (!cancelled && g === gen.current) {
        const i = idx++
        if (i >= need.length) break
        const ticker = need[i]
        const meta = stockByTicker.get(ticker.toUpperCase())
        try {
          const ohlc = await fetchYahooOhlcForPatternScan(ticker)
          if (cancelled || g !== gen.current) return
          if (ohlc?.length && meta) {
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
            pendingWrites[ticker.toUpperCase()] = hits
            if (Object.keys(pendingWrites).length >= BATCH_WRITE) flushWrites()
          }
        } catch {
          /* skip */
        }
        finished++
        if (!cancelled && g === gen.current && (finished % UI_TICK === 0 || finished === need.length)) {
          setDone(finished)
        }
      }
    }

    void (async () => {
      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
      if (!cancelled && g === gen.current) {
        flushWrites()
        setDone(need.length)
        setScanning(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [tickerKey, enabled, stockByTicker])

  return { scanning, done, total, version }
}
