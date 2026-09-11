import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('./orgStore.mjs', () => ({
  getOrg: vi.fn(),
  setSeats: vi.fn(),
  setStripeIds: vi.fn(),
  setBillingStatus: vi.fn(),
  findOrgByStripeCustomerId: vi.fn(),
  findOrgByStripeSubscriptionId: vi.fn(),
}))

vi.mock('./userBillingStore.mjs', () => ({
  upsertUserBilling: vi.fn(),
}))

vi.mock('./log.mjs', () => ({
  log: vi.fn(),
}))

import { getOrg, setBillingStatus } from './orgStore.mjs'
import { abandonOrgCheckout, handleCheckoutExpired, mapSubscriptionStatus } from './stripeBilling.mjs'

describe('mapSubscriptionStatus', () => {
  it('maps Stripe statuses', () => {
    expect(mapSubscriptionStatus('active')).toBe('active')
    expect(mapSubscriptionStatus('canceled')).toBe('canceled')
    expect(mapSubscriptionStatus('incomplete')).toBe('pending')
  })
})

describe('abandonOrgCheckout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('marks pending checkout as failed when user leaves payment', async () => {
    getOrg.mockResolvedValue({
      id: 'org1',
      billingStatus: 'pending',
      stripeSubscriptionId: null,
    })
    setBillingStatus.mockResolvedValue(undefined)
    const result = await abandonOrgCheckout('org1')
    expect(result).toEqual({ ok: true, status: 'failed' })
    expect(setBillingStatus).toHaveBeenCalledWith('org1', 'failed')
  })

  it('does not wipe an active subscription', async () => {
    getOrg.mockResolvedValue({
      id: 'org1',
      billingStatus: 'active',
      stripeSubscriptionId: 'sub_123',
    })
    const result = await abandonOrgCheckout('org1')
    expect(result.skipped).toBe(true)
    expect(setBillingStatus).not.toHaveBeenCalled()
  })
})

describe('handleCheckoutExpired', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fails pending org when Stripe session expires', async () => {
    getOrg.mockResolvedValue({
      id: 'org1',
      billingStatus: 'pending',
      stripeSubscriptionId: null,
    })
    setBillingStatus.mockResolvedValue(undefined)
    const result = await handleCheckoutExpired({
      id: 'cs_test',
      metadata: { orgId: 'org1' },
    })
    expect(result.ok).toBe(true)
    expect(setBillingStatus).toHaveBeenCalledWith('org1', 'failed')
  })
})
