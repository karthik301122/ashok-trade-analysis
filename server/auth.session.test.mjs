import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { initDb, sqlOne, sqlRun } from './db.mjs'
import {
  bumpSessionVersion,
  clearSessionVersionCache,
  createSessionToken,
  getUserFromRequest,
  issueSessionToken,
  parseSessionToken,
} from './auth.mjs'

describe('single-device sessions', () => {
  beforeEach(async () => {
    process.env.AUTH_SECRET = 'test-secret-single-session'
    await initDb()
    clearSessionVersionCache()
    await sqlRun('DELETE FROM auth_sessions')
  })

  afterEach(() => {
    clearSessionVersionCache()
    delete process.env.AUTH_SECRET
  })

  it('embeds session version in the cookie payload', async () => {
    const token = await issueSessionToken('alice@example.com')
    const parsed = parseSessionToken(token)
    expect(parsed?.username).toBe('alice@example.com')
    expect(parsed?.sessionVersion).toBe(1)
    const row = await sqlOne('SELECT session_version FROM auth_sessions WHERE username = ?', [
      'alice@example.com',
    ])
    expect(Number(row?.session_version)).toBe(1)
  })

  it('rejects prior cookies after a new login', async () => {
    const first = await issueSessionToken('bob@example.com')
    const second = await issueSessionToken('bob@example.com')
    expect(parseSessionToken(first)?.sessionVersion).toBe(1)
    expect(parseSessionToken(second)?.sessionVersion).toBe(2)

    const reqWith = (token) => ({ headers: { cookie: `asx_sid=${encodeURIComponent(token)}` } })
    expect(await getUserFromRequest(reqWith(second))).toBe('bob@example.com')
    expect(await getUserFromRequest(reqWith(first))).toBeNull()
  })

  it('treats version-0 cookies as valid until the version is bumped', async () => {
    const legacy = createSessionToken('carol@example.com', 0)
    expect(parseSessionToken(legacy)?.sessionVersion).toBe(0)
    expect(
      await getUserFromRequest({ headers: { cookie: `asx_sid=${encodeURIComponent(legacy)}` } }),
    ).toBe('carol@example.com')
    await bumpSessionVersion('carol@example.com')
    expect(
      await getUserFromRequest({ headers: { cookie: `asx_sid=${encodeURIComponent(legacy)}` } }),
    ).toBeNull()
  })
})
