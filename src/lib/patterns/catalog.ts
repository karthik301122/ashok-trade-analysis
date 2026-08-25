import type { PatternBias, CorePatternCategoryId, PatternCategoryId } from './types'

/**
 * Patterns the auto-scanner actually implements.
 * Do not list roadmap / unimplemented names here — that oversold the product.
 */
export type CatalogPattern = {
  category: CorePatternCategoryId
  name: string
  familyBias: PatternBias | 'either'
}

export const PATTERN_CATALOG: CatalogPattern[] = [
  // —— Candlesticks (detector: detectCandlesticks) ——
  { category: 'candlesticks', name: 'Doji', familyBias: 'neutral' },
  { category: 'candlesticks', name: 'Dragonfly Doji', familyBias: 'bullish' },
  { category: 'candlesticks', name: 'Gravestone Doji', familyBias: 'bearish' },
  { category: 'candlesticks', name: 'Spinning Top', familyBias: 'neutral' },
  { category: 'candlesticks', name: 'Hammer', familyBias: 'bullish' },
  { category: 'candlesticks', name: 'Hanging Man', familyBias: 'bearish' },
  { category: 'candlesticks', name: 'Inverted Hammer', familyBias: 'bullish' },
  { category: 'candlesticks', name: 'Shooting Star', familyBias: 'bearish' },
  { category: 'candlesticks', name: 'Tweezer Bottom', familyBias: 'bullish' },
  { category: 'candlesticks', name: 'Tweezer Top', familyBias: 'bearish' },
  { category: 'candlesticks', name: 'Bullish Engulfing', familyBias: 'bullish' },
  { category: 'candlesticks', name: 'Bearish Engulfing', familyBias: 'bearish' },
  { category: 'candlesticks', name: 'Bullish Harami', familyBias: 'bullish' },
  { category: 'candlesticks', name: 'Bearish Harami', familyBias: 'bearish' },
  { category: 'candlesticks', name: 'Piercing Line', familyBias: 'bullish' },
  { category: 'candlesticks', name: 'Dark Cloud Cover', familyBias: 'bearish' },
  { category: 'candlesticks', name: 'Morning Star', familyBias: 'bullish' },
  { category: 'candlesticks', name: 'Evening Star', familyBias: 'bearish' },
  { category: 'candlesticks', name: 'Three White Soldiers', familyBias: 'bullish' },
  { category: 'candlesticks', name: 'Three Black Crows', familyBias: 'bearish' },

  // —— Classic chart (detector: detectClassic) ——
  { category: 'classic', name: 'Double Top', familyBias: 'bearish' },
  { category: 'classic', name: 'Double Bottom', familyBias: 'bullish' },
  { category: 'classic', name: 'Bull Flag', familyBias: 'bullish' },
  { category: 'classic', name: 'Bear Flag', familyBias: 'bearish' },
  { category: 'classic', name: 'Bull Pennant', familyBias: 'bullish' },
  { category: 'classic', name: 'Bear Pennant', familyBias: 'bearish' },
  { category: 'classic', name: 'Triangle Squeeze', familyBias: 'neutral' },
  { category: 'classic', name: 'Ascending Triangle', familyBias: 'bullish' },
  { category: 'classic', name: 'Descending Triangle', familyBias: 'bearish' },
  { category: 'classic', name: 'Symmetrical Triangle', familyBias: 'neutral' },
  { category: 'classic', name: 'Rising Wedge', familyBias: 'bearish' },
  { category: 'classic', name: 'Falling Wedge', familyBias: 'bullish' },
  { category: 'classic', name: 'Cup & Handle', familyBias: 'bullish' },
  { category: 'classic', name: 'Inverse Cup & Handle', familyBias: 'bearish' },
  { category: 'classic', name: 'Head & Shoulders', familyBias: 'bearish' },
  { category: 'classic', name: 'Inverse Head & Shoulders', familyBias: 'bullish' },

  // —— Trend / structure (detector: detectStructure) ——
  { category: 'structure', name: 'Higher Highs & Higher Lows', familyBias: 'bullish' },
  { category: 'structure', name: 'Lower Highs & Lower Lows', familyBias: 'bearish' },
  { category: 'structure', name: 'Range / Mixed Structure', familyBias: 'neutral' },
  { category: 'structure', name: 'Resistance Break', familyBias: 'bullish' },
  { category: 'structure', name: 'Support Break', familyBias: 'bearish' },

  // —— Volume / momentum (detector: detectVolumeMomentum) ——
  { category: 'volume', name: 'Volume Breakout', familyBias: 'bullish' },
  { category: 'volume', name: 'Volume Breakdown', familyBias: 'bearish' },
  { category: 'volume', name: 'Bullish RSI Divergence', familyBias: 'bullish' },
  { category: 'volume', name: 'Bearish RSI Divergence', familyBias: 'bearish' },
]

export function catalogFor(category: PatternCategoryId): CatalogPattern[] {
  if (category === 'starred' || category === 'custom') return []
  return PATTERN_CATALOG.filter((p) => p.category === category)
}

export function catalogCount(category: PatternCategoryId): number {
  return catalogFor(category).length
}

export const CATALOG_TOTAL = PATTERN_CATALOG.length
