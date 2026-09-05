import { describe, expect, it } from 'vitest'

// Keep symbol→ticker mapping logic aligned with snapshotJob (inline test of rules).
function appTickerFromBarSymbol(symbol) {
  const t = String(symbol || '').toUpperCase()
  if (!t || t.startsWith('^') || t.startsWith('CMDTY:')) return ''
  if (t.endsWith('.INDX') || t.endsWith('.CC') || t.endsWith('.FOREX')) return ''
  if (t.endsWith('.AX') || t.endsWith('.AU')) return t.slice(0, -3)
  if (t.includes('.')) return ''
  return t
}

describe('appTickerFromBarSymbol (price sync)', () => {
  it('maps equity series symbols', () => {
    expect(appTickerFromBarSymbol('JNS.AX')).toBe('JNS')
    expect(appTickerFromBarSymbol('BCI.AU')).toBe('BCI')
  })

  it('skips indexes and non-equities', () => {
    expect(appTickerFromBarSymbol('^AXJO')).toBe('')
    expect(appTickerFromBarSymbol('AXJO.INDX')).toBe('')
    expect(appTickerFromBarSymbol('BTC-USD.CC')).toBe('')
  })
})
