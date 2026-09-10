import { sqlOne, sqlRun } from './db.mjs'
import { normalizeUsername } from './userStore.mjs'

/**
 * @param {string} username
 */
export async function getUserBilling(username) {
  const u = normalizeUsername(username)
  if (!u) return null
  const row = await sqlOne(
    `SELECT username, stripe_customer_id AS "stripeCustomerId",
            stripe_subscription_id AS "stripeSubscriptionId",
            status, updated_at AS "updatedAt"
     FROM user_billing WHERE username = ?`,
    [u],
  )
  if (!row) return { username: u, status: 'none', stripeCustomerId: null, stripeSubscriptionId: null }
  return {
    username: row.username,
    stripeCustomerId: row.stripeCustomerId || null,
    stripeSubscriptionId: row.stripeSubscriptionId || null,
    status: String(row.status || 'none'),
    updatedAt: Number(row.updatedAt) || 0,
  }
}

/**
 * @param {string} username
 * @param {{ status?: string, stripeCustomerId?: string | null, stripeSubscriptionId?: string | null }} patch
 */
export async function upsertUserBilling(username, patch = {}) {
  const u = normalizeUsername(username)
  if (!u) throw new Error('username required')
  const existing = await getUserBilling(u)
  const status = patch.status != null ? String(patch.status) : existing?.status || 'none'
  const customerId =
    patch.stripeCustomerId !== undefined
      ? patch.stripeCustomerId
      : existing?.stripeCustomerId || null
  const subId =
    patch.stripeSubscriptionId !== undefined
      ? patch.stripeSubscriptionId
      : existing?.stripeSubscriptionId || null
  const now = Date.now()
  await sqlRun(
    `INSERT INTO user_billing (username, stripe_customer_id, stripe_subscription_id, status, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(username) DO UPDATE SET
       stripe_customer_id = excluded.stripe_customer_id,
       stripe_subscription_id = excluded.stripe_subscription_id,
       status = excluded.status,
       updated_at = excluded.updated_at`,
    [u, customerId, subId, status, now],
  )
  return getUserBilling(u)
}

export function individualBillingActive(billing) {
  const s = String(billing?.status || '')
  return s === 'active' || s === 'trialing'
}
