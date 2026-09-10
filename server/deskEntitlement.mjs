import { listOrgsForUser } from './orgStore.mjs'
import { getUserBilling, individualBillingActive } from './userBillingStore.mjs'
import { normalizeUsername } from './userStore.mjs'

/** Always full desk — no Stripe charge (ops / founder accounts). */
const BUILTIN_FREE_FULL_DESK = [
  'rupakmolabanti18@gmail.com',
  'karthiknagaraju77@gmail.com',
  'testtraderscope@gmail.com',
]

function freeFullDeskAllowlist() {
  const fromEnv = String(process.env.FULL_DESK_FREE_USERS || '')
    .split(',')
    .map((s) => normalizeUsername(s))
    .filter(Boolean)
  return new Set([...BUILTIN_FREE_FULL_DESK.map(normalizeUsername), ...fromEnv])
}

/**
 * @param {string | null | undefined} username
 */
export function isComplimentaryFullDesk(username) {
  if (!username) return false
  return freeFullDeskAllowlist().has(normalizeUsername(username))
}

/**
 * Full desk = complimentary allowlist OR active org membership OR paid individual subscription.
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
      orgs: [],
    }
  }
  const complimentary = isComplimentaryFullDesk(username)
  const orgs = await listOrgsForUser(username)
  const orgMember = orgs.length > 0
  const billing = await getUserBilling(username)
  const individualPaid = individualBillingActive(billing)
  const fullDeskAccess = complimentary || orgMember || individualPaid
  let reason = 'free'
  if (complimentary) reason = 'complimentary'
  else if (orgMember) reason = 'org'
  else if (individualPaid) reason = 'individual'
  return {
    fullDeskAccess,
    reason,
    orgMember,
    individualPaid,
    complimentary,
    billingStatus: complimentary ? 'complimentary' : billing?.status || 'none',
    orgs,
    primaryOrg: orgs[0] || null,
  }
}
