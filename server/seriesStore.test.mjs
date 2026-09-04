import { describe, expect, it } from 'vitest'
import {
  expectedLastSessionUtcMs,
  isLastBarAcceptable,
} from './seriesStore.mjs'

function barAtIso(iso) {
  return { t: Math.floor(new Date(`${iso}T00:00:00Z`).getTime() / 1000), c: 1 }
}

describe('expectedLastSessionUtcMs', () => {
  it('uses Friday on Saturday/Sunday', () => {
    const sat = Date.parse('2026-09-05T12:00:00Z') // Saturday
    const sun = Date.parse('2026-09-06T12:00:00Z') // Sunday
    expect(new Date(expectedLastSessionUtcMs(sat)).toISOString().slice(0, 10)).toBe('2026-09-04')
    expect(new Date(expectedLastSessionUtcMs(sun)).toISOString().slice(0, 10)).toBe('2026-09-04')
  })

  it('before 08:00 UTC on a weekday expects prior weekday', () => {
    const wedMorning = Date.parse('2026-09-02T02:00:00Z') // Tuesday AEST evening-ish / early UTC Wed
    expect(new Date(expectedLastSessionUtcMs(wedMorning)).toISOString().slice(0, 10)).toBe(
      '2026-09-01',
    )
  })
})

describe('isLastBarAcceptable', () => {
  it('accepts last bar on expected session', () => {
    const now = Date.parse('2026-09-04T12:00:00Z') // Fri afternoon UTC
    expect(isLastBarAcceptable([barAtIso('2026-09-04')], now)).toBe(true)
  })

  it('rejects bars that are several sessions behind', () => {
    const now = Date.parse('2026-09-04T12:00:00Z')
    expect(isLastBarAcceptable([barAtIso('2026-08-31')], now)).toBe(false)
    expect(isLastBarAcceptable([barAtIso('2026-09-01')], now)).toBe(false)
  })

  it('allows one session of slack for holidays / late EOD', () => {
    const now = Date.parse('2026-09-04T12:00:00Z')
    // Expected Fri 4th; slack 1 → Wed 2nd still ok? Fri-1session = Thu 3rd
    expect(isLastBarAcceptable([barAtIso('2026-09-03')], now)).toBe(true)
    expect(isLastBarAcceptable([barAtIso('2026-09-02')], now)).toBe(false)
  })
})
