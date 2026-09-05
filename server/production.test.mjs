import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { resetDbForTests } from './db.mjs'
import {
  browserUniverseFetchEnabled,
  isAdminRequest,
  isAdminUser,
  isProductionMode,
  minSnapshotStockRatio,
  readinessFromSnapshot,
  seriesRateLimitPerMinute,
} from './production.mjs'

describe('production mode', () => {
  const prev = { ...process.env }

  beforeEach(async () => {
    process.env = { ...prev }
    delete process.env.DATABASE_URL
    await resetDbForTests()
  })

  afterEach(() => {
    process.env = prev
  })

  it('disables browser universe fetch in production mode', () => {
    process.env.PRODUCTION_MODE = 'true'
    expect(isProductionMode()).toBe(true)
    expect(browserUniverseFetchEnabled()).toBe(false)
  })

  it('blocks browser universe fetch override when EODHD-only (always on)', () => {
    process.env.PRODUCTION_MODE = 'true'
    process.env.ALLOW_BROWSER_UNIVERSE_FETCH = 'true'
    expect(browserUniverseFetchEnabled()).toBe(false)
  })

  it('disables browser fetch when EODHD_ONLY even with override', () => {
    process.env.EODHD_API_TOKEN = 'tok'
    process.env.EODHD_ONLY = 'true'
    process.env.ALLOW_BROWSER_UNIVERSE_FETCH = 'true'
    expect(browserUniverseFetchEnabled()).toBe(false)
  })

  it('checks admin users', async () => {
    process.env.ADMIN_USERS = 'ops,admin'
    expect(await isAdminUser('Admin')).toBe(true)
    expect(await isAdminUser('guest')).toBe(false)
  })

  it('accepts x-admin-key for cron', async () => {
    process.env.ADMIN_API_KEY = 'cron-secret'
    expect(await isAdminRequest({ headers: { 'x-admin-key': 'cron-secret' } })).toBe(true)
    expect(await isAdminRequest({ headers: { 'x-admin-key': 'wrong' } })).toBe(false)
  })

  it('raises series rate limit in production', () => {
    delete process.env.SERIES_RATE_LIMIT
    delete process.env.API_RATE_LIMIT
    process.env.PRODUCTION_MODE = 'true'
    expect(seriesRateLimitPerMinute()).toBe(2000)
  })

  it('honors SERIES_RATE_LIMIT override', () => {
    process.env.PRODUCTION_MODE = 'true'
    process.env.SERIES_RATE_LIMIT = '3000'
    expect(seriesRateLimitPerMinute()).toBe(3000)
  })

  it('computes readiness', () => {
    process.env.PRODUCTION_MODE = 'true'
    const r = readinessFromSnapshot({ fresh: true, loaded: 1800, failed: 200 }, 2000)
    expect(r.snapshotAcceptable).toBe(true)
    expect(r.multiUserReady).toBe(true)
    expect(minSnapshotStockRatio()).toBe(0.35)
  })
})
