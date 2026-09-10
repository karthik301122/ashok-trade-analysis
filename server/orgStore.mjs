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
    billingStatus: String(row.billingStatus || 'none'),
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
            billing_status AS "billingStatus",
            created_at AS "createdAt"
     FROM organisations WHERE id = ?`,
    [id],
  )
  return rowToOrg(row)
}

/**
 * Active billed orgs with at least one seat (for daily scan publish).
 */
export async function listActiveBilledOrgs() {
  const rows = await sqlAll(
    `SELECT id, name, seats, branding_json AS "brandingJson",
            stripe_customer_id AS "stripeCustomerId",
            stripe_subscription_id AS "stripeSubscriptionId",
            billing_status AS "billingStatus",
            created_at AS "createdAt"
     FROM organisations
     WHERE billing_status = 'active' AND seats > 0
     ORDER BY created_at ASC`,
  )
  return rows.map((row) => rowToOrg(row))
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
            o.billing_status AS "billingStatus",
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
 * Student invites require pay-to-join — do not call acceptInvite for students.
 * @param {string} orgId
 * @param {{ email: string, role?: string, cohort?: string | null, expiresAt?: number }} opts
 */
export async function createInvite(orgId, opts = {}) {
  const id = String(orgId || '').trim()
  const email = normalizeUsername(opts.email || '')
  if (!id || !email) throw new Error('orgId and email required')
  if (!email.includes('@')) throw new Error('Valid email required')
  const role = String(opts.role || 'student').slice(0, 32)
  const cohort = opts.cohort != null ? String(opts.cohort).slice(0, 64) : null
  const expiresAt = Number(opts.expiresAt) || Date.now() + INVITE_TTL_MS
  const rawToken = crypto.randomBytes(32).toString('hex')
  const now = Date.now()
  await sqlRun(
    `INSERT INTO org_invites (
       token_hash, org_id, email, role, cohort, expires_at,
       status, activated_at, activated_username, stripe_session_id, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL, ?)`,
    [hashToken(rawToken), id, email, role, cohort, expiresAt, now],
  )
  return {
    token: rawToken,
    orgId: id,
    email,
    role,
    cohort,
    expiresAt,
    status: 'pending',
    inviteUrlPath: `/invite?token=${encodeURIComponent(rawToken)}`,
  }
}

/**
 * @param {string} orgId
 * @param {string[]} emails
 * @param {{ role?: string, cohort?: string | null }} [opts]
 */
export async function createInvitesFromEmails(orgId, emails, opts = {}) {
  const list = Array.isArray(emails) ? emails : []
  const capped = list.slice(0, 200)
  const created = []
  const errors = []
  for (const raw of capped) {
    try {
      const invite = await createInvite(orgId, {
        email: raw,
        role: opts.role || 'student',
        cohort: opts.cohort ?? null,
      })
      created.push(invite)
    } catch (err) {
      errors.push({
        email: String(raw || ''),
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return { created, errors }
}

function rowToInvite(row, includeTokenHash = false) {
  if (!row) return null
  const status = String(row.status || 'pending')
  const expiresAt = Number(row.expiresAt)
  const effective =
    status === 'pending' && Number.isFinite(expiresAt) && Date.now() > expiresAt
      ? 'expired'
      : status
  return {
    orgId: row.orgId,
    email: row.email,
    role: row.role,
    cohort: row.cohort || null,
    expiresAt,
    status: effective,
    activatedAt: row.activatedAt != null ? Number(row.activatedAt) : null,
    activatedUsername: row.activatedUsername || null,
    stripeSessionId: row.stripeSessionId || null,
    createdAt: row.createdAt != null ? Number(row.createdAt) : null,
    tokenHash: includeTokenHash ? row.tokenHash : undefined,
  }
}

/**
 * @param {string} orgId
 */
export async function listInvites(orgId) {
  const id = String(orgId || '').trim()
  const rows = await sqlAll(
    `SELECT token_hash AS "tokenHash", org_id AS "orgId", email, role, cohort,
            expires_at AS "expiresAt", status,
            activated_at AS "activatedAt", activated_username AS "activatedUsername",
            stripe_session_id AS "stripeSessionId", created_at AS "createdAt"
     FROM org_invites WHERE org_id = ?
     ORDER BY COALESCE(created_at, expires_at) DESC`,
    [id],
  )
  return rows.map((r) => rowToInvite(r))
}

/**
 * Preview invite by raw token (no membership change).
 * @param {string} rawToken
 */
export async function getInviteByToken(rawToken) {
  const token = String(rawToken || '').trim()
  if (!token) return null
  const row = await sqlOne(
    `SELECT token_hash AS "tokenHash", org_id AS "orgId", email, role, cohort,
            expires_at AS "expiresAt", status,
            activated_at AS "activatedAt", activated_username AS "activatedUsername",
            stripe_session_id AS "stripeSessionId", created_at AS "createdAt"
     FROM org_invites WHERE token_hash = ?`,
    [hashToken(token)],
  )
  if (!row) return null
  const invite = rowToInvite(row, true)
  const org = await getOrg(row.orgId)
  const members = await listMembers(row.orgId)
  const seats = Number(org?.seats) || 0
  const memberCount = members.length
  return {
    ...invite,
    orgName: org?.name || null,
    branding: org?.branding || null,
    seats,
    memberCount,
    seatsAvailable: Math.max(0, seats - memberCount),
    token,
  }
}

/**
 * @param {string} orgId
 * @param {string} email
 */
export async function revokeInvite(orgId, email) {
  const id = String(orgId || '').trim()
  const em = normalizeUsername(email)
  await sqlRun(
    `UPDATE org_invites SET status = 'revoked'
     WHERE org_id = ? AND email = ? AND status IN ('pending', 'checkout_started')`,
    [id, em],
  )
  return { ok: true }
}

/**
 * @param {string} orgId
 * @param {string} username
 */
export async function removeMember(orgId, username) {
  const id = String(orgId || '').trim()
  const u = normalizeUsername(username)
  const member = await getMember(id, u)
  if (!member) throw new Error('Member not found')
  if (member.role === 'owner') throw new Error('Cannot remove the organisation owner')
  await sqlRun('DELETE FROM org_members WHERE org_id = ? AND username = ?', [id, u])
  return { ok: true }
}

/**
 * @param {string} orgId
 * @param {string} username
 * @param {string} role
 */
export async function setMemberRole(orgId, username, role) {
  const id = String(orgId || '').trim()
  const u = normalizeUsername(username)
  const r = String(role || '').trim().slice(0, 32)
  if (!['admin', 'trainer', 'student', 'member'].includes(r)) {
    throw new Error('Invalid role')
  }
  const member = await getMember(id, u)
  if (!member) throw new Error('Member not found')
  if (member.role === 'owner') throw new Error('Cannot change owner role')
  await sqlRun('UPDATE org_members SET role = ? WHERE org_id = ? AND username = ?', [r, id, u])
  return getMember(id, u)
}

/**
 * Activate invite against an org seat — no individual Stripe subscription.
 * Idempotent. Requires seats available and matching email login.
 * @param {string} rawToken
 * @param {string} username
 */
export async function activateInvite(rawToken, username) {
  const token = String(rawToken || '').trim()
  const u = normalizeUsername(username)
  if (!token || !u) throw new Error('token and username required')
  const row = await sqlOne(
    `SELECT token_hash AS "tokenHash", org_id AS "orgId", email, role, cohort,
            expires_at AS "expiresAt", status,
            activated_at AS "activatedAt", activated_username AS "activatedUsername",
            stripe_session_id AS "stripeSessionId"
     FROM org_invites WHERE token_hash = ?`,
    [hashToken(token)],
  )
  if (!row) throw new Error('Invalid invite')
  if (row.status === 'activated') {
    return {
      ok: true,
      already: true,
      orgId: row.orgId,
      username: row.activatedUsername || u,
      role: row.role,
    }
  }
  if (row.status === 'revoked') throw new Error('Invite revoked')
  if (Date.now() > Number(row.expiresAt)) {
    await sqlRun(`UPDATE org_invites SET status = 'expired' WHERE token_hash = ?`, [row.tokenHash])
    throw new Error('Invite expired')
  }
  const org = await getOrg(row.orgId)
  const members = await listMembers(row.orgId)
  const seats = Number(org?.seats) || 0
  if (seats <= 0 || members.length >= seats) {
    throw new Error('No seats available in this organisation')
  }
  const emailNorm = normalizeUsername(row.email)
  if (u !== emailNorm) throw new Error('Sign in with the invited email address')
  await addMember(row.orgId, u, row.role || 'student', row.cohort)
  const now = Date.now()
  await sqlRun(
    `UPDATE org_invites SET status = 'activated', activated_at = ?, activated_username = ?
     WHERE token_hash = ?`,
    [now, u, row.tokenHash],
  )
  return { ok: true, orgId: row.orgId, username: u, role: row.role, cohort: row.cohort || null }
}

/** @deprecated Use activateInvite */
export async function activateInviteAfterPayment(rawToken, username, _sessionId) {
  return activateInvite(rawToken, username)
}

/**
 * Join via invite link (org seat only — not an individual subscription).
 */
export async function acceptInvite(rawToken, username) {
  return activateInvite(rawToken, username)
}

/**
 * @param {string} orgId
 */
export async function countMembers(orgId) {
  const members = await listMembers(orgId)
  return members.length
}

/**
 * @param {string} orgId
 */
export async function seatsAvailable(orgId) {
  const org = await getOrg(orgId)
  const seats = Number(org?.seats) || 0
  const count = await countMembers(orgId)
  return Math.max(0, seats - count)
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
 * @param {string} status
 */
export async function setBillingStatus(orgId, status) {
  const id = String(orgId || '').trim()
  const value = String(status || 'none').trim().slice(0, 32) || 'none'
  await sqlRun('UPDATE organisations SET billing_status = ? WHERE id = ?', [value, id])
  return getOrg(id)
}

/**
 * @param {string} customerId
 */
export async function findOrgByStripeCustomerId(customerId) {
  const cid = String(customerId || '').trim()
  if (!cid) return null
  const row = await sqlOne(
    `SELECT id, name, seats, branding_json AS "brandingJson",
            stripe_customer_id AS "stripeCustomerId",
            stripe_subscription_id AS "stripeSubscriptionId",
            billing_status AS "billingStatus",
            created_at AS "createdAt"
     FROM organisations WHERE stripe_customer_id = ?`,
    [cid],
  )
  return rowToOrg(row)
}

/**
 * @param {string} subscriptionId
 */
export async function findOrgByStripeSubscriptionId(subscriptionId) {
  const sid = String(subscriptionId || '').trim()
  if (!sid) return null
  const row = await sqlOne(
    `SELECT id, name, seats, branding_json AS "brandingJson",
            stripe_customer_id AS "stripeCustomerId",
            stripe_subscription_id AS "stripeSubscriptionId",
            billing_status AS "billingStatus",
            created_at AS "createdAt"
     FROM organisations WHERE stripe_subscription_id = ?`,
    [sid],
  )
  return rowToOrg(row)
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
