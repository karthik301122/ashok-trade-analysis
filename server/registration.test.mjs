import { describe, expect, it } from 'vitest'
import { validateDisplayName, validateRegisterEmail } from './registration.mjs'

describe('registration validation', () => {
  it('requires a short display name', () => {
    expect(validateDisplayName('')).toBeTruthy()
    expect(validateDisplayName('A')).toBeTruthy()
    expect(validateDisplayName('Ashok')).toBeNull()
  })

  it('requires a real email', () => {
    expect(validateRegisterEmail('not-an-email')).toBeTruthy()
    expect(validateRegisterEmail('user@traderscope.com')).toBeNull()
  })
})
