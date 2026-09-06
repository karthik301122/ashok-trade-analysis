import { describe, expect, it, beforeEach } from 'vitest'
import { initDb, resetDbForTests } from './db.mjs'
import {
  changeDbPassword,
  createDbUser,
  getDbUserProfile,
  setDbPassword,
  updateDbDisplayName,
  updateDbUsername,
  verifyDbCredentials,
} from './userStore.mjs'
import { completePasswordReset, requestPasswordReset } from './passwordReset.mjs'
import { sqlOne } from './db.mjs'

describe('profile and password reset', () => {
  beforeEach(async () => {
    await resetDbForTests()
    await initDb()
  })

  it('updates display name and username for db users', async () => {
    const created = await createDbUser('alice@example.com', 'Longenough1!', {
      displayName: 'Alice',
    })
    expect(created.ok).toBe(true)

    const name = await updateDbDisplayName('alice@example.com', 'Alice Smith')
    expect(name.ok).toBe(true)
    expect(name.displayName).toBe('Alice Smith')

    const renamed = await updateDbUsername('alice@example.com', 'alice.trader')
    expect(renamed.ok).toBe(true)
    expect(renamed.user).toBe('alice.trader')

    const profile = await getDbUserProfile('alice.trader')
    expect(profile?.displayName).toBe('Alice Smith')
    expect(await verifyDbCredentials('alice.trader', 'Longenough1!')).toBe('alice.trader')
  })

  it('changes password with current password', async () => {
    await createDbUser('bob@example.com', 'Longenough1!', { displayName: 'Bob' })
    const bad = await changeDbPassword('bob@example.com', 'wrong', 'Newpass1!')
    expect(bad.ok).toBe(false)

    const ok = await changeDbPassword('bob@example.com', 'Longenough1!', 'Newpass1!')
    expect(ok.ok).toBe(true)
    expect(await verifyDbCredentials('bob@example.com', 'Newpass1!')).toBe('bob@example.com')
  })

  it('completes password reset with a valid token', async () => {
    await createDbUser('resetme@example.com', 'Longenough1!', { displayName: 'Reset' })
    // Seed a token directly (skip SMTP).
    const crypto = await import('crypto')
    const raw = crypto.randomBytes(32).toString('hex')
    const hash = crypto.createHash('sha256').update(raw).digest('hex')
    const { sqlRun } = await import('./db.mjs')
    await sqlRun(
      'INSERT INTO password_reset_tokens (token_hash, username, expires_at, created_at) VALUES (?, ?, ?, ?)',
      [hash, 'resetme@example.com', Date.now() + 60_000, Date.now()],
    )

    const result = await completePasswordReset({ token: raw, password: 'Freshpass1!' })
    expect(result.ok).toBe(true)
    expect(await verifyDbCredentials('resetme@example.com', 'Freshpass1!')).toBe('resetme@example.com')
    expect(await sqlOne('SELECT 1 AS n FROM password_reset_tokens WHERE username = ?', [
      'resetme@example.com',
    ])).toBeNull()
  })

  it('rejects forgot-password when SMTP is not configured', async () => {
    const prevHost = process.env.SMTP_HOST
    delete process.env.SMTP_HOST
    const result = await requestPasswordReset({ email: 'anyone@example.com' })
    expect(result.ok).toBe(false)
    expect(result.status).toBe(503)
    if (prevHost) process.env.SMTP_HOST = prevHost
  })

  it('setDbPassword validates strength', async () => {
    await createDbUser('carol@example.com', 'Longenough1!')
    const weak = await setDbPassword('carol@example.com', 'weak')
    expect(weak.ok).toBe(false)
  })
})
