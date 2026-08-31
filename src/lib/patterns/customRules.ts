import { ema, rsi, sma, type OhlcBar } from '../yahoo'
import type { PatternBias, PatternHit } from './types'
import {
  detectAllCandleShapes,
  type CandleShapeSpec,
} from './candleShape'
import { rulesFromCustom } from './scanScript'

export type RuleMetric =
  | 'rsi'
  | 'rvol'
  | 'pct_above_sma20'
  | 'pct_above_sma50'
  | 'pct_above_sma200'
  | 'pct_above_ema21'
  | 'pct_change_5d'
  | 'pct_change_20d'

export type RuleOp = 'gt' | 'gte' | 'lt' | 'lte'

export type RuleCondition = {
  id: string
  metric: RuleMetric
  op: RuleOp
  value: number
}

export type CustomRuleSet = {
  /** all = AND, any = OR */
  match: 'all' | 'any'
  conditions: RuleCondition[]
}

export const RULE_METRIC_OPTIONS: { id: RuleMetric; label: string; hint: string; defaultValue: number }[] =
  [
    { id: 'rsi', label: 'RSI (14)', hint: '0–100', defaultValue: 30 },
    { id: 'rvol', label: 'Relative volume', hint: 'vs 20d avg', defaultValue: 1.5 },
    { id: 'pct_above_sma20', label: '% above 20 SMA', hint: 'e.g. 0 = at MA', defaultValue: 0 },
    { id: 'pct_above_sma50', label: '% above 50 SMA', hint: 'e.g. −2 = 2% below', defaultValue: 0 },
    { id: 'pct_above_sma200', label: '% above 200 SMA', hint: '', defaultValue: 0 },
    { id: 'pct_above_ema21', label: '% above 21 EMA', hint: '', defaultValue: 0 },
    { id: 'pct_change_5d', label: '5-day % change', hint: '', defaultValue: 5 },
    { id: 'pct_change_20d', label: '20-day % change', hint: '', defaultValue: 8 },
  ]

export const RULE_OP_OPTIONS: { id: RuleOp; label: string }[] = [
  { id: 'gt', label: '>' },
  { id: 'gte', label: '≥' },
  { id: 'lt', label: '<' },
  { id: 'lte', label: '≤' },
]

const MAX_CONDITIONS = 4
const LOOKBACK_BARS = 10

function pctAbove(close: number, ma: number | null): number | null {
  if (ma == null || ma === 0) return null
  return ((close - ma) / ma) * 100
}

function pctChange(closes: number[], barsAgo: number, i: number): number | null {
  const j = i - barsAgo
  if (j < 0 || closes[j] === 0) return null
  return ((closes[i] - closes[j]) / closes[j]) * 100
}

function metricAt(bars: OhlcBar[], i: number, metric: RuleMetric): number | null {
  const closes = bars.slice(0, i + 1).map((b) => b.c)
  const last = closes[closes.length - 1]
  switch (metric) {
    case 'rsi':
      return rsi(closes, 14)
    case 'rvol': {
      if (i < 20) return null
      const avg =
        bars.slice(i - 20, i).reduce((a, b) => a + (b.v || 0), 0) / 20
      if (avg <= 0) return null
      return (bars[i].v || 0) / avg
    }
    case 'pct_above_sma20':
      return pctAbove(last, sma(closes, 20))
    case 'pct_above_sma50':
      return pctAbove(last, sma(closes, 50))
    case 'pct_above_sma200':
      return pctAbove(last, sma(closes, 200))
    case 'pct_above_ema21':
      return pctAbove(last, ema(closes, 21))
    case 'pct_change_5d':
      return pctChange(closes, 5, closes.length - 1)
    case 'pct_change_20d':
      return pctChange(closes, 20, closes.length - 1)
    default:
      return null
  }
}

function compare(actual: number, op: RuleOp, value: number): boolean {
  switch (op) {
    case 'gt':
      return actual > value
    case 'gte':
      return actual >= value
    case 'lt':
      return actual < value
    case 'lte':
      return actual <= value
    default:
      return false
  }
}

export function conditionPasses(bars: OhlcBar[], i: number, c: RuleCondition): boolean {
  const v = metricAt(bars, i, c.metric)
  if (v == null || !Number.isFinite(v)) return false
  return compare(v, c.op, c.value)
}

export function ruleSetPasses(bars: OhlcBar[], i: number, rules: CustomRuleSet): boolean {
  const conds = rules.conditions.filter((c) => c.metric && c.op)
  if (conds.length === 0) return false
  if (rules.match === 'any') return conds.some((c) => conditionPasses(bars, i, c))
  return conds.every((c) => conditionPasses(bars, i, c))
}

/** Fraction of rule conditions met at bar i (0–100). */
export function ruleSetProgress(bars: OhlcBar[], i: number, rules: CustomRuleSet): number {
  const conds = rules.conditions.filter((c) => c.metric && c.op)
  if (!conds.length) return 0
  const passed = conds.filter((c) => conditionPasses(bars, i, c)).length
  return Math.round((passed / conds.length) * 100)
}

export function describeRuleSet(rules: CustomRuleSet | null | undefined): string {
  if (!rules?.conditions?.length) return ''
  const parts = rules.conditions.map((c) => {
    const meta = RULE_METRIC_OPTIONS.find((m) => m.id === c.metric)
    const op = RULE_OP_OPTIONS.find((o) => o.id === c.op)?.label ?? c.op
    return `${meta?.label ?? c.metric} ${op} ${c.value}`
  })
  const join = rules.match === 'any' ? ' OR ' : ' AND '
  return parts.join(join)
}

export function normalizeRuleSet(raw: unknown): CustomRuleSet | null {
  if (raw == null || typeof raw !== 'object') return null
  const o = raw as Partial<CustomRuleSet>
  const match = o.match === 'any' ? 'any' : 'all'
  if (!Array.isArray(o.conditions)) return null
  const conditions: RuleCondition[] = []
  for (const item of o.conditions.slice(0, MAX_CONDITIONS)) {
    if (!item || typeof item !== 'object') continue
    const c = item as Partial<RuleCondition>
    const metric = RULE_METRIC_OPTIONS.find((m) => m.id === c.metric)?.id
    const op = RULE_OP_OPTIONS.find((x) => x.id === c.op)?.id
    const value = Number(c.value)
    if (!metric || !op || !Number.isFinite(value)) continue
    conditions.push({
      id: typeof c.id === 'string' ? c.id : `c-${conditions.length}`,
      metric,
      op,
      value,
    })
  }
  if (conditions.length === 0) return null
  return { match, conditions }
}

/**
 * Evaluate a private rule set on OHLC. Returns the newest hit in the last LOOKBACK bars, or null.
 */
export function detectCustomRule(
  bars: OhlcBar[],
  pattern: { id: string; name: string; bias: PatternBias; description?: string; rules: CustomRuleSet },
): PatternHit | null {
  if (bars.length < 25 || !pattern.rules.conditions.length) return null
  const from = Math.max(24, bars.length - LOOKBACK_BARS)
  let bestI = -1
  for (let i = from; i < bars.length; i++) {
    if (ruleSetPasses(bars, i, pattern.rules)) bestI = i
  }
  if (bestI < 0) return null
  const bar = bars[bestI]
  const note = describeRuleSet(pattern.rules)
  return {
    id: `custom-rule-${pattern.id}-${bar.t}`,
    category: 'custom',
    name: pattern.name,
    bias: pattern.bias,
    startT: bar.t,
    endT: bar.t,
    confidence: 0.7,
    points: [{ time: bar.t, price: bar.c }],
    note: pattern.description?.trim() || note || 'Private rule',
  }
}

export function detectAllCustomRules(
  bars: OhlcBar[],
  customs: {
    id: string
    name: string
    bias: PatternBias
    description?: string
    rules?: CustomRuleSet | null
    candleShape?: CandleShapeSpec | null
    scanScript?: string | null
  }[],
): PatternHit[] {
  const hits: PatternHit[] = []
  for (const c of customs) {
    const rules = rulesFromCustom(c.rules, c.scanScript)
    if (!rules?.conditions?.length) continue
    const hit = detectCustomRule(bars, {
      id: c.id,
      name: c.name,
      bias: c.bias,
      description: c.description,
      rules,
    })
    if (hit) hits.push(hit)
  }
  hits.push(...detectAllCandleShapes(bars, customs))
  return hits
}

export function newCondition(metric: RuleMetric = 'rsi'): RuleCondition {
  const meta = RULE_METRIC_OPTIONS.find((m) => m.id === metric) ?? RULE_METRIC_OPTIONS[0]
  return {
    id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    metric: meta.id,
    op: meta.id === 'rsi' ? 'lte' : 'gte',
    value: meta.defaultValue,
  }
}

export { MAX_CONDITIONS }
