import { describe, expect, it } from 'vitest'
import { eodhdOnlyMode, isCommoditySymbol, toEodhdSymbol } from './eodhd.mjs'

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

  it('maps crypto and forex', () => {
    expect(toEodhdSymbol('BTC-USD')).toBe('BTC-USD.CC')
    expect(toEodhdSymbol('BTC-USD.CC')).toBe('BTC-USD.CC')
    expect(toEodhdSymbol('XAUUSD.FOREX')).toBe('XAUUSD.FOREX')
  })

  it('maps commodity codes', () => {
    expect(isCommoditySymbol('CMDTY:WTI')).toBe(true)
    expect(toEodhdSymbol('CMDTY:WTI')).toBe('WTI')
  })
})

describe('eodhdOnlyMode', () => {
  it('is always true (Yahoo removed)', () => {
    expect(eodhdOnlyMode()).toBe(true)
  })
})
