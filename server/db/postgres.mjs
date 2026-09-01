import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Convert `?` placeholders to PostgreSQL `$1, $2, ...` */
export function toPgSql(sql) {
  let i = 0
  return sql.replace(/\?/g, () => `$${++i}`)
}

/**
 * @param {string} connectionString
 */
export async function createPostgresBackend(connectionString) {
  const pool = new pg.Pool({
    connectionString,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
    max: Number(process.env.PG_POOL_MAX) || 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  })

  const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.postgres.sql'), 'utf8')

  async function ensureSchema() {
    await pool.query(schemaSql)
  }

  async function sqlOne(sql, params = []) {
    const res = await pool.query(toPgSql(sql), params)
    return res.rows[0] ?? null
  }

  async function sqlAll(sql, params = []) {
    const res = await pool.query(toPgSql(sql), params)
    return res.rows
  }

  async function sqlRun(sql, params = []) {
    const res = await pool.query(toPgSql(sql), params)
    return { changes: res.rowCount ?? 0, lastInsertRowid: res.rows[0]?.id ?? null }
  }

  async function withTransaction(fn) {
    const client = await pool.connect()
    const tx = {
      async sqlOne(s, p = []) {
        const res = await client.query(toPgSql(s), p)
        return res.rows[0] ?? null
      },
      async sqlAll(s, p = []) {
        const res = await client.query(toPgSql(s), p)
        return res.rows
      },
      async sqlRun(s, p = []) {
        const res = await client.query(toPgSql(s), p)
        return { changes: res.rowCount ?? 0, lastInsertRowid: res.rows[0]?.id ?? null }
      },
    }
    try {
      await client.query('BEGIN')
      const result = await fn(tx)
      await client.query('COMMIT')
      return result
    } catch (err) {
      try {
        await client.query('ROLLBACK')
      } catch {
        /* ignore */
      }
      throw err
    } finally {
      client.release()
    }
  }

  await ensureSchema()

  return {
    kind: 'postgres',
    dbPath: () => connectionString.replace(/:[^:@/]+@/, ':***@'),
    ensureSchema,
    sqlOne,
    sqlAll,
    sqlRun,
    withTransaction,
    async close() {
      await pool.end()
    },
  }
}
