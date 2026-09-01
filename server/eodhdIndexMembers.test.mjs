import { describe, expect, it } from 'vitest'
import {
  eodhdComponentToTicker,
  tickersFromComponentRows,
} from './eodhdIndexMembers.mjs'

describe('eodhdIndexMembers', () => {
  it('maps AU component codes to tickers', () => {
    expect(eodhdComponentToTicker({ Code: 'BHP', Exchange: 'AU' })).toBe('BHP')
    expect(eodhdComponentToTicker({ Code: 'BHP.AU' })).toBe('BHP')
  })

  it('sorts by weight and dedupes', () => {
    const tickers = tickersFromComponentRows([
      { Code: 'AAA', Weight: 0.01 },
      { Code: 'BHP', Weight: 0.05 },
      { Code: 'BHP', Weight: 0.05 },
    ])
    expect(tickers).toEqual(['BHP', 'AAA'])
  })
})
