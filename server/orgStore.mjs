import crypto from 'crypto'
import { sqlAll, sqlOne, sqlRun } from './db.mjs'
import { normalizeUsername } from './userStore.mjs'

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex')
}

function parseJson(raw, fallback = null) {
  if (!raw) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function rowToOrg(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    seats: Number(row.seats) || 0,
    branding: parseJson(row.brandingJson, null),
    stripeCustomerId: row.stripeCustomerId || null,
    stripeSubscriptionId: row.stripeSubscriptionId || null,
    createdAt: Number(row.createdAt),
  }
}

/**
 * @param {string} name
 * @param {string} ownerUsername
 */
export async function createOrg(name, ownerUsername) {
  const nm = String(name || '').trim().slice(0, 120)
  if (!nm) throw new Error('name required')
  const owner = normalizeUsername(ownerUsername)
  if (!owner) throw new Error('owner required')
  const id = crypto.randomUUID()
  const now = Date.now()
  await sqlRun(
    `INSERT INTO organisations (id, name, seats, branding_json, stripe_customer_id, stripe_subscription_id, created_at)
     VALUES (?, ?, 0, NULL, NULL, NULL, ?)`,
    [id, nm, now],
  )
  await sqlRun(
    `INSERT INTO org_members (org_id, username, role, cohort, joined_at)
     VALUES (?, ?, 'owner', NULL, ?)`,
    [id, owner, now],
  )
  return getOrg(id)
}

/**
 * @param {string} orgId
 */
export async function getOrg(orgId) {
  const id = String(orgId || '').trim()
  if (!id) return null
  const row = await sqlOne(
    `SELECT id, name, seats, branding_json AS "brandingJson",
            stripe_customer_id AS "stripeCustomerId",
            stripe_subscription_id AS "stripeSubscriptionId",
            created_at AS "createdAt"
     FROM organisations WHERE id = ?`,
    [id],
  )
  return rowToOrg(row)
}

/**
 * Orgs the user belongs to.
 * @param {string} username
 */
export async function listOrgsForUser(username) {
  const u = normalizeUsername(username)
  const rows = await sqlAll(
    `SELECT o.id, o.name, o.seats, o.branding_json AS "brandingJson",
            o.stripe_customer_id AS "stripeCustomerId",
            o.stripe_subscription_id AS "stripeSubscriptionId",
            o.created_at AS "createdAt",
            m.role, m.cohort
     FROM org_members m
     JOIN organisations o ON o.id = m.org_id
     WHERE m.username = ?
     ORDER BY o.created_at DESC`,
    [u],
  )
  return rows.map((row) => ({
    ...rowToOrg(row),
    role: row.role,
    cohort: row.cohort || null,
  }))
}

/**
 * @param {string} orgId
 */
export async function listMembers(orgId) {
  const id = String(orgId || '').trim()
  const rows = await sqlAll(
    `SELECT org_id AS "orgId", username, role, cohort, joined_at AS "joinedAt"
     FROM org_members WHERE org_id = ?
     ORDER BY joined_at ASC`,
    [id],
  )
  return rows.map((r) => ({
    orgId: r.orgId,
    username: r.username,
    role: r.role,
    cohort: r.cohort || null,
    joinedAt: Number(r.joinedAt),
  }))
}

/**
 * @param {string} orgId
 * @param {string} username
 * @param {string} [role]
 * @param {string | null} [cohort]
 */
export async function addMember(orgId, username, role = 'member', cohort = null) {
  const id = String(orgId || '').trim()
  const u = normalizeUsername(username)
  if (!id || !u) throw new Error('orgId and username required')
  const now = Date.now()
  await sqlRun(
    `INSERT INTO org_members (org_id, username, role, cohort, joined_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(org_id, username) DO UPDATE SET
       role = excluded.role,
       cohort = COALESCE(excluded.cohort, org_members.cohort)`,
    [id, u, String(role || 'member').slice(0, 32), cohort != null ? String(cohort).slice(0, 64) : null, now],
  )
  return { orgId: id, username: u, role: String(role || 'member'), cohort, joinedAt: now }
}

/**
 * @param {string} orgId
 * @param {string} username
 */
export async function getMember(orgId, username) {
  const row = await sqlOne(
    `SELECT org_id AS "orgId", username, role, cohort, joined_at AS "joinedAt"
     FROM org_members WHERE org_id = ? AND username = ?`,
    [String(orgId || '').trim(), normalizeUsername(username)],
  )
  if (!row) return null
  return {
    orgId: row.orgId,
    username: row.username,
    role: row.role,
    cohort: row.cohort || null,
    joinedAt: Number(row.joinedAt),
  }
}

/**
 * Creates an invite; returns the raw token (store only hashes).
 * @param {string} orgId
 * @param {{ email: string, role?: string, cohort?: string | null, expiresAt?: number }} opts
 */
export async function createInvite(orgId, opts = {}) {
  const id = String(orgId || '').trim()
  const email = normalizeUsername(opts.email || '')
  if (!id || !email) throw new Error('orgId and email required')
  const role = String(opts.role || 'member').slice(0, 32)
  const cohort = opts.cohort != null ? String(opts.cohort).slice(0, 64) : null
  const expiresAt = Number(opts.expiresAt) || Date.now() + INVITE_TTL_MS
  const rawToken = crypto.randomBytes(32).toString('hex')
  await sqlRun(
    `INSERT INTO org_invites (token_hash, org_id, email, role, cohort, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [hashToken(rawToken), id, email, role, cohort, expiresAt],
  )
  return { token: rawToken, orgId: id, email, role, cohort, expiresAt }
}

/**
 * @param {string} rawToken
 * @param {string} username accepting user
 */
export async function acceptInvite(rawToken, username) {
  const token = String(rawToken || '').trim()
  const u = normalizeUsername(username)
  if (!token || !u) throw new Error('token and username required')
  const row = await sqlOne(
    `SELECT token_hash AS "tokenHash", org_id AS "orgId", email, role, cohort, expires_at AS "expiresAt"
     FROM org_invites WHERE token_hash = ?`,
    [hashToken(token)],
  )
  if (!row) throw new Error('Invalid invite')
  if (Date.now() > Number(row.expiresAt)) {
    await sqlRun('DELETE FROM org_invites WHERE token_hash = ?', [row.tokenHash])
    throw new Error('Invite expired')
  }
  await addMember(row.orgId, u, row.role, row.cohort)
  await sqlRun('DELETE FROM org_invites WHERE token_hash = ?', [row.tokenHash])
  return { orgId: row.orgId, username: u, role: row.role, cohort: row.cohort || null }
}

/**
 * @param {string} orgId
 * @param {number} seats
 */
export async function setSeats(orgId, seats) {
  const id = String(orgId || '').trim()
  const n = Math.max(0, Math.floor(Number(seats) || 0))
  await sqlRun('UPDATE organisations SET seats = ? WHERE id = ?', [n, id])
  return getOrg(id)
}

/**
 * @param {string} orgId
 * @param {{ stripeCustomerId?: string | null, stripeSubscriptionId?: string | null }} patch
 */
export async function setStripeIds(orgId, patch = {}) {
  const id = String(orgId || '').trim()
  const org = await getOrg(id)
  if (!org) return null
  const customerId =
    patch.stripeCustomerId !== undefined ? patch.stripeCustomerId : org.stripeCustomerId
  const subId =
    patch.stripeSubscriptionId !== undefined
      ? patch.stripeSubscriptionId
      : org.stripeSubscriptionId
  await sqlRun(
    `UPDATE organisations SET stripe_customer_id = ?, stripe_subscription_id = ? WHERE id = ?`,
    [customerId || null, subId || null, id],
  )
  return getOrg(id)
}

/**
 * @param {string} orgId
 */
export async function getBranding(orgId) {
  const org = await getOrg(orgId)
  return org?.branding ?? null
}

/**
 * @param {string} orgId
 * @param {unknown} branding
 */
export async function setBranding(orgId, branding) {
  const id = String(orgId || '').trim()
  await sqlRun('UPDATE organisations SET branding_json = ? WHERE id = ?', [
    JSON.stringify(branding ?? {}),
    id,
  ])
  return getBranding(id)
}
