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

  it('always reports eodhd (Yahoo removed)', () => {
    delete process.env.EODHD_API_TOKEN
    delete process.env.DATA_PROVIDER
    expect(seriesProviderName()).toBe('eodhd')
  })

  it('reports eodhd when token set', () => {
    process.env.EODHD_API_TOKEN = 'tok'
    expect(seriesProviderName()).toBe('eodhd')
  })
})
