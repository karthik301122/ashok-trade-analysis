import { describe, expect, it } from 'vitest'
import { validateUsername, validatePassword } from './userStore.mjs'

describe('userStore validation', () => {
  it('accepts normal usernames', () => {
    expect(validateUsername('ashok')).toBeNull()
    expect(validateUsername('karthik.trades')).toBeNull()
  })

  it('rejects short or invalid usernames', () => {
    expect(validateUsername('ab')).not.toBeNull()
    expect(validateUsername('bad name')).not.toBeNull()
  })

  it('requires password length', () => {
    expect(validatePassword('short')).not.toBeNull()
    expect(validatePassword('longenough')).toBeNull()
  })
})
