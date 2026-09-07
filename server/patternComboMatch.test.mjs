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

  it('ranks AND/OR hits by combo score descending', async () => {
    const now = Date.now()
    await sqlRun('DELETE FROM pattern_scan_state')
    for (const row of [
      ['AAA', 'vcp-setup', 90],
      ['AAA', 'landscape', 88],
      ['ZZZ', 'vcp-setup', 65],
      ['ZZZ', 'landscape', 62],
      ['MMM', 'vcp-setup', 80],
      ['MMM', 'landscape', 95],
    ]) {
      await sqlRun(
        `INSERT INTO pattern_scan_state (ticker, pattern_id, score, confirmed, updated_at)
         VALUES (?, ?, ?, 0, ?)`,
        [row[0], row[1], row[2], now],
      )
    }
    const andHits = await matchPatternCombo({
      op: 'and',
      name: 'Rank',
      comboId: 'c-rank',
      patternIds: ['vcp-setup', 'landscape'],
      minScore: 60,
    })
    // AND score = min(pattern scores): AAA=88, MMM=80, ZZZ=62
    expect(andHits.map((h) => h.ticker)).toEqual(['AAA', 'MMM', 'ZZZ'])
    expect(andHits.map((h) => h.payload.score)).toEqual([88, 80, 62])
  })
})
