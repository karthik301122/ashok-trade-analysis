import { sqlAll, sqlRun } from './db.mjs'

export const UNIVERSE_IDS = new Set(['asx200', 'asx500', 'mid', 'small'])

function mapRow(r) {
  return {
    day: r.day,
    above20: r.above20,
    above50: r.above50,
    above200: r.above200,
    rsi50: r.rsi50,
    adNet: r.adNet ?? r.ad_net,
    advancing: r.advancing ?? null,
    declining: r.declining ?? null,
    near52w: r.near52w ?? null,
    rsi70: r.rsi70 ?? null,
    rsi30: r.rsi30 ?? null,
    rs50: r.rs50 ?? null,
    rvol15: r.rvol15 ?? null,
  }
}

/**
 * @param {string} universeId
 */
export async function readBreadthHistory(universeId) {
  if (!UNIVERSE_IDS.has(universeId)) return []
  const rows = await sqlAll(
    `SELECT day, above20, above50, above200, rsi50, ad_net AS "adNet",
            advancing, declining, near52w, rsi70, rsi30, rs50, rvol15
     FROM breadth_daily WHERE universe = ? ORDER BY day ASC`,
    [universeId],
  )
  return rows.map(mapRow)
}

/**
 * @param {string} universeId
 * @param {{
 *   above20: number, above50: number, above200: number, rsi50: number, adNet: number,
 *   day?: string, advancing?: number, declining?: number, near52w?: number,
 *   rsi70?: number, rsi30?: number, rs50?: number, rvol15?: number
 * }} point
 */
export async function upsertBreadthPoint(universeId, point) {
  if (!UNIVERSE_IDS.has(universeId)) throw new Error('Invalid universe')
  const day = point.day || new Date().toISOString().slice(0, 10)
  const num = (v) => (v == null || v === '' ? null : Number(v))
  await sqlRun(
    `INSERT INTO breadth_daily (
       universe, day, above20, above50, above200, rsi50, ad_net,
       advancing, declining, near52w, rsi70, rsi30, rs50, rvol15
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(universe, day) DO UPDATE SET
       above20 = excluded.above20,
       above50 = excluded.above50,
       above200 = excluded.above200,
       rsi50 = excluded.rsi50,
       ad_net = excluded.ad_net,
       advancing = excluded.advancing,
       declining = excluded.declining,
       near52w = excluded.near52w,
       rsi70 = excluded.rsi70,
       rsi30 = excluded.rsi30,
       rs50 = excluded.rs50,
       rvol15 = excluded.rvol15`,
    [
      universeId,
      day,
      Number(point.above20),
      Number(point.above50),
      Number(point.above200),
      Number(point.rsi50),
      Number(point.adNet),
      num(point.advancing),
      num(point.declining),
      num(point.near52w),
      num(point.rsi70),
      num(point.rsi30),
      num(point.rs50),
      num(point.rvol15),
    ],
  )
  await sqlRun(
    `DELETE FROM breadth_daily
     WHERE universe = ?
       AND day NOT IN (
         SELECT day FROM breadth_daily WHERE universe = ? ORDER BY day DESC LIMIT 250
       )`,
    [universeId, universeId],
  )
  return readBreadthHistory(universeId)
}
