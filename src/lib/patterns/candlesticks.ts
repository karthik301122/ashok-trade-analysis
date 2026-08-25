import type { OhlcBar, PatternHit } from './types'

function body(b: OhlcBar) {
  return Math.abs(b.c - b.o)
}
function range(b: OhlcBar) {
  return Math.max(b.h - b.l, 1e-9)
}
function upperWick(b: OhlcBar) {
  return b.h - Math.max(b.o, b.c)
}
function lowerWick(b: OhlcBar) {
  return Math.min(b.o, b.c) - b.l
}
function isBull(b: OhlcBar) {
  return b.c > b.o
}
function isBear(b: OhlcBar) {
  return b.c < b.o
}
function mid(b: OhlcBar) {
  return (b.o + b.c) / 2
}

const CANDLE_DEFS = [
  'Doji',
  'Hammer',
  'Shooting Star',
  'Bullish Engulfing',
  'Bearish Engulfing',
  'Bullish Harami',
  'Bearish Harami',
  'Piercing Line',
  'Dark Cloud Cover',
  'Morning Star',
  'Evening Star',
  'Three White Soldiers',
  'Three Black Crows',
] as const

export const CANDLESTICK_ANALYZED = CANDLE_DEFS.length

/** Scan last ~180 sessions for candlestick patterns */
export function detectCandlesticks(bars: OhlcBar[]): PatternHit[] {
  const hits: PatternHit[] = []
  const start = Math.max(2, bars.length - 180)

  for (let i = start; i < bars.length; i++) {
    const c0 = bars[i]
    const c1 = bars[i - 1]
    const c2 = i >= 2 ? bars[i - 2] : null
    const avgRange = bars.slice(Math.max(0, i - 14), i + 1).reduce((a, b) => a + range(b), 0) / 15

    // Doji
    if (body(c0) / range(c0) < 0.1 && range(c0) > avgRange * 0.4) {
      hits.push({
        id: `doji-${c0.t}`,
        category: 'candlesticks',
        name: 'Doji',
        bias: 'neutral',
        startT: c0.t,
        endT: c0.t,
        confidence: 0.7,
        points: [{ time: c0.t, price: c0.c }],
      })
      if (lowerWick(c0) > range(c0) * 0.6 && upperWick(c0) < range(c0) * 0.1) {
        hits.push({
          id: `ddoji-${c0.t}`,
          category: 'candlesticks',
          name: 'Dragonfly Doji',
          bias: 'bullish',
          startT: c0.t,
          endT: c0.t,
          confidence: 0.72,
          points: [{ time: c0.t, price: c0.l }],
        })
      }
      if (upperWick(c0) > range(c0) * 0.6 && lowerWick(c0) < range(c0) * 0.1) {
        hits.push({
          id: `gdoji-${c0.t}`,
          category: 'candlesticks',
          name: 'Gravestone Doji',
          bias: 'bearish',
          startT: c0.t,
          endT: c0.t,
          confidence: 0.72,
          points: [{ time: c0.t, price: c0.h }],
        })
      }
    }

    // Spinning top
    if (
      body(c0) / range(c0) < 0.3 &&
      body(c0) / range(c0) >= 0.1 &&
      upperWick(c0) > body(c0) &&
      lowerWick(c0) > body(c0)
    ) {
      hits.push({
        id: `spin-${c0.t}`,
        category: 'candlesticks',
        name: 'Spinning Top',
        bias: 'neutral',
        startT: c0.t,
        endT: c0.t,
        confidence: 0.6,
        points: [{ time: c0.t, price: c0.c }],
      })
    }

    // Marubozu
    if (body(c0) / range(c0) > 0.9 && range(c0) > avgRange * 0.8) {
      hits.push({
        id: `maru-${c0.t}`,
        category: 'candlesticks',
        name: isBull(c0) ? 'Bullish Marubozu' : 'Bearish Marubozu',
        bias: isBull(c0) ? 'bullish' : 'bearish',
        startT: c0.t,
        endT: c0.t,
        confidence: 0.7,
        points: [{ time: c0.t, price: c0.c }],
      })
    }

    // Hammer (bullish) — long lower wick, small body near high
    if (
      lowerWick(c0) > body(c0) * 2 &&
      upperWick(c0) < body(c0) * 0.5 &&
      body(c0) / range(c0) < 0.35
    ) {
      hits.push({
        id: `hammer-${c0.t}`,
        category: 'candlesticks',
        name: 'Hammer',
        bias: 'bullish',
        startT: c0.t,
        endT: c0.t,
        confidence: 0.75,
        points: [{ time: c0.t, price: c0.l }],
      })
      if (isBear(c0)) {
        hits.push({
          id: `hang-${c0.t}`,
          category: 'candlesticks',
          name: 'Hanging Man',
          bias: 'bearish',
          startT: c0.t,
          endT: c0.t,
          confidence: 0.65,
          points: [{ time: c0.t, price: c0.h }],
        })
      }
    }

    // Inverted hammer
    if (
      upperWick(c0) > body(c0) * 2 &&
      lowerWick(c0) < body(c0) * 0.5 &&
      body(c0) / range(c0) < 0.35 &&
      isBull(c0)
    ) {
      hits.push({
        id: `invham-${c0.t}`,
        category: 'candlesticks',
        name: 'Inverted Hammer',
        bias: 'bullish',
        startT: c0.t,
        endT: c0.t,
        confidence: 0.68,
        points: [{ time: c0.t, price: c0.h }],
      })
    }

    // Shooting star
    if (
      upperWick(c0) > body(c0) * 2 &&
      lowerWick(c0) < body(c0) * 0.5 &&
      body(c0) / range(c0) < 0.35 &&
      isBear(c0)
    ) {
      hits.push({
        id: `shoot-${c0.t}`,
        category: 'candlesticks',
        name: 'Shooting Star',
        bias: 'bearish',
        startT: c0.t,
        endT: c0.t,
        confidence: 0.75,
        points: [{ time: c0.t, price: c0.h }],
      })
    }

    // Tweezers
    if (Math.abs(c0.l - c1.l) / Math.max(c0.l, 1e-9) < 0.002 && isBull(c0) && isBear(c1)) {
      hits.push({
        id: `twz-b-${c0.t}`,
        category: 'candlesticks',
        name: 'Tweezer Bottom',
        bias: 'bullish',
        startT: c1.t,
        endT: c0.t,
        confidence: 0.66,
        points: [
          { time: c1.t, price: c1.l },
          { time: c0.t, price: c0.l },
        ],
      })
    }
    if (Math.abs(c0.h - c1.h) / Math.max(c0.h, 1e-9) < 0.002 && isBear(c0) && isBull(c1)) {
      hits.push({
        id: `twz-t-${c0.t}`,
        category: 'candlesticks',
        name: 'Tweezer Top',
        bias: 'bearish',
        startT: c1.t,
        endT: c0.t,
        confidence: 0.66,
        points: [
          { time: c1.t, price: c1.h },
          { time: c0.t, price: c0.h },
        ],
      })
    }

    // Engulfing
    if (isBull(c0) && isBear(c1) && c0.o <= c1.c && c0.c >= c1.o && body(c0) > body(c1) * 1.05) {
      hits.push({
        id: `eng-bull-${c0.t}`,
        category: 'candlesticks',
        name: 'Bullish Engulfing',
        bias: 'bullish',
        startT: c1.t,
        endT: c0.t,
        confidence: 0.8,
        points: [
          { time: c1.t, price: c1.c },
          { time: c0.t, price: c0.c },
        ],
      })
    }
    if (isBear(c0) && isBull(c1) && c0.o >= c1.c && c0.c <= c1.o && body(c0) > body(c1) * 1.05) {
      hits.push({
        id: `eng-bear-${c0.t}`,
        category: 'candlesticks',
        name: 'Bearish Engulfing',
        bias: 'bearish',
        startT: c1.t,
        endT: c0.t,
        confidence: 0.8,
        points: [
          { time: c1.t, price: c1.c },
          { time: c0.t, price: c0.c },
        ],
      })
    }

    // Harami
    if (isBear(c1) && isBull(c0) && c0.o > c1.c && c0.c < c1.o && body(c0) < body(c1) * 0.6) {
      hits.push({
        id: `har-bull-${c0.t}`,
        category: 'candlesticks',
        name: 'Bullish Harami',
        bias: 'bullish',
        startT: c1.t,
        endT: c0.t,
        confidence: 0.65,
        points: [
          { time: c1.t, price: mid(c1) },
          { time: c0.t, price: mid(c0) },
        ],
      })
    }
    if (isBull(c1) && isBear(c0) && c0.o < c1.c && c0.c > c1.o && body(c0) < body(c1) * 0.6) {
      hits.push({
        id: `har-bear-${c0.t}`,
        category: 'candlesticks',
        name: 'Bearish Harami',
        bias: 'bearish',
        startT: c1.t,
        endT: c0.t,
        confidence: 0.65,
        points: [
          { time: c1.t, price: mid(c1) },
          { time: c0.t, price: mid(c0) },
        ],
      })
    }

    // Piercing / Dark cloud
    if (
      isBear(c1) &&
      isBull(c0) &&
      c0.o < c1.l &&
      c0.c > mid(c1) &&
      c0.c < c1.o
    ) {
      hits.push({
        id: `pierce-${c0.t}`,
        category: 'candlesticks',
        name: 'Piercing Line',
        bias: 'bullish',
        startT: c1.t,
        endT: c0.t,
        confidence: 0.7,
        points: [
          { time: c1.t, price: c1.c },
          { time: c0.t, price: c0.c },
        ],
      })
    }
    if (
      isBull(c1) &&
      isBear(c0) &&
      c0.o > c1.h &&
      c0.c < mid(c1) &&
      c0.c > c1.o
    ) {
      hits.push({
        id: `dark-${c0.t}`,
        category: 'candlesticks',
        name: 'Dark Cloud Cover',
        bias: 'bearish',
        startT: c1.t,
        endT: c0.t,
        confidence: 0.7,
        points: [
          { time: c1.t, price: c1.c },
          { time: c0.t, price: c0.c },
        ],
      })
    }

    // Morning / Evening star
    if (c2) {
      const smallMid = body(c1) < body(c2) * 0.5 && body(c1) < body(c0) * 0.5
      if (
        isBear(c2) &&
        smallMid &&
        isBull(c0) &&
        c0.c > mid(c2) &&
        c1.c < c2.c
      ) {
        hits.push({
          id: `mstar-${c0.t}`,
          category: 'candlesticks',
          name: 'Morning Star',
          bias: 'bullish',
          startT: c2.t,
          endT: c0.t,
          confidence: 0.82,
          points: [
            { time: c2.t, price: c2.c },
            { time: c1.t, price: c1.c },
            { time: c0.t, price: c0.c },
          ],
        })
      }
      if (
        isBull(c2) &&
        smallMid &&
        isBear(c0) &&
        c0.c < mid(c2) &&
        c1.c > c2.c
      ) {
        hits.push({
          id: `estar-${c0.t}`,
          category: 'candlesticks',
          name: 'Evening Star',
          bias: 'bearish',
          startT: c2.t,
          endT: c0.t,
          confidence: 0.82,
          points: [
            { time: c2.t, price: c2.c },
            { time: c1.t, price: c1.c },
            { time: c0.t, price: c0.c },
          ],
        })
      }
    }

    // Three soldiers / crows
    if (i >= 2 && c2) {
      if (
        isBull(c2) &&
        isBull(c1) &&
        isBull(c0) &&
        c1.c > c2.c &&
        c0.c > c1.c &&
        c1.o > c2.o &&
        c0.o > c1.o &&
        body(c0) > avgRange * 0.35
      ) {
        hits.push({
          id: `soldiers-${c0.t}`,
          category: 'candlesticks',
          name: 'Three White Soldiers',
          bias: 'bullish',
          startT: c2.t,
          endT: c0.t,
          confidence: 0.78,
          points: [
            { time: c2.t, price: c2.c },
            { time: c1.t, price: c1.c },
            { time: c0.t, price: c0.c },
          ],
        })
      }
      if (
        isBear(c2) &&
        isBear(c1) &&
        isBear(c0) &&
        c1.c < c2.c &&
        c0.c < c1.c &&
        c1.o < c2.o &&
        c0.o < c1.o &&
        body(c0) > avgRange * 0.35
      ) {
        hits.push({
          id: `crows-${c0.t}`,
          category: 'candlesticks',
          name: 'Three Black Crows',
          bias: 'bearish',
          startT: c2.t,
          endT: c0.t,
          confidence: 0.78,
          points: [
            { time: c2.t, price: c2.c },
            { time: c1.t, price: c1.c },
            { time: c0.t, price: c0.c },
          ],
        })
      }
    }
  }

  // Keep newest hit per pattern name (avoid flooding)
  const best = new Map<string, PatternHit>()
  for (const h of hits) {
    const prev = best.get(h.name)
    if (!prev || h.endT > prev.endT) best.set(h.name, h)
  }
  return [...best.values()].sort((a, b) => b.endT - a.endT)
}
