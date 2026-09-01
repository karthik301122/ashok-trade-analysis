import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { eodhdOnlyMode, toEodhdSymbol } from './eodhd.mjs'

describe('eodhd symbols', () => {
  it('maps ASX tickers', () => {
    expect(toEodhdSymbol('CBA')).toBe('CBA.AU')
    expect(toEodhdSymbol('CBA.AX')).toBe('CBA.AU')
    expect(toEodhdSymbol('cba.au')).toBe('CBA.AU')
  })

  it('maps ASX200 index', () => {
    expect(toEodhdSymbol('^AXJO')).toBe('AXJO.INDX')
    expect(toEodhdSymbol('XJO')).toBe('AXJO.INDX')
    expect(toEodhdSymbol('AXJO.INDX')).toBe('AXJO.INDX')
  })

  it('maps All Ordinaries and Small Ordinaries indices', () => {
    expect(toEodhdSymbol('^AORD')).toBe('AORD.INDX')
    expect(toEodhdSymbol('XAO')).toBe('AORD.INDX')
    expect(toEodhdSymbol('^AXSO')).toBe('AXSO.INDX')
    expect(toEodhdSymbol('AXSO.INDX')).toBe('AXSO.INDX')
  })
})

describe('eodhdOnlyMode', () => {
  const prev = { ...process.env }

  beforeEach(() => {
    process.env = { ...prev }
  })

  afterEach(() => {
    process.env = prev
  })

  it('is true when EODHD_ONLY set', () => {
    process.env.EODHD_ONLY = 'true'
    expect(eodhdOnlyMode()).toBe(true)
  })

  it('is true when Yahoo fallback disabled and token set', () => {
    delete process.env.EODHD_ONLY
    process.env.EODHD_API_TOKEN = 'tok'
    process.env.EODHD_YAHOO_FALLBACK = 'false'
    expect(eodhdOnlyMode()).toBe(true)
  })

  it('is false when fallback enabled and EODHD_ONLY unset', () => {
    delete process.env.EODHD_ONLY
    process.env.EODHD_API_TOKEN = 'tok'
    process.env.EODHD_YAHOO_FALLBACK = 'true'
    expect(eodhdOnlyMode()).toBe(false)
  })
})
