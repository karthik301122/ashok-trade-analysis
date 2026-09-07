import { describe, expect, it } from 'vitest'
import type { CachedPatternHit } from './patternHitsCache'
import type { PatternPrefs } from './patternPrefs'
import {
  catalogSpecialPatterns,
  hasOverviewChartWatch,
  hasOverviewPatternWatch,
  hasStarredWeeklySpecial,
  mergeOverviewHits,
  overviewWatchNames,
  resolveOverviewHits,
} from './overviewPatternHits'

const prefs: PatternPrefs = {
  starredNames: ['Hammer', '3 Weeks Tight'],
  customPatterns: [
    {
      id: 'c1',
      name: 'My RVOL',
      bias: 'bullish',
      description: '',
      basedOn: null,
      rules: { match: 'all', conditions: [{ id: '1', metric: 'rvol', op: 'gte', value: 2 }] },
      candleShape: null,
      createdAt: 1,
    },
    {
      id: 'c2',
      name: 'My Flag',
      bias: 'bullish',
      description: '',
      basedOn: 'Bull Flag',
      rules: null,
      candleShape: null,
      createdAt: 1,
    },
  ],
  scanWindow: '1m',
}

const emptyPrefs: PatternPrefs = {
  starredNames: [],
  customPatterns: [],
  scanWindow: '1m',
}

describe('overviewPatternHits', () => {
  it('always watches special patterns on the desk', () => {
    expect(hasOverviewPatternWatch(emptyPrefs)).toBe(true)
    expect(catalogSpecialPatterns().length).toBeGreaterThan(10)
    expect(hasStarredWeeklySpecial(emptyPrefs)).toBe(true)
  })

  it('chart watch names exclude specials from star list', () => {
    expect(overviewWatchNames(prefs).sort()).toEqual(['Hammer', 'My Flag', 'My RVOL'])
    expect(hasOverviewChartWatch(prefs)).toBe(true)
    expect(hasOverviewChartWatch(emptyPrefs)).toBe(false)
  })

  it('resolves starred chart, custom rule, and alias hits', () => {
    const cached: CachedPatternHit[] = [
      { name: 'Hammer', bias: 'bullish', endT: 100, confidence: 0.8 },
      { name: 'My RVOL', bias: 'bullish', endT: 99, confidence: 0.7 },
      { name: 'Bull Flag', bias: 'bullish', endT: 98, confidence: 0.75 },
    ]
    const hits = resolveOverviewHits(cached, prefs)
    expect(hits.map((h) => h.name).sort()).toEqual(['Hammer', 'My Flag', 'My RVOL'])
  })

  it('merges special hits onto chart overview hits ranked by score', () => {
    const chart: CachedPatternHit[] = [
      { name: 'Hammer', bias: 'bullish', endT: 100, confidence: 0.8 },
    ]
    const special: CachedPatternHit[] = [
      { name: '3 Weeks Tight', bias: 'bullish', endT: 90, confidence: 0.85 },
    ]
    // 0.85 is treated as confirmed, so special ranks ahead of Hammer (0.8).
    expect(mergeOverviewHits(chart, special).map((h) => h.name)).toEqual([
      '3 Weeks Tight',
      'Hammer',
    ])
  })

  it('ranks multiple chart hits by confidence not recency', () => {
    const cached: CachedPatternHit[] = [
      { name: 'Hammer', bias: 'bullish', endT: 200, confidence: 0.7 },
      { name: 'My RVOL', bias: 'bullish', endT: 100, confidence: 0.95 },
      { name: 'Bull Flag', bias: 'bullish', endT: 150, confidence: 0.8 },
    ]
    expect(resolveOverviewHits(cached, prefs).map((h) => h.name)).toEqual([
      'My RVOL',
      'My Flag',
      'Hammer',
    ])
  })

  it('returns empty chart hits when nothing watched', () => {
    expect(resolveOverviewHits([], emptyPrefs)).toEqual([])
  })
})
