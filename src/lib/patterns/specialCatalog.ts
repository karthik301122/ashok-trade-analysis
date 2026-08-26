import type { PatternBias } from './types'

export type SpecialPatternCategory =
  | 'weekly-karthik'
  | 'momentum'
  | 'volume'
  | 'structure'
  | 'cycle'
  | 'mean-reversion'

export type SpecialPatternKind = 'snapshot' | 'weekly'

export type SpecialPatternDef = {
  id: string
  name: string
  category: SpecialPatternCategory
  kind: SpecialPatternKind
  bias: PatternBias
  /** Human-readable formula shown in the Special Patterns tab */
  formula: string
  description: string
}

export const SPECIAL_PATTERN_CATEGORIES: { id: SpecialPatternCategory; label: string }[] = [
  { id: 'weekly-karthik', label: 'Weekly (Karthik)' },
  { id: 'momentum', label: 'Momentum / RS' },
  { id: 'volume', label: 'Volume' },
  { id: 'structure', label: 'Structure / MA' },
  { id: 'cycle', label: 'Cycle / Mood' },
  { id: 'mean-reversion', label: 'Mean reversion' },
]

/** Karthik weekly OHLC patterns — scanned from resampled weekly bars. */
export const KARTHIK_WEEKLY_PATTERNS: SpecialPatternDef[] = [
  {
    id: 'three-weeks-tight',
    name: '3 Weeks Tight',
    category: 'weekly-karthik',
    kind: 'weekly',
    bias: 'bullish',
    formula:
      'Tightness = (max(C₁,C₂,C₃) − min(C₁,C₂,C₃)) / min(C₁,C₂,C₃)  ≤  5%  (weekly closes)',
    description:
      'Three consecutive weekly closes compress within 5% — volatility contraction / potential breakout setup.',
  },
  {
    id: 'weekly-inside-bar',
    name: 'Weekly Inside Bar',
    category: 'weekly-karthik',
    kind: 'weekly',
    bias: 'neutral',
    formula: 'H₀ ≤ H₁  AND  L₀ ≥ L₁  (current week inside prior week range)',
    description: 'The current weekly range is fully contained inside the previous week’s high–low.',
  },
  {
    id: 'double-inside-bar',
    name: 'Double Inside Bar (Weekly)',
    category: 'weekly-karthik',
    kind: 'weekly',
    bias: 'neutral',
    formula:
      '(H₀ ≤ H₁ AND L₀ ≥ L₁)  AND  (H₁ ≤ H₂ AND L₁ ≥ L₂)  — two nested inside weeks',
    description: 'Two consecutive weekly inside bars — tightening coil before a range expansion.',
  },
  {
    id: 'double-hammer',
    name: 'Double Hammer (Weekly)',
    category: 'weekly-karthik',
    kind: 'weekly',
    bias: 'bullish',
    formula:
      'Hammer(week 0) AND Hammer(week 1);  lower wick ≥ 2× body, minimal upper wick, body near top, decline into week',
    description:
      'Two consecutive valid weekly hammers after a decline — reversal / support test sequence.',
  },
]

/**
 * Ashok desk formula patterns — evaluated on snapshot metrics (not OHLC shapes).
 * Add new entries here; implement the matching rule in specialDetect.ts.
 */
export const SNAPSHOT_PATTERN_CATALOG: SpecialPatternDef[] = [
  {
    id: 'star-3m',
    name: 'Star Stock',
    category: 'momentum',
    kind: 'snapshot',
    bias: 'bullish',
    formula: '3M return > ASX200 3M return',
    description: 'Same rule as the ★ star flag on the Sector Table.',
  },
  {
    id: 'rs-leader',
    name: 'RS Leader',
    category: 'momentum',
    kind: 'snapshot',
    bias: 'bullish',
    formula: 'RS ≥ 70  where  RS = clamp(50 + (stock 3M − index 3M) × 2.2)',
    description: 'Strong relative strength vs the benchmark on our heuristic RS score.',
  },
  {
    id: 'momentum-thrust',
    name: 'Momentum Thrust',
    category: 'momentum',
    kind: 'snapshot',
    bias: 'bullish',
    formula: '3M > +8%  AND  1M > 0  AND  (3M − index 3M) > +5pp',
    description: 'Fast absolute and relative momentum — leadership continuation candidate.',
  },
  {
    id: 'rs-laggard',
    name: 'RS Laggard',
    category: 'momentum',
    kind: 'snapshot',
    bias: 'bearish',
    formula: 'RS < 40  AND  3M < 0',
    description: 'Weak relative and absolute trend — avoid / short-list candidate.',
  },
  {
    id: 'volume-surge-long',
    name: 'Volume Surge (bullish)',
    category: 'volume',
    kind: 'snapshot',
    bias: 'bullish',
    formula: 'RVOL ≥ 2×  AND  1M > 0  AND  close > 20 SMA',
    description: 'Unusual volume with positive month and short-term trend support.',
  },
  {
    id: 'volume-breakdown',
    name: 'Volume Breakdown',
    category: 'volume',
    kind: 'snapshot',
    bias: 'bearish',
    formula: 'RVOL ≥ 2×  AND  1M < 0',
    description: 'Heavy volume on a down month — distribution / exit pressure.',
  },
  {
    id: 'dollar-flow',
    name: 'Dollar Volume Leader',
    category: 'volume',
    kind: 'snapshot',
    bias: 'neutral',
    formula: 'RVOL ≥ 1.5×  AND  dollar volume in top 10% of universe',
    description: 'Where institutional-sized turnover is showing up today.',
  },
  {
    id: 'triple-ma-stack',
    name: 'Triple MA Stack',
    category: 'structure',
    kind: 'snapshot',
    bias: 'bullish',
    formula: 'price > 20 SMA  AND  > 50 SMA  AND  > 200 SMA',
    description: 'Full moving-average alignment — classic uptrend structure.',
  },
  {
    id: 'ma-reset',
    name: '50 SMA Reset',
    category: 'structure',
    kind: 'snapshot',
    bias: 'bullish',
    formula: 'price > 50 SMA  AND  1M > 0  AND  3M > 0  AND  from 52W high > −8%',
    description: 'Pullback held the 50-day with positive month/quarter returns.',
  },
  {
    id: 'near-52w-high',
    name: 'Near 52-Week High',
    category: 'structure',
    kind: 'snapshot',
    bias: 'bullish',
    formula: 'from 52W high ≥ −3%  AND  price > 50 SMA',
    description: 'Price pressing highs with medium-term trend intact.',
  },
  {
    id: 'below-200-warning',
    name: 'Below 200 SMA',
    category: 'structure',
    kind: 'snapshot',
    bias: 'bearish',
    formula: 'price < 200 SMA  AND  3M < 0',
    description: 'Long-term trend broken with negative quarter.',
  },
  {
    id: 'bullish-mood',
    name: 'Bullish Mood Stack',
    category: 'cycle',
    kind: 'snapshot',
    bias: 'bullish',
    formula: 'Mood score ≥ +2  (±1 each: 1M>0, 3M>0, vs index 3M>0, >50 SMA)',
    description: 'Documented mood rule from the breadth How-to tab.',
  },
  {
    id: 'bearish-mood',
    name: 'Bearish Mood Stack',
    category: 'cycle',
    kind: 'snapshot',
    bias: 'bearish',
    formula: 'Mood score ≤ −2  (same four inputs as bullish mood)',
    description: 'Inverse of the bullish mood stack.',
  },
  {
    id: 'early-cycle',
    name: 'Early Cycle',
    category: 'cycle',
    kind: 'snapshot',
    bias: 'bullish',
    formula: 'Cycle = Early  AND  (3M − index 3M) ≥ +2pp',
    description: 'Rotation clock early stage with index-beating quarter.',
  },
  {
    id: 'mid-cycle-leader',
    name: 'Mid Cycle Leader',
    category: 'cycle',
    kind: 'snapshot',
    bias: 'bullish',
    formula: 'Cycle = Mid  AND  RS ≥ 60  AND  price > 50 SMA',
    description: 'Mid-cycle name still showing RS and MA support.',
  },
  {
    id: 'late-extended',
    name: 'Late Cycle Extended',
    category: 'cycle',
    kind: 'snapshot',
    bias: 'neutral',
    formula: 'Cycle = Late  AND  from 52W high > −5%  AND  1M < +2%',
    description: 'Late stage but still near highs with slowing 1M — watch for rollover.',
  },
  {
    id: 'rsi-oversold-bounce',
    name: 'RSI Oversold (above 200)',
    category: 'mean-reversion',
    kind: 'snapshot',
    bias: 'bullish',
    formula: 'RSI(14) ≤ 35  AND  price > 200 SMA',
    description: 'Oversold within a longer-term uptrend — bounce watch.',
  },
  {
    id: 'rsi-overbought',
    name: 'RSI Overbought',
    category: 'mean-reversion',
    kind: 'snapshot',
    bias: 'bearish',
    formula: 'RSI(14) ≥ 70',
    description: 'Stretched momentum — pullback / mean-reversion risk.',
  },
]

export const SPECIAL_PATTERN_CATALOG: SpecialPatternDef[] = [
  ...KARTHIK_WEEKLY_PATTERNS,
  ...SNAPSHOT_PATTERN_CATALOG,
]

export function specialPatternById(id: string): SpecialPatternDef | undefined {
  return SPECIAL_PATTERN_CATALOG.find((p) => p.id === id)
}

export function specialPatternByName(name: string): SpecialPatternDef | undefined {
  const n = name.trim().toLowerCase()
  return SPECIAL_PATTERN_CATALOG.find((p) => p.name.toLowerCase() === n)
}

export function isSpecialPatternName(name: string): boolean {
  return specialPatternByName(name) != null
}
