import type { OhlcBar, PatternHit } from './types'

export const STRUCTURE_ANALYZED = 3

function swingPoints(bars: OhlcBar[], look = 3) {
  const swings: { t: number; price: number; type: 'h' | 'l' }[] = []
  for (let i = look; i < bars.length - look; i++) {
    let isH = true
    let isL = true
    for (let j = i - look; j <= i + look; j++) {
      if (j === i) continue
      if (bars[j].h >= bars[i].h) isH = false
      if (bars[j].l <= bars[i].l) isL = false
    }
    if (isH) swings.push({ t: bars[i].t, price: bars[i].h, type: 'h' })
    if (isL) swings.push({ t: bars[i].t, price: bars[i].l, type: 'l' })
  }
  return swings
}

export function detectStructure(bars: OhlcBar[]): PatternHit[] {
  const hits: PatternHit[] = []
  if (bars.length < 40) return hits
  const window = bars.slice(-80)
  const swings = swingPoints(window)
  const highs = swings.filter((s) => s.type === 'h').slice(-4)
  const lows = swings.filter((s) => s.type === 'l').slice(-4)

  if (highs.length >= 2 && lows.length >= 2) {
    const hh = highs[highs.length - 1].price > highs[highs.length - 2].price
    const hl = lows[lows.length - 1].price > lows[lows.length - 2].price
    const lh = highs[highs.length - 1].price < highs[highs.length - 2].price
    const ll = lows[lows.length - 1].price < lows[lows.length - 2].price
    const end = window[window.length - 1]
    if (hh && hl) {
      hits.push({
        id: `struct-up-${end.t}`,
        category: 'structure',
        name: 'Higher Highs & Higher Lows',
        bias: 'bullish',
        startT: lows[lows.length - 2].t,
        endT: end.t,
        confidence: 0.72,
        points: [
          { time: lows[lows.length - 2].t, price: lows[lows.length - 2].price },
          { time: highs[highs.length - 1].t, price: highs[highs.length - 1].price },
        ],
      })
    } else if (lh && ll) {
      hits.push({
        id: `struct-dn-${end.t}`,
        category: 'structure',
        name: 'Lower Highs & Lower Lows',
        bias: 'bearish',
        startT: highs[highs.length - 2].t,
        endT: end.t,
        confidence: 0.72,
        points: [
          { time: highs[highs.length - 2].t, price: highs[highs.length - 2].price },
          { time: lows[lows.length - 1].t, price: lows[lows.length - 1].price },
        ],
      })
    } else {
      hits.push({
        id: `struct-range-${end.t}`,
        category: 'structure',
        name: 'Range / Mixed Structure',
        bias: 'neutral',
        startT: window[0].t,
        endT: end.t,
        confidence: 0.55,
        points: [
          { time: window[0].t, price: window[0].c },
          { time: end.t, price: end.c },
        ],
      })
    }
  }

  if (highs.length >= 2) {
    const last = window[window.length - 1]
    const resist = highs[highs.length - 1]
    if (last.c > resist.price * 1.01) {
      hits.push({
        id: `break-up-${last.t}`,
        category: 'structure',
        name: 'Resistance Break',
        bias: 'bullish',
        startT: resist.t,
        endT: last.t,
        confidence: 0.66,
        points: [
          { time: resist.t, price: resist.price },
          { time: last.t, price: last.c },
        ],
      })
    }
  }
  if (lows.length >= 2) {
    const last = window[window.length - 1]
    const support = lows[lows.length - 1]
    if (last.c < support.price * 0.99) {
      hits.push({
        id: `break-dn-${last.t}`,
        category: 'structure',
        name: 'Support Break',
        bias: 'bearish',
        startT: support.t,
        endT: last.t,
        confidence: 0.66,
        points: [
          { time: support.t, price: support.price },
          { time: last.t, price: last.c },
        ],
      })
    }
  }

  return hits.sort((a, b) => b.endT - a.endT)
}
