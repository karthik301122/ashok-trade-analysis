import { useEffect, useMemo, useRef, useState } from 'react'
import type { StockMetrics } from '../../data/types'
import { getTickerLivermore, setTickerLivermore } from '../../lib/livermoreCache'
import { fetchYahooOhlc, fetchYahooSeries } from '../../lib/yahoo'
import { computeLivermoreScores } from '../../lib/patterns/livermoreScores'

const CONCURRENCY = 2
const STALE_MS = 12 * 60 * 60 * 1000
const INDEX_SYMBOL = '^AXJO'

/**
 * Background Livermore score scan (daily OHLC + index 20d return).
 */
export function useLivermoreScan(stocks: StockMetrics[], enabled: boolean) {
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
    let cancelled = false

    void (async () => {
      let indexReturn20 = 0
      try {
        const indexSeries = await fetchYahooSeries(INDEX_SYMBOL, '6mo')
        if (!cancelled && g === gen.current) {
          const idxCloses = indexSeries?.closes ?? []
          if (idxCloses.length > 21) {
            const a = idxCloses[idxCloses.length - 1].c
            const b = idxCloses[idxCloses.length - 1 - 20].c
            indexReturn20 = b ? ((a - b) / b) * 100 : 0
          }
        }
      } catch {
        indexReturn20 = 0
      }

      const needFresh = list.filter((t) => {
        const c = getTickerLivermore(t)
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
          const meta = stockByTicker.get(ticker.toUpperCase())
          try {
            const ohlc = await fetchYahooOhlc(ticker)
            if (cancelled || g !== gen.current) return
            if (ohlc?.length && meta) {
              const scores = computeLivermoreScores(ohlc, {
                indexReturn20,
                from52wHigh: meta.from52wHigh,
                relativeVolume: meta.relativeVolume ?? 0,
                rsRating: meta.rs ?? 0,
              })
              if (scores) setTickerLivermore(ticker, scores)
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
  }, [tickerKey, enabled, stockByTicker])

  return { scanning, done, total, version }
}
