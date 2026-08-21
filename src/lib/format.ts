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
