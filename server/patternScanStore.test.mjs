import { describe, expect, it, beforeEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { initDb, resetDbForTests } from './db.mjs'
import { upsertPatternScanBatch, queryPatternScanState } from './patternScanStore.mjs'

describe('patternScanStore', () => {
  let tmpDir

  beforeEach(async () => {
    resetDbForTests()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pattern-scan-'))
    process.env.DATABASE_PATH = path.join(tmpDir, 'test.sqlite')
    delete process.env.DATABASE_URL
    await initDb()
  })

  it('upserts pattern scan rows in a batch', async () => {
    const n = await upsertPatternScanBatch([
      { ticker: 'bhp', patternId: 'vcp', score: 0.72, confirmed: true },
      { ticker: 'cba', patternId: 'vcp', score: 0.55, confirmed: false },
    ])
    expect(n).toBe(2)

    const rows = await queryPatternScanState({ patternId: 'vcp', minScore: 0.5 })
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.ticker === 'BHP')?.score).toBe(0.72)
    expect(rows.find((r) => r.ticker === 'CBA')?.confirmed).toBe(false)
  })
})
