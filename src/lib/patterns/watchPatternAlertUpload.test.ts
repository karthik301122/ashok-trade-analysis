import { describe, expect, it } from 'vitest'
import type { PatternPrefs } from '../patternPrefs'
import {
  collectWatchPatternUploadRows,
  confidenceToAlertScore,
  buildPatternAlertOptions,
} from './watchPatternAlertUpload'
import { chartPatternAlertId, customPatternAlertId } from './patternAlertIds'
import type { PatternHit } from './types'

describe('watchPatternAlertUpload', () => {
  it('maps confidence to alert score', () => {
    expect(confidenceToAlertScore(0.72)).toBe(72)
    expect(confidenceToAlertScore(1.1)).toBe(100)
  })

  it('uploads starred chart hits', () => {
    const prefs: PatternPrefs = {
      starredNames: ['Hammer'],
      customPatterns: [],
      scanWindow: '3m',
      chartInterval: 'auto',
    }
    const hits: PatternHit[] = [
      {
        id: 'h1',
        category: 'candlesticks',
        name: 'Hammer',
        bias: 'bullish',
        startT: 1,
        endT: 2,
        confidence: 0.8,
        points: [],
      },
    ]
    const rows = collectWatchPatternUploadRows('cba', prefs, hits, [])
    expect(rows).toHaveLength(1)
    expect(rows[0].patternId).toBe(chartPatternAlertId('Hammer'))
    expect(rows[0].score).toBe(80)
    expect(rows[0].confirmed).toBe(false)
  })

  it('uploads My Pattern hits with custom id', () => {
    const prefs: PatternPrefs = {
      starredNames: [],
      customPatterns: [
        {
          id: 'my-1',
          name: 'Tight base',
          bias: 'bullish',
          description: 'test',
          basedOn: null,
          rules: {
            id: 'r1',
            join: 'and',
            conditions: [
              {
                id: 'c1',
                metric: 'rsi',
                op: 'gte',
                value: 50,
              },
            ],
          },
          candleShape: null,
          scanScript: null,
          createdAt: 1,
        },
      ],
      scanWindow: '3m',
      chartInterval: 'auto',
    }
    const customHits: PatternHit[] = [
      {
        id: 'c1',
        category: 'custom',
        name: 'Tight base',
        bias: 'bullish',
        startT: 1,
        endT: 2,
        confidence: 0.9,
        points: [],
      },
    ]
    const rows = collectWatchPatternUploadRows('bhp', prefs, [], customHits)
    expect(rows[0].patternId).toBe(customPatternAlertId('my-1'))
    expect(rows[0].confirmed).toBe(true)
  })

  it('lists special, starred, and custom in alert options', () => {
    const prefs: PatternPrefs = {
      starredNames: ['Hammer'],
      customPatterns: [
        {
          id: 'x',
          name: 'My scan',
          bias: 'bullish',
          description: '',
          basedOn: null,
          rules: { id: 'r', join: 'and', conditions: [] },
          candleShape: null,
          scanScript: 'rsi > 50',
          createdAt: 1,
        },
      ],
      scanWindow: '3m',
      chartInterval: 'auto',
    }
    const opts = buildPatternAlertOptions(prefs)
    expect(opts.some((o) => o.id === chartPatternAlertId('Hammer'))).toBe(true)
    expect(opts.some((o) => o.id === customPatternAlertId('x'))).toBe(true)
    expect(opts.some((o) => o.id === 'landscape')).toBe(true)
  })
})
