import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { DatabaseSync } from 'node:sqlite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..', '..')

/** @type {DatabaseSync | null} */
let dbSingleton = null

export function sqliteFilePath() {
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

function openSqlite() {
  if (dbSingleton) return dbSingleton
  const file = sqliteFilePath()
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
      advancing INTEGER,
      declining INTEGER,
      near52w REAL,
      rsi70 REAL,
      rsi30 REAL,
      rs50 REAL,
      rvol15 REAL,
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
    CREATE TABLE IF NOT EXISTS user_prefs (
      username TEXT PRIMARY KEY,
      alert_email_opt_in INTEGER NOT NULL DEFAULT 0,
      alert_email_min_score INTEGER NOT NULL DEFAULT 80,
      pattern_alert_ids_json TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS live_quotes (
      ticker TEXT PRIMARY KEY,
      close REAL NOT NULL,
      change_p REAL,
      volume INTEGER,
      quote_ts INTEGER,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pattern_scan_state (
      ticker TEXT NOT NULL,
      pattern_id TEXT NOT NULL,
      score REAL NOT NULL,
      confirmed INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (ticker, pattern_id)
    );
    CREATE TABLE IF NOT EXISTS asx_filings (
      document_key TEXT PRIMARY KEY,
      ticker TEXT NOT NULL,
      headline TEXT,
      kind TEXT,
      director TEXT,
      side TEXT,
      shares REAL,
      consideration_aud REAL,
      announced_at INTEGER NOT NULL,
      date_of_change TEXT,
      pdf_url TEXT,
      raw_json TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_asx_filings_ticker_announced ON asx_filings (ticker, announced_at DESC);
    CREATE INDEX IF NOT EXISTS idx_asx_filings_side_announced ON asx_filings (side, announced_at DESC);
  `)
  migrateBreadthDailyColumns(db)
  migrateUserPrefsColumns(db)
  dbSingleton = db
  return db
}

function migrateUserPrefsColumns(db) {
  const existing = new Set(
    db.prepare('PRAGMA table_info(user_prefs)').all().map((r) => r.name),
  )
  if (!existing.has('pattern_alert_ids_json')) {
    db.exec('ALTER TABLE user_prefs ADD COLUMN pattern_alert_ids_json TEXT')
  }
  if (!existing.has('alert_email_min_score')) {
    db.exec('ALTER TABLE user_prefs ADD COLUMN alert_email_min_score INTEGER NOT NULL DEFAULT 80')
  }
}

function migrateBreadthDailyColumns(db) {
  const existing = new Set(
    db.prepare('PRAGMA table_info(breadth_daily)').all().map((r) => r.name),
  )
  const adds = [
    ['advancing', 'INTEGER'],
    ['declining', 'INTEGER'],
    ['near52w', 'REAL'],
    ['rsi70', 'REAL'],
    ['rsi30', 'REAL'],
    ['rs50', 'REAL'],
    ['rvol15', 'REAL'],
  ]
  for (const [name, type] of adds) {
    if (!existing.has(name)) {
      db.exec(`ALTER TABLE breadth_daily ADD COLUMN ${name} ${type}`)
    }
  }
}

export function resetSqliteForTests() {
  dbSingleton = null
}

export function createSqliteBackend() {
  const db = openSqlite()

  async function sqlOne(sql, params = []) {
    return db.prepare(sql).get(...params) ?? null
  }

  async function sqlAll(sql, params = []) {
    return db.prepare(sql).all(...params)
  }

  async function sqlRun(sql, params = []) {
    if (/RETURNING/i.test(sql)) {
      const row = db.prepare(sql).get(...params)
      return { changes: row ? 1 : 0, lastInsertRowid: row?.id ?? null }
    }
    const info = db.prepare(sql).run(...params)
    return { changes: info.changes ?? 0, lastInsertRowid: info.lastInsertRowid ?? null }
  }

  async function withTransaction(fn) {
    db.exec('BEGIN')
    const tx = {
      sqlOne: async (s, p = []) => db.prepare(s).get(...p) ?? null,
      sqlAll: async (s, p = []) => db.prepare(s).all(...p),
      sqlRun: async (s, p = []) => {
        const info = db.prepare(s).run(...p)
        return { changes: info.changes ?? 0, lastInsertRowid: info.lastInsertRowid ?? null }
      },
    }
    try {
      const result = await fn(tx)
      db.exec('COMMIT')
      return result
    } catch (err) {
      try {
        db.exec('ROLLBACK')
      } catch {
        /* ignore */
      }
      throw err
    }
  }

  return {
    kind: 'sqlite',
    dbPath: () => sqliteFilePath(),
    ensureSchema: async () => {},
    sqlOne,
    sqlAll,
    sqlRun,
    withTransaction,
    close: async () => {},
  }
}
