import crypto from 'crypto'
import { sqlOne, sqlRun } from './db.mjs'
import { normalizeUsername } from './userStore.mjs'

/**
 * @param {string} username
 * @param {unknown} payload
 * @returns {Promise<string>} share link id
 */
export async function createShareLink(username, payload) {
  const u = normalizeUsername(username)
  if (!u) throw new Error('username required')
  const id = crypto.randomUUID()
  const now = Date.now()
  await sqlRun(
    `INSERT INTO share_links (id, username, payload_json, created_at, expires_at)
     VALUES (?, ?, ?, ?, NULL)`,
    [id, u, JSON.stringify(payload ?? {}), now],
  )
  return id
}

/**
 * Auth is enforced at the API layer — this only loads the row.
 * @param {string} id
 * @returns {Promise<{ id: string, username: string, payload: unknown, createdAt: number } | null>}
 */
export async function getShareLink(id) {
  const sid = String(id || '').trim()
  if (!sid) return null
  const row = await sqlOne(
    `SELECT id, username, payload_json AS "payloadJson", created_at AS "createdAt", expires_at AS "expiresAt"
     FROM share_links WHERE id = ?`,
    [sid],
  )
  if (!row) return null
  if (row.expiresAt != null && Number(row.expiresAt) > 0 && Date.now() > Number(row.expiresAt)) {
    return null
  }
  let payload = {}
  try {
    payload = JSON.parse(row.payloadJson || '{}')
  } catch {
    payload = {}
  }
  return {
    id: row.id,
    username: row.username,
    payload,
    createdAt: Number(row.createdAt),
  }
}
