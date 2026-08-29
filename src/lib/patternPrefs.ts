import type { PatternBias } from './patterns/types'
import {
  normalizeRuleSet,
  type CustomRuleSet,
} from './patterns/customRules'
import {
  normalizeCandleShape,
  type CandleShapeSpec,
} from './patterns/candleShape'
import {
  compileScanScript,
  rulesFromCustom,
} from './patterns/scanScript'
import {
  DEFAULT_PATTERN_SCAN_WINDOW,
  parsePatternScanWindow,
  type PatternScanWindow,
} from './patterns/scanWindow'
import { parseChartIntervalPref, type ChartIntervalPref } from './chartInterval'

export type CustomPattern = {
  id: string
  name: string
  bias: PatternBias
  description: string
  /** Reuse an existing catalog detector under this custom name */
  basedOn: string | null
  /** Private condition rules (AND/OR). */
  rules: CustomRuleSet | null
  /** Candle geometry builder (daily/weekly). Preferred over rules when set. */
  candleShape: CandleShapeSpec | null
  /** ScanScript source — compiled to rules on save. */
  scanScript: string | null
  createdAt: number
}

export type PatternPrefs = {
  starredNames: string[]
  customPatterns: CustomPattern[]
  /** Pattern hits must end within this window from latest bar. */
  scanWindow: PatternScanWindow
  /** Chart bar interval — auto matches scan window; 1d is daily only. */
  chartInterval: ChartIntervalPref
}

const EMPTY: PatternPrefs = {
  starredNames: [],
  customPatterns: [],
  scanWindow: DEFAULT_PATTERN_SCAN_WINDOW,
  chartInterval: 'auto',
}

function storageKey(user: string | null) {
  const who = user?.trim() || 'local'
  return `asx-pattern-prefs:${who}`
}

function parseCustom(p: unknown): CustomPattern | null {
  if (p == null || typeof p !== 'object') return null
  const o = p as Partial<CustomPattern>
  if (typeof o.id !== 'string' || typeof o.name !== 'string') return null
  const bias: PatternBias =
    o.bias === 'bearish' || o.bias === 'neutral' || o.bias === 'bullish' ? o.bias : 'neutral'
  const custom: CustomPattern = {
    id: o.id,
    name: o.name,
    bias,
    description: typeof o.description === 'string' ? o.description : '',
    basedOn: typeof o.basedOn === 'string' && o.basedOn.trim() ? o.basedOn.trim() : null,
    rules: normalizeRuleSet(o.rules),
    candleShape: normalizeCandleShape(o.candleShape),
    scanScript: typeof o.scanScript === 'string' && o.scanScript.trim() ? o.scanScript.trim() : null,
    createdAt: typeof o.createdAt === 'number' ? o.createdAt : Date.now(),
  }
  const rules = rulesFromCustom(custom.rules, custom.scanScript)
  if (rules && !custom.rules?.conditions?.length) {
    custom.rules = rules
  }
  return custom
}

export function loadPatternPrefs(user: string | null): PatternPrefs {
  try {
    const raw = localStorage.getItem(storageKey(user))
    if (!raw) return { ...EMPTY, starredNames: [], customPatterns: [] }
    const parsed = JSON.parse(raw) as Partial<PatternPrefs>
    return {
      starredNames: Array.isArray(parsed.starredNames)
        ? parsed.starredNames.filter((n): n is string => typeof n === 'string')
        : [],
      customPatterns: Array.isArray(parsed.customPatterns)
        ? parsed.customPatterns.map(parseCustom).filter((p): p is CustomPattern => p != null)
        : [],
      scanWindow: parsePatternScanWindow(parsed.scanWindow),
      chartInterval: parseChartIntervalPref(parsed.chartInterval, parsed.intradayChart),
    }
  } catch {
    return { ...EMPTY, starredNames: [], customPatterns: [] }
  }
}

export function savePatternPrefs(user: string | null, prefs: PatternPrefs) {
  localStorage.setItem(storageKey(user), JSON.stringify(prefs))
}

export function toggleStarredName(prefs: PatternPrefs, name: string): PatternPrefs {
  const set = new Set(prefs.starredNames)
  if (set.has(name)) set.delete(name)
  else set.add(name)
  return { ...prefs, starredNames: [...set].sort((a, b) => a.localeCompare(b)) }
}

export function addCustomPattern(
  prefs: PatternPrefs,
  input: {
    name: string
    bias: PatternBias
    description: string
    basedOn: string | null
    rules?: CustomRuleSet | null
    candleShape?: CandleShapeSpec | null
    scanScript?: string | null
  },
): PatternPrefs {
  const name = input.name.trim()
  if (!name) return prefs
  const candleShape = normalizeCandleShape(input.candleShape)
  let scanScript =
    typeof input.scanScript === 'string' && input.scanScript.trim()
      ? input.scanScript.trim()
      : null
  let rules = candleShape ? null : normalizeRuleSet(input.rules)
  const basedOn = candleShape || rules || scanScript ? null : input.basedOn?.trim() || null

  if (scanScript && !candleShape) {
    const compiled = compileScanScript(scanScript)
    if (!compiled.ok) return prefs
    rules = compiled.rules
    if (compiled.bias) {
      input = { ...input, bias: compiled.bias }
    }
  } else if (!candleShape && !rules) {
    scanScript = null
  }

  const custom: CustomPattern = {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    bias: input.bias,
    description: input.description.trim(),
    basedOn,
    rules,
    candleShape,
    scanScript,
    createdAt: Date.now(),
  }
  return { ...prefs, customPatterns: [...prefs.customPatterns, custom] }
}

export function removeCustomPattern(prefs: PatternPrefs, id: string): PatternPrefs {
  const removed = prefs.customPatterns.find((p) => p.id === id)
  const customPatterns = prefs.customPatterns.filter((p) => p.id !== id)
  const starredNames = removed
    ? prefs.starredNames.filter((n) => n !== removed.name)
    : prefs.starredNames
  return { ...prefs, customPatterns, starredNames }
}

export function setPatternScanWindow(
  prefs: PatternPrefs,
  scanWindow: PatternScanWindow,
): PatternPrefs {
  return { ...prefs, scanWindow: parsePatternScanWindow(scanWindow) }
}

export function setChartInterval(prefs: PatternPrefs, chartInterval: ChartIntervalPref): PatternPrefs {
  return { ...prefs, chartInterval: parseChartIntervalPref(chartInterval) }
}
