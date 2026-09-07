/**
 * Multi-pattern combo alert matching (AND / OR) against pattern_scan_state.
 */
import { sqlAll } from './db.mjs'

/**
 * @param {string[]} patternIds
 * @param {number} minScore
 * @returns {Promise<Array<{ ticker: string, patternId: string, score: number, confirmed: boolean }>>}
 */
export async function queryScoresForPatterns(patternIds, minScore = 60) {
  const ids = [...new Set((patternIds || []).map((id) => String(id).trim()).filter(Boolean))]
  if (!ids.length) return []
  const placeholders = ids.map(() => '?').join(',')
  const rows = await sqlAll(
    `SELECT ticker, pattern_id AS "patternId", score, confirmed
     FROM pattern_scan_state
     WHERE score >= ? AND pattern_id IN (${placeholders})
     ORDER BY ticker, score DESC`,
    [Number(minScore) || 60, ...ids],
  )
  return rows.map((r) => ({
    ticker: String(r.ticker),
    patternId: String(r.patternId ?? r.pattern_id),
    score: Number(r.score),
    confirmed: Boolean(r.confirmed),
  }))
}

/**
 * @param {{
 *   op: 'and' | 'or',
 *   patternIds: string[],
 *   minScore?: number,
 *   name?: string,
 *   comboId?: string,
 *   timeframe?: string,
 * }} combo
 * @returns {Promise<Array<{ ticker: string, message: string, payload: object }>>}
 */
export async function matchPatternCombo(combo) {
  const op = combo.op === 'and' ? 'and' : 'or'
  const patternIds = [...new Set((combo.patternIds || []).map((id) => String(id).trim()).filter(Boolean))]
  if (patternIds.length < 2) return []

  const minScore = Number(combo.minScore ?? 60)
  const rows = await queryScoresForPatterns(patternIds, minScore)
  /** @type {Map<string, Map<string, { score: number, confirmed: boolean }>>} */
  const byTicker = new Map()
  for (const r of rows) {
    let m = byTicker.get(r.ticker)
    if (!m) {
      m = new Map()
      byTicker.set(r.ticker, m)
    }
    const prev = m.get(r.patternId)
    if (!prev || r.score > prev.score) {
      m.set(r.patternId, { score: r.score, confirmed: r.confirmed })
    }
  }

  const name = String(combo.name || 'Pattern combo').trim() || 'Pattern combo'
  const out = []
  for (const [ticker, hits] of byTicker) {
    const hitIds = patternIds.filter((id) => hits.has(id))
    if (op === 'and' && hitIds.length < patternIds.length) continue
    if (op === 'or' && hitIds.length === 0) continue

    const scores = hitIds.map((id) => hits.get(id).score)
    const minHit = Math.min(...scores)
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    const allConfirmed = hitIds.every((id) => hits.get(id)?.confirmed)
    // AND: weakest-link score. OR: average of patterns that hit.
    const score = op === 'and' ? minHit : avg
    const labels = hitIds.join(', ')
    const message =
      op === 'and'
        ? `${ticker} ${name}: all ${patternIds.length} patterns hit (${labels})`
        : `${ticker} ${name}: ${hitIds.length}/${patternIds.length} patterns hit (${labels})`

    out.push({
      ticker,
      message,
      payload: {
        comboId: combo.comboId || null,
        patternId: `combo:${combo.comboId || 'x'}`,
        patternIds: hitIds,
        requiredPatternIds: patternIds,
        op,
        timeframe: combo.timeframe || null,
        score,
        confirmed: allConfirmed,
      },
    })
  }

  // Strongest first: confirmed ahead of forming, then higher combo score, then ticker.
  out.sort((a, b) => {
    const ac = a.payload.confirmed ? 1 : 0
    const bc = b.payload.confirmed ? 1 : 0
    if (bc !== ac) return bc - ac
    if (b.payload.score !== a.payload.score) return b.payload.score - a.payload.score
    return String(a.ticker).localeCompare(String(b.ticker))
  })

  return out.slice(0, 200)
}
