import { describe, expect, it } from 'vitest'
import { validateUsername, validatePassword } from './userStore.mjs'

describe('userStore validation', () => {
  it('accepts normal usernames', () => {
    expect(validateUsername('ashok')).toBeNull()
    expect(validateUsername('karthik.trades')).toBeNull()
  })

  it('accepts email addresses', () => {
    expect(validateUsername('molabantirupak@gmail.com')).toBeNull()
    expect(validateUsername('test@example.com')).toBeNull()
  })

  it('rejects short or invalid usernames', () => {
    expect(validateUsername('ab')).not.toBeNull()
    expect(validateUsername('bad name')).not.toBeNull()
  })

  it('requires strong password rules', () => {
    expect(validatePassword('short')).not.toBeNull()
    expect(validatePassword('longenough')).not.toBeNull() // no upper/num/symbol
    expect(validatePassword('Longenough1')).not.toBeNull() // no symbol
    expect(validatePassword('Longenough!')).not.toBeNull() // no number
    expect(validatePassword('longenough1!')).not.toBeNull() // no upper
    expect(validatePassword('LONGENOUGH1!')).not.toBeNull() // no lower
    expect(validatePassword('Longenough1!')).toBeNull()
  })
})
