import { describe, expect, it } from 'vitest'
import { toEodhdSymbol } from './eodhd.mjs'

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
})
