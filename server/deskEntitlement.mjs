import { listOrgsForUser } from './orgStore.mjs'
import { getUserBilling, individualBillingActive } from './userBillingStore.mjs'
import { normalizeUsername } from './userStore.mjs'

/** Always full desk — no Stripe charge (ops / founder accounts). */
const BUILTIN_FREE_FULL_DESK = [
  'rupakmolabanti18@gmail.com',
  'karthiknagaraju77@gmail.com',
  'testtraderscope@gmail.com',
]

/** All signed-in users get full desk until this instant (inclusive window ends). Sydney AEST. */
const PROMO_FULL_DESK_UNTIL = new Date('2026-09-30T23:59:59+10:00')

function freeFullDeskAllowlist() {
  const fromEnv = String(process.env.FULL_DESK_FREE_USERS || '')
    .split(',')
    .map((s) => normalizeUsername(s))
    .filter(Boolean)
  return new Set([...BUILTIN_FREE_FULL_DESK.map(normalizeUsername), ...fromEnv])
}

/**
 * Temporary launch promo: every logged-in user has full desk through month end.
 * Override with FULL_DESK_PROMO_UNTIL=ISO date, or FULL_DESK_PROMO=0 to disable early.
 */
export function isLaunchPromoFullDeskActive(now = new Date()) {
  const disabled =
    process.env.FULL_DESK_PROMO === '0' ||
    process.env.FULL_DESK_PROMO === 'false' ||
    process.env.FULL_DESK_PROMO === 'no'
  if (disabled) return false
  const untilRaw = process.env.FULL_DESK_PROMO_UNTIL?.trim()
  const until = untilRaw ? new Date(untilRaw) : PROMO_FULL_DESK_UNTIL
  if (Number.isNaN(until.getTime())) return false
  return now.getTime() <= until.getTime()
}

/**
 * @param {string | null | undefined} username
 */
export function isComplimentaryFullDesk(username) {
  if (!username) return false
  return freeFullDeskAllowlist().has(normalizeUsername(username))
}

/**
 * Full desk = launch promo OR complimentary allowlist OR org membership OR paid individual.
 * @param {string | null | undefined} username
 */
export async function getDeskEntitlement(username) {
  if (!username) {
    return {
      fullDeskAccess: false,
      reason: 'anonymous',
      orgMember: false,
      individualPaid: false,
      complimentary: false,
      launchPromo: false,
      orgs: [],
    }
  }
  const launchPromo = isLaunchPromoFullDeskActive()
  const complimentary = isComplimentaryFullDesk(username)
  const orgs = await listOrgsForUser(username)
  const orgMember = orgs.length > 0
  const billing = await getUserBilling(username)
  const individualPaid = individualBillingActive(billing)
  const fullDeskAccess = launchPromo || complimentary || orgMember || individualPaid
  let reason = 'free'
  if (launchPromo) reason = 'launch_promo'
  else if (complimentary) reason = 'complimentary'
  else if (orgMember) reason = 'org'
  else if (individualPaid) reason = 'individual'
  return {
    fullDeskAccess,
    reason,
    orgMember,
    individualPaid,
    complimentary,
    launchPromo,
    billingStatus: launchPromo
      ? 'launch_promo'
      : complimentary
        ? 'complimentary'
        : billing?.status || 'none',
    orgs,
    primaryOrg: orgs[0] || null,
  }
}
