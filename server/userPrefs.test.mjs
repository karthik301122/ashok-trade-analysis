import { describe, expect, it, beforeEach } from 'vitest'
import { initDb, sqlRun } from './db.mjs'
import {
  filterPatternAlertItemsForUser,
  getAlertEmailMinScore,
  getAlertEmailOptIn,
  getPatternAlertIds,
  getPatternAlertWatches,
  isEmailLogin,
  listAlertEmailOptInUsers,
  listAllSubscribedPatternIds,
  setAlertEmailMinScore,
  setAlertEmailOptIn,
  setPatternAlertIds,
  setPatternAlertWatches,
  userSubscribedToPatternAlert,
} from './userPrefs.mjs'

describe('userPrefs', () => {
  beforeEach(async () => {
    await initDb()
    await sqlRun('DELETE FROM alert_events')
    await sqlRun('DELETE FROM alert_rules')
    await sqlRun('DELETE FROM user_prefs')
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

  it(
    'stores per-stock pattern watches and syncs auto rules',
    async () => {
      await setPatternAlertWatches('alice@example.com', [
        { ticker: 'BHP', patternIds: ['landscape', 'vcp-tight'] },
        { ticker: 'CBA', patternIds: ['landscape'] },
      ])
      expect(await getPatternAlertWatches('alice@example.com')).toEqual([
        { ticker: 'BHP', patternIds: ['landscape', 'vcp-tight'] },
        { ticker: 'CBA', patternIds: ['landscape'] },
      ])
      expect(await getPatternAlertIds('alice@example.com')).toEqual(['landscape', 'vcp-tight'])

      const { sqlOne } = await import('./db.mjs')
      const row = await sqlOne(
        `SELECT COUNT(*) AS c FROM alert_rules WHERE params_json LIKE '%"auto":true%'`,
      )
      // 2 pattern ids × forming + confirmed
      expect(Number(row?.c)).toBe(4)
    },
    15000,
  )

  it(
    'stores pattern alert ids (legacy global) and syncs auto rules',
    async () => {
      await sqlRun('DELETE FROM alert_rules')
      await setPatternAlertIds('alice@example.com', ['landscape', 'vcp-tight'])
      expect(await getPatternAlertIds('alice@example.com')).toEqual(['landscape', 'vcp-tight'])
      expect(await listAllSubscribedPatternIds()).toEqual(['landscape', 'vcp-tight'])

      const { sqlOne } = await import('./db.mjs')
      const row = await sqlOne(
        `SELECT COUNT(*) AS c FROM alert_rules WHERE params_json LIKE '%"auto":true%'`,
      )
      expect(Number(row?.c)).toBe(4)
    },
    15000,
  )

  it('unions subscriptions across users for server rules', async () => {
    await setPatternAlertWatches('alice@example.com', [{ ticker: 'BHP', patternIds: ['landscape'] }])
    await setPatternAlertIds('bob@example.com', ['wedge'])
    expect(await listAllSubscribedPatternIds()).toEqual(['landscape', 'wedge'])
  })

  it('filters per-stock pattern subscriptions', async () => {
    await setPatternAlertWatches('alice@example.com', [
      { ticker: 'BHP', patternIds: ['landscape'] },
    ])
    expect(await userSubscribedToPatternAlert('alice@example.com', 'BHP', 'landscape')).toBe(true)
    expect(await userSubscribedToPatternAlert('alice@example.com', 'CBA', 'landscape')).toBe(false)
    expect(await userSubscribedToPatternAlert('alice@example.com', 'BHP', 'wedge')).toBe(false)
  })

  it('lists email opt-in users', async () => {
    await setAlertEmailOptIn('alpha@example.com', true)
    await setAlertEmailOptIn('beta@example.com', true)
    await setAlertEmailOptIn('usernameonly', true)
    expect(await listAlertEmailOptInUsers()).toEqual(['alpha@example.com', 'beta@example.com'])
  })

  it('stores alert email min score (default 80)', async () => {
    expect(await getAlertEmailMinScore('user@example.com')).toBe(80)
    expect(await setAlertEmailMinScore('user@example.com', 75)).toBe(75)
    expect(await getAlertEmailMinScore('user@example.com')).toBe(75)
    expect(await setAlertEmailMinScore('user@example.com', 40)).toBe(60)
    expect(await setAlertEmailMinScore('user@example.com', 120)).toBe(100)
  })

  it('filters email items by watch and min score', async () => {
    await setPatternAlertWatches('alice@example.com', [
      { ticker: 'BHP', patternIds: ['landscape'] },
      { ticker: 'CBA', patternIds: ['landscape'] },
    ])
    await setAlertEmailMinScore('alice@example.com', 80)
    const items = [
      { ticker: 'BHP', patternId: 'landscape', score: 82, message: 'BHP landscape forming 82%' },
      { ticker: 'CBA', patternId: 'landscape', score: 70, message: 'CBA landscape forming 70%' },
      { ticker: 'BHP', patternId: 'wedge', score: 90, message: 'BHP wedge forming 90%' },
    ]
    const filtered = await filterPatternAlertItemsForUser('alice@example.com', items)
    expect(filtered).toEqual([items[0]])
  })
})
