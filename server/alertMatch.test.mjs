import { describe, expect, it } from 'vitest'
import { matchAlertRule } from './alertMatch.mjs'
import { checkRateLimit } from './log.mjs'

describe('matchAlertRule', () => {
  const stocks = [
    { ticker: 'AAA', rs: 80, m3: 12, relativeVolume: 2.5, volume: 1e6, above20ma: true },
    { ticker: 'BBB', rs: 40, m3: 1, relativeVolume: 0.8, volume: 1e5, above20ma: false },
    { ticker: 'CCC', rs: 75, m3: 10, relativeVolume: 3.1, volume: 2e6, above20ma: true },
  ]

  it('filters by RS threshold', () => {
    const hits = matchAlertRule({ type: 'rs_min', params: { minRs: 70 } }, stocks)
    expect(hits.map((h) => h.ticker).sort()).toEqual(['AAA', 'CCC'])
  })

  it('filters by RVOL', () => {
    const hits = matchAlertRule({ type: 'rvol_min', params: { minRvol: 3 } }, stocks)
    expect(hits).toHaveLength(1)
    expect(hits[0].ticker).toBe('CCC')
  })

  it('fires breadth rule when pct high enough', () => {
    const hits = matchAlertRule(
      { type: 'breadth_above20', params: { minPct: 50 } },
      stocks,
      { loaded: 3 },
    )
    expect(hits).toHaveLength(1)
    expect(hits[0].ticker).toBeNull()
  })

  it('measures 3M excess vs index', () => {
    const hits = matchAlertRule(
      { type: 'm3_outperform', params: { minExcess: 8 } },
      stocks,
      { indexPerf: { m3: 2 } },
    )
    expect(hits.map((h) => h.ticker).sort()).toEqual(['AAA', 'CCC'])
  })

  it('caps at 25 matches', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      ticker: `T${i}`,
      rs: 90,
      m3: 0,
      relativeVolume: 1,
      volume: 1,
      above20ma: true,
    }))
    expect(matchAlertRule({ type: 'rs_min', params: { minRs: 50 } }, many)).toHaveLength(25)
  })
})

describe('checkRateLimit', () => {
  it('allows under limit then blocks', () => {
    const key = `test-${Date.now()}-${Math.random()}`
    const a = checkRateLimit(key, { limit: 3, windowMs: 60_000 })
    const b = checkRateLimit(key, { limit: 3, windowMs: 60_000 })
    const c = checkRateLimit(key, { limit: 3, windowMs: 60_000 })
    const d = checkRateLimit(key, { limit: 3, windowMs: 60_000 })
    expect(a.ok && b.ok && c.ok).toBe(true)
    expect(d.ok).toBe(false)
    expect(d.retryAfterMs).toBeGreaterThan(0)
  })
})
