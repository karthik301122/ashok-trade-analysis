import { describe, expect, it } from 'vitest'
import { compileScanScript, SCANSCRIPT_EXAMPLE, validateScanScript, VCP_SETUP_SCRIPT } from './scanScript'

describe('scanScript', () => {
  it('compiles example script', () => {
    const r = compileScanScript(SCANSCRIPT_EXAMPLE)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.rules.match).toBe('all')
    expect(r.rules.conditions.length).toBe(5)
  })

  it('parses above_sma shorthand', () => {
    const r = compileScanScript('match any\nabove_sma(50)\nr vol >= 2')
    expect(r.ok).toBe(false) // r vol invalid

    const r2 = compileScanScript('match any\nabove_sma(50)\nrvol >= 2')
    expect(r2.ok).toBe(true)
    if (r2.ok) {
      expect(r2.rules.match).toBe('any')
      expect(r2.rules.conditions[0].metric).toBe('pct_above_sma50')
    }
  })

  it('reports syntax errors', () => {
    expect(validateScanScript('foo bar').length).toBeGreaterThan(0)
    expect(validateScanScript('rsi(14) <= 30').length).toBe(0)
  })

  it('reads bias header', () => {
    const r = compileScanScript('bias: bearish\nrsi(14) >= 70')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.bias).toBe('bearish')
  })

  it('compiles VCP setup script', () => {
    const r = compileScanScript(VCP_SETUP_SCRIPT)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.bias).toBe('bullish')
    expect(r.rules.match).toBe('all')
    expect(r.rules.conditions.length).toBe(7)
  })
})
