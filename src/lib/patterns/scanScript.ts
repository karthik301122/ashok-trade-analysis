/**
 * ScanScript — desk pattern language for full-universe OHLC scans.
 * Compiles to CustomRuleSet (no arbitrary code execution).
 */
import type { CustomRuleSet, RuleCondition, RuleMetric, RuleOp } from './customRules'

export const SCANSCRIPT_NAME = 'ScanScript'

export const SCANSCRIPT_EXAMPLE = `# ${SCANSCRIPT_NAME} — scans all stocks when saved as My Pattern
match all

rsi(14) <= 35
rvol >= 1.5
above_sma(50)
above_sma(200)
pct_chg(5) >= 3
`

/** User-facing rules guide for Create pattern → ScanScript. */
export const SCANSCRIPT_GUIDE = {
  summary:
    'Write one condition per line. Scripts compile to safe desk rules (no arbitrary code) and scan the ASX universe when saved.',
  headers: [
    { code: 'match all', meaning: 'Every condition must pass (AND). Default.' },
    { code: 'match any', meaning: 'Any one condition can pass (OR).' },
    { code: 'bias bullish', meaning: 'Optional label: bullish, bearish, or neutral.' },
  ],
  metrics: [
    { code: 'rsi(14)', meaning: 'RSI(14). Compare with <= >= < > (period must be 14).' },
    { code: 'rvol', meaning: 'Relative volume vs recent average.' },
    { code: 'pct_chg(5)', meaning: '% change over 5 sessions (also pct_chg(20)).' },
    { code: 'above_sma(50)', meaning: 'Close above SMA. Periods: 20, 50, 200.' },
    { code: 'below_sma(200)', meaning: 'Close below SMA (20 / 50 / 200).' },
    { code: 'above_ema(21)', meaning: 'Close above EMA(21) only.' },
    { code: 'below_ema(21)', meaning: 'Close below EMA(21) only.' },
  ],
  tips: [
    'Lines starting with # are comments.',
    'Max 8 conditions per script.',
    'Operators: > >= < <= (also ≥ ≤).',
    'Fires if true on a recent session (same engine as My conditions).',
  ],
  examples: [
    {
      title: 'Oversold bounce watch',
      script: `match all
rsi(14) <= 35
rvol >= 1.5
above_sma(50)`,
    },
    {
      title: 'Quiet pullback in uptrend',
      script: `bias bullish
match all
above_sma(50)
above_sma(200)
pct_chg(5) <= 3
rvol <= 0.8
rsi(14) >= 45
rsi(14) <= 70`,
    },
  ],
} as const

/** VCP Setup — Stage 2 trend, contraction, volume dry-up, healthy RSI (daily OHLC). */
export const VCP_SETUP_SCRIPT = `bias bullish
match all

above_sma(50)
above_sma(200)
pct_chg(20) <= 8
pct_chg(5) <= 3
rvol <= 0.8
rsi(14) >= 45
rsi(14) <= 70
`

export type ScanScriptCompileResult =
  | { ok: true; rules: CustomRuleSet; bias?: 'bullish' | 'bearish' | 'neutral' }
  | { ok: false; errors: string[] }

const MAX_SCRIPT_CONDITIONS = 8

const OP_MAP: Record<string, RuleOp> = {
  '>': 'gt',
  '>=': 'gte',
  '≥': 'gte',
  '<': 'lt',
  '<=': 'lte',
  '≤': 'lte',
}

function parseOp(raw: string): RuleOp | null {
  return OP_MAP[raw.trim()] ?? null
}

function condId(i: number) {
  return `ss-${i}`
}

function aboveSmaMetric(period: number): RuleMetric | null {
  if (period === 20) return 'pct_above_sma20'
  if (period === 50) return 'pct_above_sma50'
  if (period === 200) return 'pct_above_sma200'
  return null
}

type ParsedCond = { metric: RuleMetric; op: RuleOp; value: number }

function parseConditionLine(line: string, lineNo: number): ParsedCond | { error: string } {
  const trimmed = line.trim()
  if (!trimmed) return { error: `Line ${lineNo}: empty condition` }

  // above_sma(50) — close above MA
  let m = trimmed.match(/^above_sma\((\d+)\)\s*$/i)
  if (m) {
    const metric = aboveSmaMetric(Number(m[1]))
    if (!metric) return { error: `Line ${lineNo}: above_sma supports 20, 50, 200` }
    return { metric, op: 'gt', value: 0 }
  }

  m = trimmed.match(/^below_sma\((\d+)\)\s*$/i)
  if (m) {
    const metric = aboveSmaMetric(Number(m[1]))
    if (!metric) return { error: `Line ${lineNo}: below_sma supports 20, 50, 200` }
    return { metric, op: 'lt', value: 0 }
  }

  m = trimmed.match(/^above_ema\((\d+)\)\s*$/i)
  if (m) {
    const p = Number(m[1])
    if (p !== 21) return { error: `Line ${lineNo}: above_ema only supports 21` }
    return { metric: 'pct_above_ema21', op: 'gt', value: 0 }
  }

  m = trimmed.match(/^below_ema\((\d+)\)\s*$/i)
  if (m) {
    const p = Number(m[1])
    if (p !== 21) return { error: `Line ${lineNo}: below_ema only supports 21` }
    return { metric: 'pct_above_ema21', op: 'lt', value: 0 }
  }

  // rsi(14) <= 30  |  rvol >= 1.5  |  pct_chg(5) >= 3  |  pct_chg(20d) >= 8
  m = trimmed.match(/^(\w+)\s*(?:\(([^)]*)\))?\s*(>=|<=|≥|≤|>|<)\s*(-?\d+(?:\.\d+)?)\s*$/i)
  if (!m) return { error: `Line ${lineNo}: invalid syntax — ${trimmed}` }

  const fn = m[1].toLowerCase()
  const arg = m[2]?.trim().replace(/d$/i, '') ?? ''
  const op = parseOp(m[3])
  const value = Number(m[4])
  if (!op || !Number.isFinite(value)) return { error: `Line ${lineNo}: bad operator or value` }

  if (fn === 'rsi' || fn === 'rsi14') {
    const period = arg ? Number(arg) : 14
    if (period !== 14) return { error: `Line ${lineNo}: rsi() only supports period 14` }
    return { metric: 'rsi', op, value }
  }

  if (fn === 'rvol' || fn === 'relative_volume' || fn === 'rel_volume') {
    return { metric: 'rvol', op, value }
  }

  if (fn === 'pct_chg' || fn === 'pct_change' || fn === 'change') {
    const days = arg ? Number(arg) : 0
    if (days === 5) return { metric: 'pct_change_5d', op, value }
    if (days === 20) return { metric: 'pct_change_20d', op, value }
    return { error: `Line ${lineNo}: pct_chg supports 5 or 20 (days)` }
  }

  if (fn === 'above_sma' && arg) {
    const metric = aboveSmaMetric(Number(arg))
    if (!metric) return { error: `Line ${lineNo}: above_sma supports 20, 50, 200` }
    return { metric, op, value }
  }

  if (fn === 'below_sma' && arg) {
    const metric = aboveSmaMetric(Number(arg))
    if (!metric) return { error: `Line ${lineNo}: below_sma supports 20, 50, 200` }
    return { metric, op, value }
  }

  return { error: `Line ${lineNo}: unknown metric "${fn}"` }
}

/**
 * Parse ScanScript source into a CustomRuleSet.
 */
export function compileScanScript(source: string): ScanScriptCompileResult {
  const errors: string[] = []
  let match: 'all' | 'any' = 'all'
  let bias: 'bullish' | 'bearish' | 'neutral' | undefined
  const conditions: RuleCondition[] = []

  const lines = source.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim()
    if (!raw || raw.startsWith('#')) continue

    const biasM = raw.match(/^bias\s*:?\s*(bullish|bearish|neutral)\s*$/i)
    if (biasM) {
      bias = biasM[1].toLowerCase() as 'bullish' | 'bearish' | 'neutral'
      continue
    }

    const matchM = raw.match(/^match\s*:?\s*(all|any)\s*$/i)
    if (matchM) {
      match = matchM[1].toLowerCase() === 'any' ? 'any' : 'all'
      continue
    }

    const parsed = parseConditionLine(raw, i + 1)
    if ('error' in parsed) {
      errors.push(parsed.error)
      continue
    }
    if (conditions.length >= MAX_SCRIPT_CONDITIONS) {
      errors.push(`Line ${i + 1}: max ${MAX_SCRIPT_CONDITIONS} conditions`)
      continue
    }
    conditions.push({
      id: condId(conditions.length),
      metric: parsed.metric,
      op: parsed.op,
      value: parsed.value,
    })
  }

  if (conditions.length === 0) {
    errors.push('Add at least one condition (see example)')
  }

  if (errors.length) return { ok: false, errors }

  return {
    ok: true,
    rules: { match, conditions },
    bias,
  }
}

export function validateScanScript(source: string): string[] {
  const r = compileScanScript(source)
  return r.ok ? [] : r.errors
}

export function describeScanScript(source: string | null | undefined): string {
  if (!source?.trim()) return ''
  const compiled = compileScanScript(source)
  if (!compiled.ok) return 'Invalid ScanScript'
  const join = compiled.rules.match === 'any' ? ' OR ' : ' AND '
  const parts = compiled.rules.conditions.map((c) => {
    const op =
      c.op === 'gt'
        ? '>'
        : c.op === 'gte'
          ? '≥'
          : c.op === 'lt'
            ? '<'
            : '≤'
    return `${c.metric} ${op} ${c.value}`
  })
  return parts.join(join)
}

/** Resolve rules from stored script or return existing rules. */
export function rulesFromCustom(
  rules: CustomRuleSet | null | undefined,
  scanScript: string | null | undefined,
): CustomRuleSet | null {
  if (rules?.conditions?.length) return rules
  if (!scanScript?.trim()) return null
  const compiled = compileScanScript(scanScript)
  return compiled.ok ? compiled.rules : null
}
