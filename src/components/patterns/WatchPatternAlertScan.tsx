import { useMemo } from 'react'
import type { MarketSnapshot } from '../../data/types'
import type { PatternAlertWatch } from '../../lib/patterns/patternAlertWatches'
import { useIndustryPatternScan } from './useIndustryPatternScan'

/**
 * Background scan for alert targets — only the user's watched tickers.
 * Never crawls the full ASX universe (that caused Patterns to freeze on 503s).
 */
export function WatchPatternAlertScan({
  snapshot: _snapshot,
  paused = false,
  alertWatches = [],
}: {
  snapshot: MarketSnapshot
  paused?: boolean
  alertWatches?: PatternAlertWatch[]
}) {
  void _snapshot
  const watchTickers = useMemo(
    () => [...new Set(alertWatches.map((w) => w.ticker.toUpperCase()))],
    [alertWatches],
  )
  const scanEnabled = !paused && watchTickers.length > 0

  useIndustryPatternScan(watchTickers, scanEnabled, false, alertWatches)

  return null
}
