import type { PatternHit } from './types'

/** How far back from the latest bar we accept pattern hits. */
export type PatternScanWindow = '1d' | '1w' | '1m' | '3m' | '6m' | '1y' | 'all'

export const PATTERN_SCAN_WINDOWS: { id: PatternScanWindow; label: string; tradingDays: number }[] = [
  { id: '1d', label: '1 day', tradingDays: 1 },
  { id: '1w', label: '1 week', tradingDays: 5 },
  { id: '1m', label: '1 month', tradingDays: 21 },
  { id: '3m', label: '3 months', tradingDays: 63 },
  { id: '6m', label: '6 months', tradingDays: 126 },
  { id: '1y', label: '1 year', tradingDays: 252 },
  { id: 'all', label: 'All history', tradingDays: Infinity },
]

export const DEFAULT_PATTERN_SCAN_WINDOW: PatternScanWindow = '1m'

export function parsePatternScanWindow(raw: unknown): PatternScanWindow {
  if (typeof raw === 'string' && PATTERN_SCAN_WINDOWS.some((w) => w.id === raw)) {
    return raw as PatternScanWindow
  }
  return DEFAULT_PATTERN_SCAN_WINDOW
}

/** Calendar days buffer ≈ trading days × 7/5 (weekends). */
export function windowStartTs(window: PatternScanWindow, asOfTs: number): number | null {
  const meta = PATTERN_SCAN_WINDOWS.find((w) => w.id === window)
  if (!meta || !Number.isFinite(asOfTs) || meta.tradingDays === Infinity) return null
  const calendarDays = Math.ceil(meta.tradingDays * (7 / 5)) + 2
  return asOfTs - calendarDays * 86_400
}

export function hitInWindow(hit: PatternHit, window: PatternScanWindow, asOfTs: number): boolean {
  if (window === 'all') return true
  const start = windowStartTs(window, asOfTs)
  if (start == null) return true
  return hit.endT >= start && hit.endT <= asOfTs
}

export function filterHitsByWindow(
  hits: PatternHit[],
  window: PatternScanWindow,
  asOfTs: number,
): PatternHit[] {
  if (window === 'all') return hits
  return hits.filter((h) => hitInWindow(h, window, asOfTs))
}

/** Keep OHLC bars that fall inside the scan window (for chart display). */
export function filterBarsByWindow<T extends { t: number }>(
  bars: T[],
  window: PatternScanWindow,
): T[] {
  if (!bars.length || window === 'all') return bars
  const asOf = bars[bars.length - 1].t
  const start = windowStartTs(window, asOf)
  if (start == null) return bars
  const sliced = bars.filter((b) => b.t >= start && b.t <= asOf)
  // Always keep at least a few bars so the chart is usable on tiny windows
  if (sliced.length >= 2) return sliced
  return bars.slice(-Math.max(2, Math.min(bars.length, 5)))
}

/** TradingView advanced chart `range` values. */
export function tradingViewRangeForWindow(window: PatternScanWindow): string {
  switch (window) {
    case '1d':
      return '1D'
    case '1w':
      return '5D'
    case '1m':
      return '1M'
    case '3m':
      return '3M'
    case '6m':
      return '6M'
    case '1y':
      return '12M'
    case 'all':
    default:
      return 'ALL'
  }
}

export function scanWindowLabel(window: PatternScanWindow): string {
  return PATTERN_SCAN_WINDOWS.find((w) => w.id === window)?.label ?? window
}
