import { describe, expect, it } from 'vitest'
import { parseRetryAfterMs } from './eodhdThrottle.mjs'

describe('parseRetryAfterMs', () => {
  it('defaults when header missing', () => {
    expect(parseRetryAfterMs(null)).toBeGreaterThan(1000)
  })

  it('parses seconds', () => {
    expect(parseRetryAfterMs({ get: () => '30' })).toBe(30_000)
  })
})
