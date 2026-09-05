import { describe, expect, it } from 'vitest'
import { SNAPSHOT_FRESH_MS, isSnapshotFresh } from './snapshotJob.mjs'

describe('isSnapshotFresh', () => {
  it('is true within the short clock window', () => {
    const now = Date.parse('2026-09-05T06:00:00Z')
    expect(isSnapshotFresh(now - 60 * 60 * 1000, now)).toBe(true)
  })

  it('is false after SNAPSHOT_FRESH_MS', () => {
    const now = Date.parse('2026-09-05T06:00:00Z')
    expect(isSnapshotFresh(now - SNAPSHOT_FRESH_MS - 1, now)).toBe(false)
  })

  it('uses a 4h window (not 12h)', () => {
    expect(SNAPSHOT_FRESH_MS).toBe(4 * 60 * 60 * 1000)
  })
})
