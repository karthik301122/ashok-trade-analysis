/** Heatmap colour for % performance cells */
export function perfCellClass(value: number): string {
  if (value > 10) return 'bg-emerald-600 text-white'
  if (value > 3) return 'bg-emerald-400/80 text-emerald-950'
  if (value > 0) return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200'
  if (value > -3) return 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200'
  if (value > -10) return 'bg-rose-400/80 text-rose-950'
  return 'bg-rose-600 text-white'
}

export function formatPct(value: number, digits = 1): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}%`
}

export function formatVsIndex(value: number, benchmark: string, period = '3M'): string {
  if (value >= 0) return `+${value.toFixed(1)}% vs ${benchmark} ${period}`
  return `${value.toFixed(1)}% vs ${benchmark} ${period}`
}

/** Compact share / dollar volume (e.g. 1.2M, $45.3M) */
export function formatVolume(n: number, asMoney = false): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  const prefix = asMoney ? '$' : ''
  if (abs >= 1_000_000_000) return `${sign}${prefix}${(abs / 1_000_000_000).toFixed(2)}B`
  if (abs >= 1_000_000) return `${sign}${prefix}${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `${sign}${prefix}${(abs / 1_000).toFixed(1)}K`
  return `${sign}${prefix}${Math.round(abs).toLocaleString()}`
}

/** Last close in AUD — 2–4 decimals depending on magnitude. */
export function formatPrice(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—'
  if (n >= 100) return `$${n.toFixed(2)}`
  if (n >= 1) return `$${n.toFixed(3)}`
  return `$${n.toFixed(4)}`
}

/** Use stored lastPrice, or infer from dollar volume ÷ share volume. */
export function resolveStockPrice(s: {
  lastPrice?: number
  dollarVolume?: number
  volume?: number
}): number | null {
  if (s.lastPrice != null && s.lastPrice > 0) return s.lastPrice
  const vol = s.volume ?? 0
  const dv = s.dollarVolume ?? 0
  if (vol > 0 && dv > 0) return dv / vol
  return null
}
