import crypto from 'crypto'
import { sqlAll, sqlOne, sqlRun } from './db.mjs'
import { normalizeUsername } from './userStore.mjs'

function normalizeTickers(tickers) {
  if (!Array.isArray(tickers)) return []
  return [
    ...new Set(
      tickers
        .map((t) => String(t || '').trim().toUpperCase())
        .filter((t) => /^[A-Z0-9.^=-]{1,20}$/.test(t)),
    ),
  ]
}

function rowToWatchlist(row) {
  let tickers = []
  try {
    tickers = JSON.parse(row.tickersJson || '[]')
  } catch {
    tickers = []
  }
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    tickers: Array.isArray(tickers) ? tickers : [],
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  }
}

/**
 * @param {string} username
 */
export async function listWatchlists(username) {
  const u = normalizeUsername(username)
  const rows = await sqlAll(
    `SELECT id, username, name, tickers_json AS "tickersJson",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM watchlists WHERE username = ?
     ORDER BY updated_at DESC`,
    [u],
  )
  return rows.map(rowToWatchlist)
}

/**
 * @param {string} username
 * @param {string} name
 * @param {string[]} tickers
 */
export async function createWatchlist(username, name, tickers = []) {
  const u = normalizeUsername(username)
  const nm = String(name || '').trim().slice(0, 80)
  if (!nm) throw new Error('name required')
  const id = crypto.randomUUID()
  const now = Date.now()
  const list = normalizeTickers(tickers)
  await sqlRun(
    `INSERT INTO watchlists (id, username, name, tickers_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, u, nm, JSON.stringify(list), now, now],
  )
  return {
    id,
    username: u,
    name: nm,
    tickers: list,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * @param {string} id
 * @param {string} username
 * @param {{ name?: string, tickers?: string[] }} patch
 */
export async function updateWatchlist(id, username, patch = {}) {
  const u = normalizeUsername(username)
  const wid = String(id || '').trim()
  const existing = await sqlOne(
    `SELECT id, username, name, tickers_json AS "tickersJson",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM watchlists WHERE id = ? AND username = ?`,
    [wid, u],
  )
  if (!existing) return null
  const name =
    patch.name != null ? String(patch.name).trim().slice(0, 80) || existing.name : existing.name
  const tickers =
    patch.tickers != null ? normalizeTickers(patch.tickers) : (() => {
      try {
        return JSON.parse(existing.tickersJson || '[]')
      } catch {
        return []
      }
    })()
  const now = Date.now()
  await sqlRun(
    `UPDATE watchlists SET name = ?, tickers_json = ?, updated_at = ? WHERE id = ? AND username = ?`,
    [name, JSON.stringify(tickers), now, wid, u],
  )
  return {
    id: wid,
    username: u,
    name,
    tickers: Array.isArray(tickers) ? tickers : [],
    createdAt: Number(existing.createdAt),
    updatedAt: now,
  }
}

/**
 * @param {string} id
 * @param {string} username
 */
export async function deleteWatchlist(id, username) {
  const u = normalizeUsername(username)
  const wid = String(id || '').trim()
  const result = await sqlRun(`DELETE FROM watchlists WHERE id = ? AND username = ?`, [wid, u])
  return (result?.changes ?? 0) > 0
}
