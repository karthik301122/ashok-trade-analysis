import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  eodhdComponentToTicker,
  tickersFromComponentRows,
} from './eodhdIndexMembers.mjs'

describe('eodhdIndexMembers', () => {
  it('maps AU component codes to tickers', () => {
    assert.equal(eodhdComponentToTicker({ Code: 'BHP', Exchange: 'AU' }), 'BHP')
    assert.equal(eodhdComponentToTicker({ Code: 'BHP.AU' }), 'BHP')
  })

  it('sorts by weight and dedupes', () => {
    const tickers = tickersFromComponentRows([
      { Code: 'AAA', Weight: 0.01 },
      { Code: 'BHP', Weight: 0.05 },
      { Code: 'BHP', Weight: 0.05 },
    ])
    assert.deepEqual(tickers, ['BHP', 'AAA'])
  })
})
