import { getDb } from './db.mjs'

export function upsertPatternScanBatch(entries) {
  if (!Array.isArray(entries) || !entries.length) return 0
  const db = getDb()
  const stmt = db.prepare(
    `INSERT INTO pattern_scan_state (ticker, pattern_id, score, confirmed, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(ticker, pattern_id) DO UPDATE SET
       score = excluded.score,
       confirmed = excluded.confirmed,
       updated_at = excluded.updated_at`,
  )
  const now = Date.now()
  let n = 0
  db.exec('BEGIN')
  try {
    for (const row of entries) {
      const ticker = String(row.ticker || '').toUpperCase()
      const patternId = String(row.patternId || '')
      const score = Number(row.score)
      if (!ticker || !patternId || !Number.isFinite(score)) continue
      stmt.run(ticker, patternId, score, row.confirmed ? 1 : 0, now)
      n++
    }
    db.exec('COMMIT')
  } catch (err) {
    try {
      db.exec('ROLLBACK')
    } catch {
      /* ignore */
    }
    throw err
  }
  return n
}

/**
 * @param {{ patternId?: string, minScore?: number, confirmed?: boolean }} opts
 */
export function queryPatternScanState(opts = {}) {
  const minScore = Number(opts.minScore ?? 0)
  const patternId = opts.patternId ? String(opts.patternId) : null
  const confirmed = opts.confirmed

  let sql = `SELECT ticker, pattern_id AS patternId, score, confirmed, updated_at AS updatedAt
             FROM pattern_scan_state WHERE score >= ?`
  const params = [minScore]
  if (patternId) {
    sql += ' AND pattern_id = ?'
    params.push(patternId)
  }
  if (confirmed === true) sql += ' AND confirmed = 1'
  if (confirmed === false) sql += ' AND confirmed = 0'
  sql += ' ORDER BY score DESC LIMIT 500'

  return getDb()
    .prepare(sql)
    .all(...params)
    .map((r) => ({
      ticker: r.ticker,
      patternId: r.patternId,
      score: Number(r.score),
      confirmed: Boolean(r.confirmed),
      updatedAt: Number(r.updatedAt),
    }))
}
