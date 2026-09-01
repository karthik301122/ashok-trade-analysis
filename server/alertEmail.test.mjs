import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { alertEmailConfigured } from './alertEmail.mjs'

describe('alertEmail', () => {
  const env = { ...process.env }

  beforeEach(() => {
    delete process.env.SMTP_HOST
    delete process.env.SMTP_USER
    delete process.env.SMTP_PASS
  })

  afterEach(() => {
    process.env = { ...env }
  })

  it('is not configured without SMTP env', () => {
    expect(alertEmailConfigured()).toBe(false)
  })

  it('is configured when all SMTP vars are set', () => {
    process.env.SMTP_HOST = 'smtp.gmail.com'
    process.env.SMTP_USER = 'test@example.com'
    process.env.SMTP_PASS = 'secret'
    expect(alertEmailConfigured()).toBe(true)
  })
})
