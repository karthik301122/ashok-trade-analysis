import { describe, expect, it } from 'vitest'
import type { CachedPatternHit } from './patternHitsCache'
import type { PatternPrefs } from './patternPrefs'
import {
  hasOverviewPatternWatch,
  hasStarredWeeklySpecial,
  mergeOverviewHits,
  overviewWatchNames,
  resolveOverviewHits,
  starredSpecialPatterns,
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
      createdAt: 1,
    },
    {
      id: 'c2',
      name: 'My Flag',
      bias: 'bullish',
      description: '',
      basedOn: 'Bull Flag',
      rules: null,
      createdAt: 1,
    },
  ],
  scanWindow: '1m',
}

describe('overviewPatternHits', () => {
  it('detects watch list from stars and detectable customs', () => {
    expect(hasOverviewPatternWatch(prefs)).toBe(true)
    expect(overviewWatchNames(prefs).sort()).toEqual([
      '3 Weeks Tight',
      'Hammer',
      'My Flag',
      'My RVOL',
    ])
  })

  it('flags starred weekly specials', () => {
    expect(hasStarredWeeklySpecial(prefs)).toBe(true)
    expect(starredSpecialPatterns(prefs).map((p) => p.id)).toEqual(['three-weeks-tight'])
  })

  it('resolves starred, custom rule, and alias hits', () => {
    const cached: CachedPatternHit[] = [
      { name: 'Hammer', bias: 'bullish', endT: 100, confidence: 0.8 },
      { name: 'My RVOL', bias: 'bullish', endT: 99, confidence: 0.7 },
      { name: 'Bull Flag', bias: 'bullish', endT: 98, confidence: 0.75 },
    ]
    const hits = resolveOverviewHits(cached, prefs)
    expect(hits.map((h) => h.name).sort()).toEqual(['Hammer', 'My Flag', 'My RVOL'])
  })

  it('merges special hits onto chart overview hits', () => {
    const chart: CachedPatternHit[] = [
      { name: 'Hammer', bias: 'bullish', endT: 100, confidence: 0.8 },
    ]
    const special: CachedPatternHit[] = [
      { name: '3 Weeks Tight', bias: 'bullish', endT: 90, confidence: 0.85 },
    ]
    expect(mergeOverviewHits(chart, special).map((h) => h.name)).toEqual([
      'Hammer',
      '3 Weeks Tight',
    ])
  })

  it('returns empty when nothing watched matches', () => {
    expect(resolveOverviewHits([], prefs)).toEqual([])
  })
})
