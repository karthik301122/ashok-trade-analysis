import type { PatternBias, CorePatternCategoryId, PatternCategoryId } from './types'

/** Full trader catalog — every name we scan for (hit or no-hit). */
export type CatalogPattern = {
  category: CorePatternCategoryId
  name: string
  familyBias: PatternBias | 'either'
}

export const PATTERN_CATALOG: CatalogPattern[] = [
  // —— Candlesticks (~45) ——
  { category: 'candlesticks', name: 'Doji', familyBias: 'neutral' },
  { category: 'candlesticks', name: 'Dragonfly Doji', familyBias: 'bullish' },
  { category: 'candlesticks', name: 'Gravestone Doji', familyBias: 'bearish' },
  { category: 'candlesticks', name: 'Hammer', familyBias: 'bullish' },
  { category: 'candlesticks', name: 'Inverted Hammer', familyBias: 'bullish' },
  { category: 'candlesticks', name: 'Hanging Man', familyBias: 'bearish' },
  { category: 'candlesticks', name: 'Shooting Star', familyBias: 'bearish' },
  { category: 'candlesticks', name: 'Bullish Marubozu', familyBias: 'bullish' },
  { category: 'candlesticks', name: 'Bearish Marubozu', familyBias: 'bearish' },
  { category: 'candlesticks', name: 'Spinning Top', familyBias: 'neutral' },
  { category: 'candlesticks', name: 'High Wave', familyBias: 'neutral' },
  { category: 'candlesticks', name: 'Bullish Engulfing', familyBias: 'bullish' },
  { category: 'candlesticks', name: 'Bearish Engulfing', familyBias: 'bearish' },
  { category: 'candlesticks', name: 'Bullish Harami', familyBias: 'bullish' },
  { category: 'candlesticks', name: 'Bearish Harami', familyBias: 'bearish' },
  { category: 'candlesticks', name: 'Piercing Line', familyBias: 'bullish' },
  { category: 'candlesticks', name: 'Dark Cloud Cover', familyBias: 'bearish' },
  { category: 'candlesticks', name: 'Tweezer Bottom', familyBias: 'bullish' },
  { category: 'candlesticks', name: 'Tweezer Top', familyBias: 'bearish' },
  { category: 'candlesticks', name: 'Bullish Kicking', familyBias: 'bullish' },
  { category: 'candlesticks', name: 'Bearish Kicking', familyBias: 'bearish' },
  { category: 'candlesticks', name: 'Morning Star', familyBias: 'bullish' },
  { category: 'candlesticks', name: 'Evening Star', familyBias: 'bearish' },
  { category: 'candlesticks', name: 'Three White Soldiers', familyBias: 'bullish' },
  { category: 'candlesticks', name: 'Three Black Crows', familyBias: 'bearish' },
  { category: 'candlesticks', name: 'Three Inside Up', familyBias: 'bullish' },
  { category: 'candlesticks', name: 'Three Inside Down', familyBias: 'bearish' },
  { category: 'candlesticks', name: 'Three Outside Up', familyBias: 'bullish' },
  { category: 'candlesticks', name: 'Three Outside Down', familyBias: 'bearish' },
  { category: 'candlesticks', name: 'Abandoned Baby Bullish', familyBias: 'bullish' },
  { category: 'candlesticks', name: 'Abandoned Baby Bearish', familyBias: 'bearish' },
  { category: 'candlesticks', name: 'Morning Doji Star', familyBias: 'bullish' },
  { category: 'candlesticks', name: 'Evening Doji Star', familyBias: 'bearish' },
  { category: 'candlesticks', name: 'Bullish Belt Hold', familyBias: 'bullish' },
  { category: 'candlesticks', name: 'Bearish Belt Hold', familyBias: 'bearish' },
  { category: 'candlesticks', name: 'Rising Three Methods', familyBias: 'bullish' },
  { category: 'candlesticks', name: 'Falling Three Methods', familyBias: 'bearish' },
  { category: 'candlesticks', name: 'Upside Tasuki Gap', familyBias: 'bullish' },
  { category: 'candlesticks', name: 'Downside Tasuki Gap', familyBias: 'bearish' },
  { category: 'candlesticks', name: 'On-Neck', familyBias: 'bearish' },
  { category: 'candlesticks', name: 'In-Neck', familyBias: 'bearish' },
  { category: 'candlesticks', name: 'Thrusting', familyBias: 'bearish' },
  { category: 'candlesticks', name: 'Advance Block', familyBias: 'bearish' },
  { category: 'candlesticks', name: 'Deliberation', familyBias: 'bearish' },
  { category: 'candlesticks', name: 'Tri-Star Bullish', familyBias: 'bullish' },
  { category: 'candlesticks', name: 'Tri-Star Bearish', familyBias: 'bearish' },

  // —— Classic chart (~28) ——
  { category: 'classic', name: 'Head & Shoulders', familyBias: 'bearish' },
  { category: 'classic', name: 'Inverse Head & Shoulders', familyBias: 'bullish' },
  { category: 'classic', name: 'Double Top', familyBias: 'bearish' },
  { category: 'classic', name: 'Double Bottom', familyBias: 'bullish' },
  { category: 'classic', name: 'Triple Top', familyBias: 'bearish' },
  { category: 'classic', name: 'Triple Bottom', familyBias: 'bullish' },
  { category: 'classic', name: 'Rounding Top', familyBias: 'bearish' },
  { category: 'classic', name: 'Rounding Bottom', familyBias: 'bullish' },
  { category: 'classic', name: 'Adam & Eve Double Bottom', familyBias: 'bullish' },
  { category: 'classic', name: 'V Top', familyBias: 'bearish' },
  { category: 'classic', name: 'V Bottom', familyBias: 'bullish' },
  { category: 'classic', name: 'Bull Flag', familyBias: 'bullish' },
  { category: 'classic', name: 'Bear Flag', familyBias: 'bearish' },
  { category: 'classic', name: 'Bull Pennant', familyBias: 'bullish' },
  { category: 'classic', name: 'Bear Pennant', familyBias: 'bearish' },
  { category: 'classic', name: 'Symmetrical Triangle', familyBias: 'neutral' },
  { category: 'classic', name: 'Ascending Triangle', familyBias: 'bullish' },
  { category: 'classic', name: 'Descending Triangle', familyBias: 'bearish' },
  { category: 'classic', name: 'Rising Wedge', familyBias: 'bearish' },
  { category: 'classic', name: 'Falling Wedge', familyBias: 'bullish' },
  { category: 'classic', name: 'Rectangle / Range', familyBias: 'neutral' },
  { category: 'classic', name: 'Cup & Handle', familyBias: 'bullish' },
  { category: 'classic', name: 'Inverse Cup & Handle', familyBias: 'bearish' },
  { category: 'classic', name: 'Triangle Squeeze', familyBias: 'neutral' },
  { category: 'classic', name: 'Breakaway Gap', familyBias: 'either' },
  { category: 'classic', name: 'Runaway Gap', familyBias: 'either' },
  { category: 'classic', name: 'Exhaustion Gap', familyBias: 'either' },
  { category: 'classic', name: 'Island Reversal', familyBias: 'either' },

  // —— Trend / structure (~12) ——
  { category: 'structure', name: 'Higher Highs & Higher Lows', familyBias: 'bullish' },
  { category: 'structure', name: 'Lower Highs & Lower Lows', familyBias: 'bearish' },
  { category: 'structure', name: 'Range / Mixed Structure', familyBias: 'neutral' },
  { category: 'structure', name: 'Resistance Break', familyBias: 'bullish' },
  { category: 'structure', name: 'Support Break', familyBias: 'bearish' },
  { category: 'structure', name: 'Support Flip to Resistance', familyBias: 'bearish' },
  { category: 'structure', name: 'Resistance Flip to Support', familyBias: 'bullish' },
  { category: 'structure', name: 'Ascending Channel', familyBias: 'bullish' },
  { category: 'structure', name: 'Descending Channel', familyBias: 'bearish' },
  { category: 'structure', name: 'Horizontal Channel', familyBias: 'neutral' },
  { category: 'structure', name: 'Trendline Break Bullish', familyBias: 'bullish' },
  { category: 'structure', name: 'Trendline Break Bearish', familyBias: 'bearish' },

  // —— Harmonic (~10) ——
  { category: 'harmonic', name: 'Gartley Bullish', familyBias: 'bullish' },
  { category: 'harmonic', name: 'Gartley Bearish', familyBias: 'bearish' },
  { category: 'harmonic', name: 'Bat Bullish', familyBias: 'bullish' },
  { category: 'harmonic', name: 'Bat Bearish', familyBias: 'bearish' },
  { category: 'harmonic', name: 'Butterfly Bullish', familyBias: 'bullish' },
  { category: 'harmonic', name: 'Butterfly Bearish', familyBias: 'bearish' },
  { category: 'harmonic', name: 'Crab', familyBias: 'either' },
  { category: 'harmonic', name: 'Shark', familyBias: 'either' },
  { category: 'harmonic', name: 'Cypher', familyBias: 'either' },
  { category: 'harmonic', name: 'AB=CD', familyBias: 'either' },

  // —— Volume / momentum (~10) ——
  { category: 'volume', name: 'Volume Breakout', familyBias: 'bullish' },
  { category: 'volume', name: 'Volume Breakdown', familyBias: 'bearish' },
  { category: 'volume', name: 'Bullish RSI Divergence', familyBias: 'bullish' },
  { category: 'volume', name: 'Bearish RSI Divergence', familyBias: 'bearish' },
  { category: 'volume', name: 'Volume Climax', familyBias: 'either' },
  { category: 'volume', name: 'Dry-up Volume', familyBias: 'neutral' },
  { category: 'volume', name: 'Failed Breakout', familyBias: 'bearish' },
  { category: 'volume', name: 'Failed Breakdown', familyBias: 'bullish' },
  { category: 'volume', name: 'Wyckoff Spring', familyBias: 'bullish' },
  { category: 'volume', name: 'Wyckoff Upthrust', familyBias: 'bearish' },
]

export function catalogFor(category: PatternCategoryId): CatalogPattern[] {
  if (category === 'starred' || category === 'custom') return []
  return PATTERN_CATALOG.filter((p) => p.category === category)
}

export function catalogCount(category: PatternCategoryId): number {
  return catalogFor(category).length
}

export const CATALOG_TOTAL = PATTERN_CATALOG.length
