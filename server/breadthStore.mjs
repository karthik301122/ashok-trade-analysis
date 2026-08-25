import { getDb } from './db.mjs'

export const UNIVERSE_IDS = new Set(['asx200', 'asx500', 'mid', 'small'])

/**
 * @param {string} universeId
 */
export function readBreadthHistory(universeId) {
  if (!UNIVERSE_IDS.has(universeId)) return []
  const rows = getDb()
    .prepare(
      `SELECT day, above20, above50, above200, rsi50, ad_net AS adNet
       FROM breadth_daily WHERE universe = ? ORDER BY day ASC`,
    )
    .all(universeId)
  return rows.map((r) => ({
    day: r.day,
    above20: r.above20,
    above50: r.above50,
    above200: r.above200,
    rsi50: r.rsi50,
    adNet: r.adNet,
  }))
}

/**
 * @param {string} universeId
 * @param {{ above20: number, above50: number, above200: number, rsi50: number, adNet: number, day?: string }} point
 */
export function upsertBreadthPoint(universeId, point) {
  if (!UNIVERSE_IDS.has(universeId)) throw new Error('Invalid universe')
  const day = point.day || new Date().toISOString().slice(0, 10)
  getDb()
    .prepare(
      `INSERT INTO breadth_daily (universe, day, above20, above50, above200, rsi50, ad_net)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(universe, day) DO UPDATE SET
         above20 = excluded.above20,
         above50 = excluded.above50,
         above200 = excluded.above200,
         rsi50 = excluded.rsi50,
         ad_net = excluded.ad_net`,
    )
    .run(
      universeId,
      day,
      Number(point.above20),
      Number(point.above50),
      Number(point.above200),
      Number(point.rsi50),
      Number(point.adNet),
    )
  // Keep last 250 days per universe
  getDb()
    .prepare(
      `DELETE FROM breadth_daily
       WHERE universe = ?
         AND day NOT IN (
           SELECT day FROM breadth_daily WHERE universe = ? ORDER BY day DESC LIMIT 250
         )`,
    )
    .run(universeId, universeId)
  return readBreadthHistory(universeId)
}
