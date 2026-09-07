/**
 * Multi-pattern combo alerts: OR across daily+weekly, or AND within one timeframe.
 */
import {
  SPECIAL_PATTERN_CATALOG,
  specialPatternById,
  type SpecialPatternDef,
} from './specialCatalog'
import type { PatternPrefs } from '../patternPrefs'
import {
  CUSTOM_PATTERN_ALERT_PREFIX,
  decodePatternAlertId,
} from './patternAlertIds'
import type { PatternAlertOption } from './watchPatternAlertUpload'

export type PatternComboOp = 'and' | 'or'
export type PatternComboTimeframe = 'daily' | 'weekly' | 'mixed'

export type PatternComboAlert = {
  id: string
  name: string
  op: PatternComboOp
  /** AND must be daily or weekly. OR may be mixed. */
  timeframe: PatternComboTimeframe
  patternIds: string[]
  enabled: boolean
  minScore: number
}

export function newComboId(): string {
  return `combo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function clampComboMinScore(n: unknown): number {
  const v = Number(n)
  if (!Number.isFinite(v)) return 60
  return Math.max(60, Math.min(100, Math.round(v)))
}

/** Classify a pattern alert id as daily or weekly for combo pickers. */
export function patternAlertTimeframe(
  patternId: string,
  prefs?: PatternPrefs | null,
): 'daily' | 'weekly' {
  const special = specialPatternById(patternId)
  if (special?.kind === 'weekly') return 'weekly'

  if (patternId.startsWith(CUSTOM_PATTERN_ALERT_PREFIX) && prefs) {
    const customId = patternId.slice(CUSTOM_PATTERN_ALERT_PREFIX.length)
    const c = prefs.customPatterns.find((x) => x.id === customId)
    if (c?.candleShape?.timeframe === 'weekly') return 'weekly'
    if (c?.drawnSpec?.timeframe === 'weekly') return 'weekly'
  }

  return 'daily'
}

export function splitPatternOptionsByTimeframe(
  options: PatternAlertOption[],
  prefs?: PatternPrefs | null,
): { daily: PatternAlertOption[]; weekly: PatternAlertOption[] } {
  const daily: PatternAlertOption[] = []
  const weekly: PatternAlertOption[] = []
  for (const o of options) {
    if (patternAlertTimeframe(o.id, prefs) === 'weekly') weekly.push(o)
    else daily.push(o)
  }
  return { daily, weekly }
}

export function weeklySpecialPatterns(): SpecialPatternDef[] {
  return SPECIAL_PATTERN_CATALOG.filter((p) => p.kind === 'weekly')
}

/** @returns error message or null */
export function validatePatternCombo(combo: Partial<PatternComboAlert>): string | null {
  const name = String(combo.name || '').trim()
  if (name.length < 2) return 'Name must be at least 2 characters'
  if (name.length > 80) return 'Name is too long'

  const op = combo.op === 'and' || combo.op === 'or' ? combo.op : null
  if (!op) return 'Choose AND or OR'

  const ids = [...new Set((combo.patternIds || []).map((id) => String(id).trim()).filter(Boolean))]
  if (ids.length < 2) return 'Select at least two patterns'

  if (op === 'and') {
    const tf = combo.timeframe
    if (tf !== 'daily' && tf !== 'weekly') {
      return 'AND combos must be daily-only or weekly-only'
    }
  }

  return null
}

export function normalizePatternCombos(combos: PatternComboAlert[]): PatternComboAlert[] {
  const out: PatternComboAlert[] = []
  const seen = new Set<string>()
  for (const raw of combos || []) {
    const id = String(raw?.id || '').trim() || newComboId()
    if (seen.has(id)) continue
    const op: PatternComboOp = raw.op === 'and' ? 'and' : 'or'
    let timeframe: PatternComboTimeframe =
      raw.timeframe === 'daily' || raw.timeframe === 'weekly' || raw.timeframe === 'mixed'
        ? raw.timeframe
        : op === 'or'
          ? 'mixed'
          : 'daily'
    if (op === 'and' && timeframe === 'mixed') timeframe = 'daily'
    const patternIds = [...new Set((raw.patternIds || []).map((x) => String(x).trim()).filter(Boolean))]
      .sort()
    if (patternIds.length < 2) continue
    const name = String(raw.name || '').trim() || `Combo (${op.toUpperCase()})`
    out.push({
      id,
      name: name.slice(0, 80),
      op,
      timeframe,
      patternIds,
      enabled: raw.enabled !== false,
      minScore: clampComboMinScore(raw.minScore),
    })
    seen.add(id)
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export function unionPatternIdsFromCombos(combos: PatternComboAlert[]): string[] {
  const out = new Set<string>()
  for (const c of combos) {
    if (!c.enabled) continue
    for (const id of c.patternIds) out.add(id)
  }
  return [...out].sort()
}

export function describeCombo(combo: PatternComboAlert): string {
  const join = combo.op === 'and' ? ' AND ' : ' OR '
  const tf =
    combo.timeframe === 'mixed'
      ? 'daily+weekly'
      : combo.timeframe
  return `${combo.op.toUpperCase()} · ${tf} · ${combo.patternIds.length} patterns (${combo.patternIds.join(join)})`
}

export function comboPatternLabel(patternId: string, options: PatternAlertOption[]): string {
  return options.find((o) => o.id === patternId)?.patternLabel
    ?? options.find((o) => o.id === patternId)?.label
    ?? decodePatternAlertId(patternId)
    ?? patternId
}
