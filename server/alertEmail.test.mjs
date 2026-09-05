import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { alertEmailConfigured, alertEmailFromAddress, DEFAULT_ALERT_FROM } from './alertEmail.mjs'

describe('alertEmail', () => {
  const env = { ...process.env }

  beforeEach(() => {
    delete process.env.SMTP_HOST
    delete process.env.SMTP_USER
    delete process.env.SMTP_PASS
    delete process.env.SMTP_FROM
  })

  afterEach(() => {
    process.env = { ...env }
  })

  it('is not configured without SMTP env', () => {
    expect(alertEmailConfigured()).toBe(false)
  })

  it('is configured when all SMTP vars are set', () => {
    process.env.SMTP_HOST = 'smtp.office365.com'
    process.env.SMTP_USER = 'alerts@traderscope.com'
    process.env.SMTP_PASS = 'secret'
    expect(alertEmailConfigured()).toBe(true)
  })

  it('defaults From to official alerts@ mailbox (not SMTP_USER)', () => {
    process.env.SMTP_USER = 'legacy@gmail.com'
    expect(alertEmailFromAddress()).toBe(DEFAULT_ALERT_FROM)
    expect(DEFAULT_ALERT_FROM).toContain('alerts@traderscope.com')
  })

  it('honours SMTP_FROM when set', () => {
    process.env.SMTP_FROM = 'Custom <alerts@traderscope.com>'
    expect(alertEmailFromAddress()).toBe('Custom <alerts@traderscope.com>')
  })
})
