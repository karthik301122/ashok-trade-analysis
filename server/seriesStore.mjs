import { getDb } from './db.mjs'

export const SERIES_FRESH_MS = 18 * 60 * 60 * 1000

export function isSeriesFresh(updatedAt, now = Date.now()) {
  return Number.isFinite(updatedAt) && now - updatedAt < SERIES_FRESH_MS
}

export function isoFromUnix(t) {
  return new Date(t * 1000).toISOString().slice(0, 10)
}

export function isoMinusDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

export function recomputeHigh52(closes) {
  if (!closes.length) return 0
  const last = closes[closes.length - 1]
  const yearAgo = last.t - 365 * 24 * 3600
  const lastYear = closes.filter((b) => b.t >= yearAgo)
  return Math.max(...lastYear.map((b) => b.h ?? b.c), last.c)
}

export function mergeBars(a, b) {
  const map = new Map()
  for (const bar of a) map.set(bar.t, bar)
  for (const bar of b) map.set(bar.t, bar)
  return [...map.values()].sort((x, y) => x.t - y.t)
}

/**
 * @param {string} symbol
 * @returns {{ symbol: string, updatedAt: number, closes: object[], last: number, high52: number, meta?: object } | null}
 */
export function readSeriesCache(symbol) {
  const db = getDb()
  const meta = db.prepare('SELECT * FROM series_meta WHERE symbol = ?').get(symbol)
  if (!meta) return null
  const rows = db
    .prepare('SELECT t, o, h, l, c, v FROM bars WHERE symbol = ? ORDER BY t ASC')
    .all(symbol)
  if (!rows.length) return null
  let metaObj = {}
  try {
    metaObj = meta.meta_json ? JSON.parse(meta.meta_json) : {}
  } catch {
    metaObj = {}
  }
  return {
    symbol,
    updatedAt: Number(meta.updated_at),
    closes: rows.map((r) => ({
      t: r.t,
      o: r.o,
      h: r.h,
      l: r.l,
      c: r.c,
      v: r.v,
    })),
    last: Number(meta.last),
    high52: Number(meta.high52),
    meta: metaObj,
  }
}

/**
 * @param {{ symbol: string, updatedAt: number, closes: object[], last: number, high52: number, meta?: object }} data
 */
export function writeSeriesCache(data) {
  const db = getDb()
  const upsertMeta = db.prepare(`
    INSERT INTO series_meta (symbol, updated_at, last, high52, meta_json)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(symbol) DO UPDATE SET
      updated_at = excluded.updated_at,
      last = excluded.last,
      high52 = excluded.high52,
      meta_json = excluded.meta_json
  `)
  const upsertBar = db.prepare(`
    INSERT INTO bars (symbol, t, o, h, l, c, v)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol, t) DO UPDATE SET
      o = excluded.o, h = excluded.h, l = excluded.l, c = excluded.c, v = excluded.v
  `)

  db.exec('BEGIN')
  try {
    upsertMeta.run(
      data.symbol,
      data.updatedAt,
      data.last,
      data.high52,
      JSON.stringify(data.meta || {}),
    )
    for (const b of data.closes) {
      upsertBar.run(data.symbol, b.t, b.o, b.h, b.l, b.c, b.v ?? 0)
    }
    db.exec('COMMIT')
  } catch (err) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // ignore
    }
    throw err
  }
}
