import type { PatternPrefs } from '../patternPrefs'
import type { PatternScanUploadRow } from '../patternScanApi'
import { isDetectableCustom } from '../overviewPatternHits'
import {
  SPECIAL_PATTERN_CATALOG,
  isSpecialPatternName,
} from './specialCatalog'
import type { PatternHit } from './types'
import {
  chartPatternAlertId,
  customPatternAlertId,
  decodePatternAlertId,
  CHART_PATTERN_ALERT_PREFIX,
  CUSTOM_PATTERN_ALERT_PREFIX,
} from './patternAlertIds'

export const PATTERN_ALERT_CONFIRMED_SCORE = 85

export type PatternAlertOption = {
  id: string
  label: string
  patternLabel: string
}

export function confidenceToAlertScore(confidence: number): number {
  return Math.round(Math.max(0, Math.min(1, confidence)) * 100)
}

export function hitToPatternUploadRow(
  ticker: string,
  patternId: string,
  confidence: number,
): PatternScanUploadRow | null {
  const score = confidenceToAlertScore(confidence)
  if (score < 60) return null
  return {
    ticker: ticker.toUpperCase(),
    patternId,
    score,
    confirmed: score >= PATTERN_ALERT_CONFIRMED_SCORE,
  }
}

/** Upload rows for starred chart patterns + My Patterns after a daily OHLC scan. */
export function collectWatchPatternUploadRows(
  ticker: string,
  prefs: PatternPrefs,
  catalogHits: PatternHit[],
  customHits: PatternHit[],
): PatternScanUploadRow[] {
  const byName = new Map<string, PatternHit>()
  for (const h of catalogHits) {
    const prev = byName.get(h.name)
    if (!prev || h.endT > prev.endT) byName.set(h.name, h)
  }

  const rows: PatternScanUploadRow[] = []

  for (const name of prefs.starredNames) {
    if (isSpecialPatternName(name)) continue
    const hit = byName.get(name)
    if (!hit) continue
    const row = hitToPatternUploadRow(ticker, chartPatternAlertId(name), hit.confidence)
    if (row) rows.push(row)
  }

  for (const c of prefs.customPatterns) {
    if (!isDetectableCustom(c)) continue
    let hit = customHits.find((h) => h.name === c.name)
    if (!hit && c.basedOn) {
      const base = byName.get(c.basedOn)
      if (base) {
        hit = { ...base, name: c.name, bias: c.bias }
      }
    }
    if (!hit) continue
    const row = hitToPatternUploadRow(ticker, customPatternAlertId(c.id), hit.confidence)
    if (row) rows.push(row)
  }

  return rows
}

/** Upload rows for explicit per-stock alert pattern ids (not only ★ starred). */
export function collectAlertWatchUploadRows(
  ticker: string,
  patternIds: string[],
  catalogHits: PatternHit[],
  customHits: PatternHit[],
  prefs: PatternPrefs,
): PatternScanUploadRow[] {
  if (!patternIds.length) return []
  const byName = new Map<string, PatternHit>()
  for (const h of catalogHits) {
    const prev = byName.get(h.name)
    if (!prev || h.endT > prev.endT) byName.set(h.name, h)
  }

  const rows: PatternScanUploadRow[] = []
  const seen = new Set<string>()

  for (const pid of patternIds) {
    if (pid.startsWith(CHART_PATTERN_ALERT_PREFIX)) {
      const name = decodePatternAlertId(pid)
      const hit = byName.get(name)
      if (!hit) continue
      const row = hitToPatternUploadRow(ticker, pid, hit.confidence)
      if (row && !seen.has(pid)) {
        seen.add(pid)
        rows.push(row)
      }
    } else if (pid.startsWith(CUSTOM_PATTERN_ALERT_PREFIX)) {
      const customId = pid.slice(CUSTOM_PATTERN_ALERT_PREFIX.length)
      const c = prefs.customPatterns.find((x) => x.id === customId)
      if (!c || !isDetectableCustom(c)) continue
      let hit = customHits.find((h) => h.name === c.name)
      if (!hit && c.basedOn) {
        const base = byName.get(c.basedOn)
        if (base) hit = { ...base, name: c.name, bias: c.bias }
      }
      if (!hit) continue
      const row = hitToPatternUploadRow(ticker, pid, hit.confidence)
      if (row && !seen.has(pid)) {
        seen.add(pid)
        rows.push(row)
      }
    }
  }

  return rows
}

/** All patterns the user can target in Alerts (special + ★ starred + My Patterns). */
export function buildPatternAlertOptions(prefs: PatternPrefs): PatternAlertOption[] {
  const out: PatternAlertOption[] = []

  for (const p of SPECIAL_PATTERN_CATALOG) {
    out.push({
      id: p.id,
      label: `${p.name} (special)`,
      patternLabel: p.name,
    })
  }

  for (const name of prefs.starredNames) {
    if (isSpecialPatternName(name)) continue
    out.push({
      id: chartPatternAlertId(name),
      label: `★ ${name}`,
      patternLabel: name,
    })
  }

  for (const c of prefs.customPatterns) {
    if (!isDetectableCustom(c)) continue
    out.push({
      id: customPatternAlertId(c.id),
      label: `My: ${c.name}`,
      patternLabel: c.name,
    })
  }

  return out.sort((a, b) => a.label.localeCompare(b.label))
}
