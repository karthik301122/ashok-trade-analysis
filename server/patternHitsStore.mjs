import { sqlOne, sqlRun } from './db.mjs'

/**
 * @param {{ asOf: string, universe: string, hits: object[], counts: Record<string, number> }} payload
 */
export async function savePatternHitsDay(payload) {
  const asOf = String(payload.asOf || '').slice(0, 32)
  if (!asOf) return false
  const builtAt = Date.now()
  await sqlRun(
    `INSERT INTO pattern_hits_day (as_of, built_at, universe, hits_json, counts_json)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(as_of) DO UPDATE SET
       built_at = excluded.built_at,
       universe = excluded.universe,
       hits_json = excluded.hits_json,
       counts_json = excluded.counts_json`,
    [
      asOf,
      builtAt,
      String(payload.universe || 'asx200'),
      JSON.stringify(payload.hits || []),
      JSON.stringify(payload.counts || {}),
    ],
  )
  return true
}

export async function readLatestPatternHitsDay() {
  const row = await sqlOne(
    `SELECT as_of AS "asOf", built_at AS "builtAt", universe, hits_json AS "hitsJson", counts_json AS "countsJson"
     FROM pattern_hits_day
     ORDER BY built_at DESC
     LIMIT 1`,
  )
  if (!row) return null
  let hits = []
  let counts = {}
  try {
    hits = JSON.parse(row.hitsJson || '[]')
  } catch {
    hits = []
  }
  try {
    counts = JSON.parse(row.countsJson || '{}')
  } catch {
    counts = {}
  }
  return {
    asOf: row.asOf,
    builtAt: Number(row.builtAt),
    universe: row.universe,
    hits: Array.isArray(hits) ? hits : [],
    counts: counts && typeof counts === 'object' ? counts : {},
  }
}

export async function readPatternHitsDay(asOf) {
  if (!asOf || asOf === 'latest') return readLatestPatternHitsDay()
  const row = await sqlOne(
    `SELECT as_of AS "asOf", built_at AS "builtAt", universe, hits_json AS "hitsJson", counts_json AS "countsJson"
     FROM pattern_hits_day WHERE as_of = ?`,
    [String(asOf)],
  )
  if (!row) return null
  let hits = []
  let counts = {}
  try {
    hits = JSON.parse(row.hitsJson || '[]')
  } catch {
    hits = []
  }
  try {
    counts = JSON.parse(row.countsJson || '{}')
  } catch {
    counts = {}
  }
  return {
    asOf: row.asOf,
    builtAt: Number(row.builtAt),
    universe: row.universe,
    hits: Array.isArray(hits) ? hits : [],
    counts: counts && typeof counts === 'object' ? counts : {},
  }
}
