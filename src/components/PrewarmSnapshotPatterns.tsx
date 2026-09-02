import { useEffect } from 'react'
import type { MarketSnapshot } from '../data/types'
import { scanAllSpecialPatterns } from '../lib/patterns/specialDetect'

/**
 * Warms snapshot pattern counts in idle time so the Patterns tab paints instantly.
 */
export function PrewarmSnapshotPatterns({ snapshot }: { snapshot: MarketSnapshot }) {
  const indexM3 = snapshot.benchmarkPerf.m3
  const stockKey = `${snapshot.stocks.length}:${snapshot.stocks[0]?.ticker ?? ''}:${snapshot.stocks[snapshot.stocks.length - 1]?.ticker ?? ''}`

  useEffect(() => {
    let cancelled = false
    const run = () => {
      if (cancelled) return
      scanAllSpecialPatterns(snapshot.stocks, indexM3)
    }
    if (typeof requestIdleCallback !== 'undefined') {
      const id = requestIdleCallback(run, { timeout: 6000 })
      return () => {
        cancelled = true
        cancelIdleCallback(id)
      }
    }
    const id = window.setTimeout(run, 2500)
    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
  }, [snapshot.stocks, stockKey, indexM3])

  return null
}
