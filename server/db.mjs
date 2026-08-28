import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { DatabaseSync } from 'node:sqlite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

/** @type {DatabaseSync | null} */
let dbSingleton = null

export function dbPath() {
  const custom = process.env.DATABASE_PATH || process.env.CACHE_DIR
  if (custom) {
    const p = path.resolve(custom)
    if (p.endsWith('.db') || p.endsWith('.sqlite')) return p
    fs.mkdirSync(p, { recursive: true })
    return path.join(p, 'asx.sqlite')
  }
  const dir = path.join(root, 'data')
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'asx.sqlite')
}

export function getDb() {
  if (dbSingleton) return dbSingleton
  const file = dbPath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS bars (
      symbol TEXT NOT NULL,
      t INTEGER NOT NULL,
      o REAL NOT NULL,
      h REAL NOT NULL,
      l REAL NOT NULL,
      c REAL NOT NULL,
      v REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (symbol, t)
    );
    CREATE TABLE IF NOT EXISTS series_meta (
      symbol TEXT PRIMARY KEY,
      updated_at INTEGER NOT NULL,
      last REAL,
      high52 REAL,
      meta_json TEXT
    );
    CREATE TABLE IF NOT EXISTS breadth_daily (
      universe TEXT NOT NULL,
      day TEXT NOT NULL,
      above20 REAL NOT NULL,
      above50 REAL NOT NULL,
      above200 REAL NOT NULL,
      rsi50 REAL NOT NULL,
      ad_net REAL NOT NULL,
      PRIMARY KEY (universe, day)
    );
    CREATE TABLE IF NOT EXISTS market_snapshot (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      built_at INTEGER NOT NULL,
      as_of TEXT,
      loaded INTEGER NOT NULL,
      failed INTEGER NOT NULL,
      index_perf_json TEXT NOT NULL,
      stocks_perf_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS snapshot_job (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      status TEXT NOT NULL,
      started_at INTEGER,
      finished_at INTEGER,
      message TEXT,
      loaded INTEGER DEFAULT 0,
      failed INTEGER DEFAULT 0,
      total INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS alert_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      params_json TEXT NOT NULL,
      webhook_url TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS alert_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_id INTEGER NOT NULL,
      ticker TEXT,
      message TEXT NOT NULL,
      payload_json TEXT,
      created_at INTEGER NOT NULL,
      delivered INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS fundamentals (
      ticker TEXT PRIMARY KEY,
      updated_at INTEGER NOT NULL,
      pe REAL,
      forward_pe REAL,
      dividend_yield REAL,
      market_cap REAL,
      eps REAL,
      raw_json TEXT
    );
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0
    );
  `)
  dbSingleton = db
  return db
}

export function seriesSymbolCount() {
  try {
    const row = getDb().prepare('SELECT COUNT(*) AS n FROM series_meta').get()
    return Number(row?.n) || 0
  } catch {
    return 0
  }
}
