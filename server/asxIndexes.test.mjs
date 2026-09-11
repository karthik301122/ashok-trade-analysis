import { describe, expect, it } from 'vitest'
import { isAsxIndexSeriesTicker } from './asxIndexes.mjs'

describe('isAsxIndexSeriesTicker', () => {
  it('recognises market and sector index cache keys', () => {
    expect(isAsxIndexSeriesTicker('^AXJO')).toBe(true)
    expect(isAsxIndexSeriesTicker('^AXEJ')).toBe(true)
    expect(isAsxIndexSeriesTicker('AXEJ.INDX')).toBe(true)
    expect(isAsxIndexSeriesTicker('CBA')).toBe(false)
    expect(isAsxIndexSeriesTicker('CBA.AX')).toBe(false)
  })
})
