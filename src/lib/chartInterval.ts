import type { PatternScanWindow } from './patterns/scanWindow'
import { windowStartTs } from './patterns/scanWindow'

/** Desk chart bar intervals (EODHD: 1m/5m/1h; 15m/30m aggregated from 5m). */
export type DeskChartInterval = '1m' | '5m' | '15m' | '30m' | '1h' | '1d'

/** User chart interval preference — auto picks by scan window. */
export type ChartIntervalPref = 'auto' | DeskChartInterval

export type DeskDataProvider = 'eodhd' | 'unknown'

export const CHART_INTERVAL_SECTIONS: {
  label: string
  items: { id: ChartIntervalPref; label: string }[]
}[] = [
  {
    label: 'SMART',
    items: [{ id: 'auto', label: 'Auto · match range' }],
  },
  {
    label: 'MINUTES',
    items: [
      { id: '1m', label: '1 minute' },
      { id: '5m', label: '5 minutes' },
      { id: '15m', label: '15 minutes' },
      { id: '30m', label: '30 minutes' },
    ],
  },
  {
    label: 'HOURS',
    items: [{ id: '1h', label: '1 hour' }],
  },
  {
    label: 'DAILY',
    items: [{ id: '1d', label: '1 day' }],
  },
]

export function parseChartIntervalPref(raw: unknown, legacyIntraday?: boolean): ChartIntervalPref {
  const allowed: ChartIntervalPref[] = ['auto', '1m', '5m', '15m', '30m', '1h', '1d']
  if (typeof raw === 'string' && allowed.includes(raw as ChartIntervalPref)) {
    return raw as ChartIntervalPref
  }
  if (legacyIntraday === false) return '1d'
  return 'auto'
}

export function isIntradayDeskInterval(interval: DeskChartInterval): boolean {
  return interval !== '1d'
}

/** Pick intraday interval per scan window when pref is auto. */
export function chartIntervalForWindow(
  window: PatternScanWindow,
  _provider: DeskDataProvider = 'eodhd',
): DeskChartInterval {
  void _provider
  switch (window) {
    case '1d':
    case '1w':
    case '1m':
      return '5m'
    case '3m':
    case '6m':
    case '1y':
    case 'all':
      return '1h'
    default:
      return '5m'
  }
}

export function resolveChartInterval(
  pref: ChartIntervalPref,
  window: PatternScanWindow,
  provider: DeskDataProvider = 'eodhd',
): DeskChartInterval {
  if (pref === 'auto') return chartIntervalForWindow(window, provider)
  return pref
}

/** Unix range for intraday fetch — scan window plus a little chart padding. */
export function intradayFetchRange(window: PatternScanWindow, asOfTs: number): {
  fromTs: number
  toTs: number
} {
  const start = windowStartTs(window, asOfTs)
  const padDays = window === '1d' ? 2 : window === '1w' ? 3 : 7
  const padSec = padDays * 86_400
  const fromTs = start != null ? start - padSec : asOfTs - 400 * 86_400
  return { fromTs, toTs: asOfTs + 86_400 }
}

export function chartIntervalLabel(interval: DeskChartInterval | ChartIntervalPref): string {
  if (interval === 'auto') return 'Auto'
  switch (interval) {
    case '1m':
      return '1 minute'
    case '5m':
      return '5 minutes'
    case '15m':
      return '15 minutes'
    case '30m':
      return '30 minutes'
    case '1h':
      return '1 hour'
    case '1d':
      return '1 day'
    default:
      return interval
  }
}

export function chartIntervalShort(interval: DeskChartInterval | ChartIntervalPref): string {
  if (interval === 'auto') return 'Auto'
  if (interval === '1d') return '1D'
  if (interval === '1h') return '1H'
  return interval
}

export function chartIntervalButtonLabel(pref: ChartIntervalPref): string {
  if (pref === 'auto') return 'Auto'
  return chartIntervalShort(pref)
}

/** TradingView advanced widget interval codes (native 30m, 15m, etc.). */
export function tradingViewIntervalForPref(
  pref: ChartIntervalPref,
  window: PatternScanWindow,
  provider: DeskDataProvider = 'eodhd',
): string {
  const desk = resolveChartInterval(pref, window, provider)
  switch (desk) {
    case '1m':
      return '1'
    case '5m':
      return '5'
    case '15m':
      return '15'
    case '30m':
      return '30'
    case '1h':
      return '60'
    case '1d':
    default:
      return 'D'
  }
}
