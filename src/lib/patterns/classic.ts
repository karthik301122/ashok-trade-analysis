import type { OhlcBar, PatternHit } from './types'

function pivots(bars: OhlcBar[], left = 3, right = 3) {
  const highs: { i: number; price: number; t: number }[] = []
  const lows: { i: number; price: number; t: number }[] = []
  for (let i = left; i < bars.length - right; i++) {
    let isH = true
    let isL = true
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue
      if (bars[j].h >= bars[i].h) isH = false
      if (bars[j].l <= bars[i].l) isL = false
    }
    if (isH) highs.push({ i, price: bars[i].h, t: bars[i].t })
    if (isL) lows.push({ i, price: bars[i].l, t: bars[i].t })
  }
  return { highs, lows }
}

export const CLASSIC_ANALYZED = 6

export function detectClassic(bars: OhlcBar[]): PatternHit[] {
  const hits: PatternHit[] = []
  if (bars.length < 60) return hits
  const window = bars.slice(-160)
  const { highs, lows } = pivots(window)

  // Double top
  for (let a = 0; a < highs.length - 1; a++) {
    for (let b = a + 1; b < highs.length; b++) {
      const p1 = highs[a]
      const p2 = highs[b]
      if (p2.i - p1.i < 8 || p2.i - p1.i > 60) continue
      const tol = p1.price * 0.02
      if (Math.abs(p1.price - p2.price) > tol) continue
      const midSlice = window.slice(p1.i, p2.i + 1)
      const trough = Math.min(...midSlice.map((x) => x.l))
      if (trough >= p1.price * 0.97) continue
      const last = window[window.length - 1]
      if (last.c > trough * 1.01 && last.t - p2.t < 40 * 86400) {
        hits.push({
          id: `dt-${p1.t}-${p2.t}`,
          category: 'classic',
          name: 'Double Top',
          bias: 'bearish',
          startT: p1.t,
          endT: p2.t,
          confidence: 0.7,
          points: [
            { time: p1.t, price: p1.price },
            { time: p2.t, price: p2.price },
          ],
        })
      }
    }
  }

  // Double bottom
  for (let a = 0; a < lows.length - 1; a++) {
    for (let b = a + 1; b < lows.length; b++) {
      const p1 = lows[a]
      const p2 = lows[b]
      if (p2.i - p1.i < 8 || p2.i - p1.i > 60) continue
      const tol = p1.price * 0.02
      if (Math.abs(p1.price - p2.price) > tol) continue
      const midSlice = window.slice(p1.i, p2.i + 1)
      const peak = Math.max(...midSlice.map((x) => x.h))
      if (peak <= p1.price * 1.03) continue
      const last = window[window.length - 1]
      if (last.c < peak * 0.99 && last.t - p2.t < 40 * 86400) {
        hits.push({
          id: `db-${p1.t}-${p2.t}`,
          category: 'classic',
          name: 'Double Bottom',
          bias: 'bullish',
          startT: p1.t,
          endT: p2.t,
          confidence: 0.7,
          points: [
            { time: p1.t, price: p1.price },
            { time: p2.t, price: p2.price },
          ],
        })
      }
    }
  }

  // Bull / bear flag — consolidation after impulse
  const n = window.length
  if (n > 40) {
    const impulse = window.slice(n - 25, n - 10)
    const flag = window.slice(n - 10)
    const impulseMove = impulse[impulse.length - 1].c - impulse[0].c
    const flagHigh = Math.max(...flag.map((b) => b.h))
    const flagLow = Math.min(...flag.map((b) => b.l))
    const flagRange = flagHigh - flagLow
    const avg = impulse.reduce((a, b) => a + b.c, 0) / impulse.length
    if (impulseMove > avg * 0.06 && flagRange < Math.abs(impulseMove) * 0.45) {
      hits.push({
        id: `flag-bull-${flag[flag.length - 1].t}`,
        category: 'classic',
        name: 'Bull Flag',
        bias: 'bullish',
        startT: impulse[0].t,
        endT: flag[flag.length - 1].t,
        confidence: 0.62,
        points: [
          { time: impulse[0].t, price: impulse[0].c },
          { time: impulse[impulse.length - 1].t, price: impulse[impulse.length - 1].c },
          { time: flag[flag.length - 1].t, price: flag[flag.length - 1].c },
        ],
      })
    }
    if (impulseMove < -avg * 0.06 && flagRange < Math.abs(impulseMove) * 0.45) {
      hits.push({
        id: `flag-bear-${flag[flag.length - 1].t}`,
        category: 'classic',
        name: 'Bear Flag',
        bias: 'bearish',
        startT: impulse[0].t,
        endT: flag[flag.length - 1].t,
        confidence: 0.62,
        points: [
          { time: impulse[0].t, price: impulse[0].c },
          { time: impulse[impulse.length - 1].t, price: impulse[impulse.length - 1].c },
          { time: flag[flag.length - 1].t, price: flag[flag.length - 1].c },
        ],
      })
    }
  }

  // Triangle squeeze — narrowing range
  if (n > 50) {
    const recent = window.slice(-30)
    const first = recent.slice(0, 10)
    const last = recent.slice(-10)
    const r1 = Math.max(...first.map((b) => b.h)) - Math.min(...first.map((b) => b.l))
    const r2 = Math.max(...last.map((b) => b.h)) - Math.min(...last.map((b) => b.l))
    if (r2 < r1 * 0.55 && r1 > 0) {
      hits.push({
        id: `tri-${recent[recent.length - 1].t}`,
        category: 'classic',
        name: 'Triangle Squeeze',
        bias: 'neutral',
        startT: recent[0].t,
        endT: recent[recent.length - 1].t,
        confidence: 0.6,
        points: [
          { time: recent[0].t, price: recent[0].c },
          { time: recent[recent.length - 1].t, price: recent[recent.length - 1].c },
        ],
        note: 'Range contracting — breakout direction TBD',
      })
    }
  }

  // Simple H&S / inverse — 3 highs with middle highest
  if (highs.length >= 3) {
    for (let i = 0; i < highs.length - 2; i++) {
      const l = highs[i]
      const m = highs[i + 1]
      const r = highs[i + 2]
      if (m.price > l.price * 1.015 && m.price > r.price * 1.015) {
        if (Math.abs(l.price - r.price) / m.price < 0.03 && r.i - l.i < 80) {
          hits.push({
            id: `hs-${m.t}`,
            category: 'classic',
            name: 'Head & Shoulders',
            bias: 'bearish',
            startT: l.t,
            endT: r.t,
            confidence: 0.68,
            points: [
              { time: l.t, price: l.price },
              { time: m.t, price: m.price },
              { time: r.t, price: r.price },
            ],
          })
        }
      }
    }
  }
  if (lows.length >= 3) {
    for (let i = 0; i < lows.length - 2; i++) {
      const l = lows[i]
      const m = lows[i + 1]
      const r = lows[i + 2]
      if (m.price < l.price * 0.985 && m.price < r.price * 0.985) {
        if (Math.abs(l.price - r.price) / Math.max(m.price, 1e-9) < 0.03 && r.i - l.i < 80) {
          hits.push({
            id: `ihs-${m.t}`,
            category: 'classic',
            name: 'Inverse Head & Shoulders',
            bias: 'bullish',
            startT: l.t,
            endT: r.t,
            confidence: 0.68,
            points: [
              { time: l.t, price: l.price },
              { time: m.t, price: m.price },
              { time: r.t, price: r.price },
            ],
          })
        }
      }
    }
  }

  const best = new Map<string, PatternHit>()
  for (const h of hits) {
    const prev = best.get(h.name)
    if (!prev || h.confidence > prev.confidence || h.endT > prev.endT) best.set(h.name, h)
  }
  return [...best.values()].sort((a, b) => b.endT - a.endT)
}
