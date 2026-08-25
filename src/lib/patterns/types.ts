import type { OhlcBar } from '../yahoo'

export type PatternBias = 'bullish' | 'bearish' | 'neutral'

export type CorePatternCategoryId =
  | 'candlesticks'
  | 'classic'
  | 'structure'
  | 'volume'

export type PatternCategoryId = CorePatternCategoryId | 'starred' | 'custom'

export type PatternHit = {
  id: string
  category: PatternCategoryId
  name: string
  bias: PatternBias
  startT: number
  endT: number
  confidence: number
  /** Optional anchor points for drawing { time, price } */
  points?: { time: number; price: number }[]
  note?: string
}

/** One catalog entry after scan — always a real detector; hit may be null */
export type PatternScanRow = {
  name: string
  familyBias: PatternBias | 'either'
  hit: PatternHit | null
}

export type CategorySummary = {
  id: PatternCategoryId
  label: string
  bullish: number
  bearish: number
  neutral: number
  hits: PatternHit[]
  /** Scanned detectors for this category (hit or no-hit) */
  rows: PatternScanRow[]
  analyzed: number
  note?: string
}

export const CATEGORY_META: { id: CorePatternCategoryId; label: string }[] = [
  { id: 'candlesticks', label: 'Candlesticks' },
  { id: 'classic', label: 'Classic Chart' },
  { id: 'structure', label: 'Trend / Structure' },
  { id: 'volume', label: 'Volume / Momentum' },
]

export type { OhlcBar }
