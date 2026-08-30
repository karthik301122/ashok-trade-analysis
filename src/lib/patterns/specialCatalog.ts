import type { PatternBias } from './types'
import { VCP_SETUP_SCRIPT } from './scanScript'

export type SpecialPatternCategory =
  | 'weekly-karthik'
  | 'livermore'
  | 'vcp'
  | 'momentum'
  | 'volume'
  | 'structure'
  | 'cycle'
  | 'mean-reversion'

export type SpecialPatternKind = 'snapshot' | 'weekly' | 'livermore' | 'scan'

export type SpecialPatternDef = {
  id: string
  name: string
  category: SpecialPatternCategory
  kind: SpecialPatternKind
  bias: PatternBias
  /** Human-readable formula shown in the Special Patterns tab */
  formula: string
  description: string
  /** ScanScript source for kind=scan patterns (daily OHLC) */
  scanScript?: string
}

export const SPECIAL_PATTERN_CATEGORIES: { id: SpecialPatternCategory; label: string }[] = [
  { id: 'weekly-karthik', label: 'Weekly (Karthik)' },
  { id: 'livermore', label: 'Livermore Desk' },
  { id: 'vcp', label: 'VCP (ScanScript)' },
  { id: 'momentum', label: 'Momentum / RS' },
  { id: 'volume', label: 'Volume' },
  { id: 'structure', label: 'Structure / MA' },
  { id: 'cycle', label: 'Cycle / Mood' },
  { id: 'mean-reversion', label: 'Mean reversion' },
]

/** Karthik weekly OHLC patterns — scanned from resampled weekly bars. */
export const KARTHIK_WEEKLY_PATTERNS: SpecialPatternDef[] = [
  {
    id: 'stage-2',
    name: 'Stage 2',
    category: 'weekly-karthik',
    kind: 'weekly',
    bias: 'bullish',
    formula:
      '10 WMA > 30 WMA\n' +
      '30 WMA > 40 WMA  AND  both 30/40 slopes rising\n' +
      'Price above 10, 30, and 40 WMAs',
    description:
      'Karthik primary Stage 2 filter on weekly closes — required context (or ≥30% 3M rally) for other weekly specials.',
  },
  {
    id: 'three-weeks-tight',
    name: '3 Weeks Tight',
    category: 'weekly-karthik',
    kind: 'weekly',
    bias: 'bullish',
    formula:
      'Context: Stage 2 OR ≥30% in ~13 weeks\n' +
      'Tightness = (max−min)/min of weekly closes over 3–5 weeks  ≤  5%',
    description:
      'Weekly closes compress within 5% over the last 3–5 weeks, only in Stage 2 or after a ≥30% 3‑month rally.',
  },
  {
    id: 'weekly-inside-bar',
    name: 'Weekly Inside Bar',
    category: 'weekly-karthik',
    kind: 'weekly',
    bias: 'neutral',
    formula:
      'Context: Stage 2 OR ≥30% in ~13 weeks\n' +
      'H₀ ≤ H₁ AND L₀ ≥ L₁\n' +
      'Range₀ < 50% × Range₁  AND  Volume₀ < Volume₁',
    description:
      'Baby week inside mother, more than 50% compressed, with volume contraction — Stage 2 or strong rally context.',
  },
  {
    id: 'double-inside-bar',
    name: 'Double Inside Bar (Weekly)',
    category: 'weekly-karthik',
    kind: 'weekly',
    bias: 'neutral',
    formula:
      'Context: Stage 2 OR ≥30% in ~13 weeks\n' +
      'Two consecutive Karthik inside bars (containment + 50% compression + volume ↓)',
    description: 'Two nested weekly inside bars under the same Stage 2 / rally gate.',
  },
  {
    id: 'double-hammer',
    name: 'Double Hammer (Weekly)',
    category: 'weekly-karthik',
    kind: 'weekly',
    bias: 'bullish',
    formula:
      'Context: Stage 2 OR ≥30% in ~13 weeks\n' +
      'Hammer(week 0) AND Hammer(week 1); lower wick ≥ 2× body, minimal upper wick, body near top, decline into week',
    description:
      'Two consecutive valid weekly hammers after a decline — only with Stage 2 or ≥30% rally context.',
  },
]

/** Livermore accumulation / liquidity / pivot scores — daily OHLC scan. */
export const LIVERMORE_PATTERNS: SpecialPatternDef[] = [
  {
    id: 'livermore-dashboard',
    name: 'Livermore Dashboard Rank',
    category: 'livermore',
    kind: 'livermore',
    bias: 'bullish',
    formula:
      'Final = 35% Accumulation + 25% Liquidity Grab + 25% RS(20d) + 15% Breakout\n' +
      '90–100 Elite · 80–90 Strong · 70–80 Emerging',
    description: 'Full-universe Livermore composite ranking from daily OHLC.',
  },
  {
    id: 'livermore-elite-setup',
    name: 'Elite Livermore Setup',
    category: 'livermore',
    kind: 'livermore',
    bias: 'bullish',
    formula:
      'Accumulation > 80  AND  Liquidity Grab > 70\n' +
      'AND within 10% of 52W high  AND  EMA20 > EMA50 > EMA200  AND  RVOL > 1.5',
    description: 'Institutional accumulation + liquidity grab near highs with trend stack.',
  },
  {
    id: 'livermore-accumulation-strong',
    name: 'Strong Accumulation',
    category: 'livermore',
    kind: 'livermore',
    bias: 'bullish',
    formula:
      'Accumulation ≥ 85 (volume expansion + compression + higher low + RS)\n' +
      'Volume ratio > 1.5 · ATR14/ATR50 < 0.8 · higher swing low · RS(20d) > index',
    description: 'Livermore-style quiet accumulation with rising RS.',
  },
  {
    id: 'livermore-accumulation',
    name: 'Accumulation Zone',
    category: 'livermore',
    kind: 'livermore',
    bias: 'bullish',
    formula: 'Accumulation score ≥ 70',
    description: 'Building institutional interest without vertical price extension.',
  },
  {
    id: 'livermore-liquidity-strong',
    name: 'Strong Liquidity Grab',
    category: 'livermore',
    kind: 'livermore',
    bias: 'bullish',
    formula:
      'Liquidity Grab ≥ 80 — false break below support, volume surge, long lower wick, RS support',
    description: 'High-confidence stop-run reversal under support.',
  },
  {
    id: 'livermore-liquidity-grab',
    name: 'Liquidity Grab',
    category: 'livermore',
    kind: 'livermore',
    bias: 'bullish',
    formula:
      'Low < 10d support AND close back above · RVOL > 1.5 · lower wick > 50% of range · score ≥ 60',
    description: 'Possible smart-money liquidity sweep and reclaim.',
  },
  {
    id: 'livermore-pivot-breakout',
    name: 'Pivot Breakout',
    category: 'livermore',
    kind: 'livermore',
    bias: 'bullish',
    formula:
      'Close > 20-day pivot high  AND  Volume > 1.5× avg(20)  AND  RS(20d) > index',
    description: 'Livermore pivot emergence from accumulation with volume confirmation.',
  },
]

/** VCP contraction / breakout — daily OHLC via ScanScript + multi-bar breakout logic. */
export const VCP_PATTERNS: SpecialPatternDef[] = [
  {
    id: 'vcp-setup',
    name: 'VCP Setup Detector',
    category: 'vcp',
    kind: 'scan',
    bias: 'bullish',
    scanScript: VCP_SETUP_SCRIPT,
    formula:
      'above_sma(50)  AND  above_sma(200)\n' +
      'pct_chg(20) ≤ 8%  AND  pct_chg(5) ≤ 3%\n' +
      'rvol ≤ 0.8  AND  RSI(14) 45–70',
    description:
      'Volatility contraction setup: Stage 2 trend, tight price action, volume dry-up, healthy RSI — not extended.',
  },
  {
    id: 'vcp-breakout',
    name: 'VCP Breakout Detector',
    category: 'vcp',
    kind: 'scan',
    bias: 'bullish',
    formula:
      'above_sma(200)\n' +
      'Prior 4d move ≤ 2%  AND  avg RVOL (prior 4d) ≤ 0.8\n' +
      'pct_chg(5) ≥ 3%  AND  rvol ≥ 2  AND  RSI(14) 40–75',
    description:
      'Final contraction then breakout: tight + dry volume before the signal bar, then price and volume surge on daily OHLC.',
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
  ...LIVERMORE_PATTERNS,
  ...VCP_PATTERNS,
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
