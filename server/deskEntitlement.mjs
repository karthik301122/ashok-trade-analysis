import { listOrgsForUser } from './orgStore.mjs'
import { getUserBilling, individualBillingActive } from './userBillingStore.mjs'

/**
 * Full desk = active org membership OR paid individual subscription.
 * @param {string | null | undefined} username
 */
export async function getDeskEntitlement(username) {
  if (!username) {
    return {
      fullDeskAccess: false,
      reason: 'anonymous',
      orgMember: false,
      individualPaid: false,
      orgs: [],
    }
  }
  const orgs = await listOrgsForUser(username)
  const orgMember = orgs.length > 0
  const billing = await getUserBilling(username)
  const individualPaid = individualBillingActive(billing)
  return {
    fullDeskAccess: orgMember || individualPaid,
    reason: orgMember ? 'org' : individualPaid ? 'individual' : 'free',
    orgMember,
    individualPaid,
    billingStatus: billing?.status || 'none',
    orgs,
    primaryOrg: orgs[0] || null,
  }
}
