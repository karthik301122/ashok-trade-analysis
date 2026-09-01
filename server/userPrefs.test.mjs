import { describe, expect, it, beforeEach } from 'vitest'
import { initDb, sqlRun } from './db.mjs'
import {
  getAlertEmailOptIn,
  getPatternAlertIds,
  isEmailLogin,
  listAlertEmailOptInUsers,
  listAllSubscribedPatternIds,
  setAlertEmailOptIn,
  setPatternAlertIds,
} from './userPrefs.mjs'

describe('userPrefs', () => {
  beforeEach(async () => {
    await initDb()
    await sqlRun('DELETE FROM user_prefs')
    await sqlRun('DELETE FROM alert_rules')
  })

  it('detects email-shaped logins', () => {
    expect(isEmailLogin('user@example.com')).toBe(true)
    expect(isEmailLogin('notanemail')).toBe(false)
    expect(isEmailLogin('bad@')).toBe(false)
  })

  it('stores and reads alert email opt-in', async () => {
    expect(await getAlertEmailOptIn('user@example.com')).toBe(false)
    await setAlertEmailOptIn('user@example.com', true)
    expect(await getAlertEmailOptIn('user@example.com')).toBe(true)
    await setAlertEmailOptIn('user@example.com', false)
    expect(await getAlertEmailOptIn('user@example.com')).toBe(false)
  })

  it('stores pattern alert ids and syncs auto rules', async () => {
    await setPatternAlertIds('alice@example.com', ['landscape', 'vcp-tight'])
    expect(await getPatternAlertIds('alice@example.com')).toEqual(['landscape', 'vcp-tight'])
    expect(await listAllSubscribedPatternIds()).toEqual(['landscape', 'vcp-tight'])

    const { sqlOne } = await import('./db.mjs')
    const row = await sqlOne(
      `SELECT COUNT(*) AS c FROM alert_rules WHERE params_json LIKE '%"auto":true%'`,
    )
    expect(Number(row?.c)).toBe(4)
  })

  it('unions subscriptions across users for server rules', async () => {
    await setPatternAlertIds('alice@example.com', ['landscape'])
    await setPatternAlertIds('bob@example.com', ['wedge'])
    expect(await listAllSubscribedPatternIds()).toEqual(['landscape', 'wedge'])
  })

  it('lists email opt-in users', async () => {
    await setAlertEmailOptIn('alpha@example.com', true)
    await setAlertEmailOptIn('beta@example.com', true)
    await setAlertEmailOptIn('usernameonly', true)
    expect(await listAlertEmailOptInUsers()).toEqual(['alpha@example.com', 'beta@example.com'])
  })
})
