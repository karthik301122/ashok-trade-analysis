import { describe, expect, it } from 'vitest'
import { shouldRunDeskEodSync } from './deskSyncJob.mjs'

describe('shouldRunDeskEodSync', () => {
  it('runs Friday evening Sydney', () => {
    // 2026-09-04 08:00 UTC = 18:00 AEST
    expect(shouldRunDeskEodSync(Date.parse('2026-09-04T08:00:00Z'))).toBe(true)
  })

  it('runs from 16:45 Sydney', () => {
    // 2026-09-04 06:45 UTC = 16:45 AEST
    expect(shouldRunDeskEodSync(Date.parse('2026-09-04T06:45:00Z'))).toBe(true)
  })

  it('skips during cash session', () => {
    // 2026-09-04 02:00 UTC = 12:00 AEST
    expect(shouldRunDeskEodSync(Date.parse('2026-09-04T02:00:00Z'))).toBe(false)
  })

  it('skips weekends', () => {
    expect(shouldRunDeskEodSync(Date.parse('2026-09-05T08:00:00Z'))).toBe(false)
  })
})
