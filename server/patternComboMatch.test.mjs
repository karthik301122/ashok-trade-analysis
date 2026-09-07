import { describe, expect, it, beforeEach } from 'vitest'
import { initDb, resetDbForTests, sqlRun } from './db.mjs'
import { matchPatternCombo } from './patternComboMatch.mjs'

describe('matchPatternCombo', () => {
  beforeEach(async () => {
    await resetDbForTests()
    await initDb()
    const now = Date.now()
    await sqlRun('DELETE FROM pattern_scan_state')
    for (const row of [
      ['BHP', 'vcp-setup', 70],
      ['BHP', 'landscape', 75],
      ['CBA', 'vcp-setup', 80],
      ['CBA', 'stage-2', 72],
    ]) {
      await sqlRun(
        `INSERT INTO pattern_scan_state (ticker, pattern_id, score, confirmed, updated_at)
         VALUES (?, ?, ?, 0, ?)`,
        [row[0], row[1], row[2], now],
      )
    }
  })

  it('OR fires when any pattern hits', async () => {
    const hits = await matchPatternCombo({
      op: 'or',
      name: 'Any',
      comboId: 'c-or',
      patternIds: ['vcp-setup', 'landscape'],
      minScore: 60,
    })
    const tickers = hits.map((h) => h.ticker).sort()
    expect(tickers).toEqual(['BHP', 'CBA'])
  })

  it('AND requires all patterns on same ticker', async () => {
    const hits = await matchPatternCombo({
      op: 'and',
      name: 'Both',
      comboId: 'c-and',
      timeframe: 'daily',
      patternIds: ['vcp-setup', 'landscape'],
      minScore: 60,
    })
    expect(hits.map((h) => h.ticker)).toEqual(['BHP'])
    expect(hits[0].message).toMatch(/all 2 patterns/)
  })
})
