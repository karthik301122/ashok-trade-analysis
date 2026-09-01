import type { StockMetrics } from '../data/types'
import { resolveStockPrice } from './format'

export const PRICE_PRESETS: { label: string; min: number | null; max: number | null }[] = [
  { label: '< $1', min: null, max: 1 },
  { label: '$1–10', min: 1, max: 10 },
  { label: '$10–50', min: 10, max: 50 },
  { label: '> $50', min: 50, max: null },
]

export function parsePriceInput(raw: string): number | null {
  const t = raw.trim().replace(/^\$/, '')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function matchesPriceValue(
  price: number | null | undefined,
  min: number | null,
  max: number | null,
): boolean {
  if (price == null || !Number.isFinite(price) || price <= 0) return false
  if (min != null && price < min) return false
  if (max != null && price > max) return false
  return true
}

export function matchesPriceRange(
  s: StockMetrics,
  min: number | null,
  max: number | null,
): boolean {
  return matchesPriceValue(resolveStockPrice(s), min, max)
}
