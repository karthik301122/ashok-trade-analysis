import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { seriesProviderName } from './fetchSeries.mjs'

describe('fetchSeries provider', () => {
  const prev = { ...process.env }

  beforeEach(() => {
    process.env = { ...prev }
  })

  afterEach(() => {
    process.env = prev
  })

  it('uses eodhd when EODHD_ONLY', () => {
    process.env.EODHD_ONLY = 'true'
    process.env.EODHD_API_TOKEN = 'tok'
    expect(seriesProviderName()).toBe('eodhd')
  })

  it('uses eodhd when Yahoo fallback disabled', () => {
    delete process.env.EODHD_ONLY
    process.env.EODHD_API_TOKEN = 'tok'
    process.env.EODHD_YAHOO_FALLBACK = 'false'
    expect(seriesProviderName()).toBe('eodhd')
  })

  it('uses yahoo when no token and not eodhd-only', () => {
    delete process.env.EODHD_API_TOKEN
    delete process.env.EODHD_ONLY
    delete process.env.DATA_PROVIDER
    expect(seriesProviderName()).toBe('yahoo-finance2')
  })
})
