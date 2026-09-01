import { useMemo } from 'react'
import type { MarketSnapshot } from '../../data/types'
import { ASX_UNIVERSE_COUNT } from '../../data/universe'
import { hasOverviewChartWatch } from '../../lib/overviewPatternHits'
import { usePatternPrefs } from './usePatternPrefs'
import { useIndustryPatternScan } from './useIndustryPatternScan'

/**
 * Background scan for starred chart + My Patterns across the full universe
 * so alert rules receive server scores (not only visible sector rows).
 */
export function WatchPatternAlertScan({ snapshot }: { snapshot: MarketSnapshot }) {
  const { prefs } = usePatternPrefs()
  const chartWatch = hasOverviewChartWatch(prefs)
  const fullUniverse =
    chartWatch && snapshot.stocks.length >= Math.floor(ASX_UNIVERSE_COUNT * 0.85)
  const tickers = useMemo(() => snapshot.stocks.map((s) => s.ticker), [snapshot.stocks])

  useIndustryPatternScan(tickers, chartWatch && fullUniverse, fullUniverse)

  return null
}
