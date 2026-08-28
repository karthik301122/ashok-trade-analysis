import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  browserUniverseFetchEnabled,
  isAdminUser,
  isProductionMode,
  minSnapshotStockRatio,
  readinessFromSnapshot,
  seriesRateLimitPerMinute,
} from './production.mjs'

describe('production mode', () => {
  const prev = { ...process.env }

  beforeEach(() => {
    process.env = { ...prev }
  })

  afterEach(() => {
    process.env = prev
  })

  it('disables browser universe fetch in production mode', () => {
    process.env.PRODUCTION_MODE = 'true'
    expect(isProductionMode()).toBe(true)
    expect(browserUniverseFetchEnabled()).toBe(false)
  })

  it('allows override with ALLOW_BROWSER_UNIVERSE_FETCH', () => {
    process.env.PRODUCTION_MODE = 'true'
    process.env.ALLOW_BROWSER_UNIVERSE_FETCH = 'true'
    expect(browserUniverseFetchEnabled()).toBe(true)
  })

  it('checks admin users', () => {
    process.env.ADMIN_USERS = 'ops,admin'
    expect(isAdminUser('Admin')).toBe(true)
    expect(isAdminUser('guest')).toBe(false)
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
