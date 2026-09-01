import { describe, expect, it, beforeEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { upsertPatternScanBatch, queryPatternScanState } from './patternScanStore.mjs'

describe('patternScanStore', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pattern-scan-'))
    process.env.DATABASE_PATH = path.join(tmpDir, 'test.sqlite')
  })

  it('upserts pattern scan rows in a batch', () => {
    const n = upsertPatternScanBatch([
      { ticker: 'bhp', patternId: 'vcp', score: 0.72, confirmed: true },
      { ticker: 'cba', patternId: 'vcp', score: 0.55, confirmed: false },
    ])
    expect(n).toBe(2)

    const rows = queryPatternScanState({ patternId: 'vcp', minScore: 0.5 })
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.ticker === 'BHP')?.score).toBe(0.72)
    expect(rows.find((r) => r.ticker === 'CBA')?.confirmed).toBe(false)
  })
})
