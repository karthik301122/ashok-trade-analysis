/**
 * One-time migration: copy data from local SQLite file into PostgreSQL (DATABASE_URL).
 *
 * Usage:
 *   DATABASE_URL=postgresql://... SQLITE_PATH=./data/asx.sqlite node scripts/migrate-sqlite-to-postgres.mjs
 */
import fs from 'fs'
import path from 'path'
import { DatabaseSync } from 'node:sqlite'
import { loadEnvFile } from '../server/loadEnv.mjs'
import { initDb, sqlRun, withTransaction } from '../server/db.mjs'

loadEnvFile()

const sqlitePath = process.env.SQLITE_PATH || path.join('data', 'asx.sqlite')
if (!process.env.DATABASE_URL?.trim()) {
  console.error('Set DATABASE_URL to your Azure PostgreSQL connection string.')
  process.exit(1)
}
if (!fs.existsSync(sqlitePath)) {
  console.error(`SQLite file not found: ${sqlitePath}`)
  process.exit(1)
}

const sqlite = new DatabaseSync(sqlitePath)
await initDb()

const tables = [
  {
    name: 'bars',
    cols: 'symbol, t, o, h, l, c, v',
    select: 'SELECT symbol, t, o, h, l, c, v FROM bars ORDER BY symbol, t',
  },
  {
    name: 'series_meta',
    cols: 'symbol, updated_at, last, high52, meta_json',
    select: 'SELECT symbol, updated_at, last, high52, meta_json FROM series_meta',
  },
  {
    name: 'breadth_daily',
    cols:
      'universe, day, above20, above50, above200, rsi50, ad_net, advancing, declining, near52w, rsi70, rsi30, rs50, rvol15',
    select:
      'SELECT universe, day, above20, above50, above200, rsi50, ad_net, advancing, declining, near52w, rsi70, rsi30, rs50, rvol15 FROM breadth_daily',
  },
  {
    name: 'market_snapshot',
    cols: 'id, built_at, as_of, loaded, failed, index_perf_json, stocks_perf_json',
    select:
      'SELECT id, built_at, as_of, loaded, failed, index_perf_json, stocks_perf_json FROM market_snapshot',
  },
  {
    name: 'snapshot_job',
    cols: 'id, status, started_at, finished_at, message, loaded, failed, total',
    select:
      'SELECT id, status, started_at, finished_at, message, loaded, failed, total FROM snapshot_job',
  },
  {
    name: 'alert_rules',
    cols: 'id, name, type, params_json, webhook_url, enabled, created_at',
    select: 'SELECT id, name, type, params_json, webhook_url, enabled, created_at FROM alert_rules',
  },
  {
    name: 'alert_events',
    cols: 'id, rule_id, ticker, message, payload_json, created_at, delivered',
    select:
      'SELECT id, rule_id, ticker, message, payload_json, created_at, delivered FROM alert_events',
  },
  {
    name: 'fundamentals',
    cols: 'ticker, updated_at, pe, forward_pe, dividend_yield, market_cap, eps, raw_json',
    select:
      'SELECT ticker, updated_at, pe, forward_pe, dividend_yield, market_cap, eps, raw_json FROM fundamentals',
  },
  {
    name: 'users',
    cols: 'username, password_hash, created_at, is_admin',
    select: 'SELECT username, password_hash, created_at, is_admin FROM users',
  },
  {
    name: 'live_quotes',
    cols: 'ticker, close, change_p, volume, quote_ts, updated_at',
    select: 'SELECT ticker, close, change_p, volume, quote_ts, updated_at FROM live_quotes',
  },
  {
    name: 'pattern_scan_state',
    cols: 'ticker, pattern_id, score, confirmed, updated_at',
    select: 'SELECT ticker, pattern_id, score, confirmed, updated_at FROM pattern_scan_state',
  },
]

for (const table of tables) {
  const rows = sqlite.prepare(table.select).all()
  if (!rows.length) {
    console.log(`${table.name}: skip (empty)`)
    continue
  }
  const placeholders = table.cols.split(',').map(() => '?').join(', ')
  let n = 0
  await withTransaction(async (tx) => {
    for (const row of rows) {
      const values = table.cols.split(',').map((c) => row[c.trim()])
      await tx.sqlRun(
        `INSERT INTO ${table.name} (${table.cols}) VALUES (${placeholders})
         ON CONFLICT DO NOTHING`,
        values,
      )
      n++
    }
  })
  console.log(`${table.name}: migrated ${n} rows`)
}

console.log('Done. Set DATABASE_URL on Azure App Service and restart the app.')
