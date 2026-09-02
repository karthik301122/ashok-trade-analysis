import { useMemo } from 'react'
import type { MarketSnapshot } from '../../data/types'
import { ASX_UNIVERSE_COUNT } from '../../data/universe'
import type { PatternAlertWatch } from '../../lib/patterns/patternAlertWatches'
import { hasOverviewChartWatch } from '../../lib/overviewPatternHits'
import { usePatternPrefs } from './usePatternPrefs'
import { useIndustryPatternScan } from './useIndustryPatternScan'

/**
 * Background scan for alert targets — starred chart patterns, My Patterns,
 * and per-stock pattern watches — so server scores stay current.
 */
export function WatchPatternAlertScan({
  snapshot,
  paused = false,
  alertWatches = [],
}: {
  snapshot: MarketSnapshot
  paused?: boolean
  alertWatches?: PatternAlertWatch[]
}) {
  const { prefs } = usePatternPrefs()
  const chartWatch = hasOverviewChartWatch(prefs)
  const watchTickers = useMemo(
    () => [...new Set(alertWatches.map((w) => w.ticker.toUpperCase()))],
    [alertWatches],
  )
  const useWatchList = watchTickers.length > 0
  const universeReady = snapshot.stocks.length >= Math.floor(ASX_UNIVERSE_COUNT * 0.85)
  const fullUniverse = !useWatchList && chartWatch && universeReady
  const tickers = useMemo(
    () => (useWatchList ? watchTickers : snapshot.stocks.map((s) => s.ticker)),
    [useWatchList, watchTickers, snapshot.stocks.length],
  )
  const scanEnabled =
    !paused && universeReady && (chartWatch || useWatchList)

  useIndustryPatternScan(tickers, scanEnabled, fullUniverse, alertWatches)

  return null
}
