import { createPostgresBackend } from './postgres.mjs'

/** @type {Awaited<ReturnType<typeof createPostgresBackend>> | import('./sqlite.mjs').createSqliteBackend extends (...args: any) => infer R ? R : never | null} */
let backend = null

export function dbKind() {
  if (backend) return backend.kind
  return process.env.DATABASE_URL?.trim() ? 'postgres' : 'sqlite'
}

export function dbStoreLabel() {
  return dbKind() === 'postgres' ? 'postgres' : 'sqlite'
}

export function dbPath() {
  if (backend) return backend.dbPath()
  if (process.env.DATABASE_URL?.trim()) {
    return process.env.DATABASE_URL.replace(/:[^:@/]+@/, ':***@')
  }
  const custom = process.env.DATABASE_PATH || process.env.CACHE_DIR
  if (custom) return custom
  return './data/asx.sqlite'
}

export async function initDb() {
  if (backend) return backend
  if (process.env.DATABASE_URL?.trim()) {
    backend = await createPostgresBackend(process.env.DATABASE_URL.trim())
  } else {
    // Lazy-load so production Postgres does not import node:sqlite (noisy warning).
    const { createSqliteBackend } = await import('./sqlite.mjs')
    backend = createSqliteBackend()
    await backend.ensureSchema()
  }
  return backend
}

async function ready() {
  if (!backend) await initDb()
  return backend
}

export async function sqlOne(sql, params = []) {
  return (await ready()).sqlOne(sql, params)
}

export async function sqlAll(sql, params = []) {
  return (await ready()).sqlAll(sql, params)
}

export async function sqlRun(sql, params = []) {
  return (await ready()).sqlRun(sql, params)
}

export async function withTransaction(fn) {
  return (await ready()).withTransaction(fn)
}

export async function seriesSymbolCount() {
  try {
    const row = await sqlOne('SELECT COUNT(*) AS n FROM series_meta')
    return Number(row?.n) || 0
  } catch {
    return 0
  }
}

export async function resetDbForTests() {
  backend = null
  try {
    const { resetSqliteForTests } = await import('./sqlite.mjs')
    resetSqliteForTests()
  } catch {
    /* sqlite unused */
  }
}

/** @deprecated Use sqlOne/sqlAll/sqlRun — kept for scripts that import getDb during transition */
export function getDb() {
  throw new Error('getDb() is removed — use await sqlOne/sqlAll/sqlRun from db.mjs')
}
