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

export const CLASSIC_ANALYZED = 15

export function detectClassic(bars: OhlcBar[]): PatternHit[] {
  const hits: PatternHit[] = []
  if (bars.length < 60) return hits
  const window = bars.slice(-160)
  const { highs, lows } = pivots(window)
  const n = window.length

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
      // Pennant = flag with tighter, more triangular consolidation
      if (flagRange < Math.abs(impulseMove) * 0.28) {
        hits.push({
          id: `pen-bull-${flag[flag.length - 1].t}`,
          category: 'classic',
          name: 'Bull Pennant',
          bias: 'bullish',
          startT: impulse[0].t,
          endT: flag[flag.length - 1].t,
          confidence: 0.6,
          points: [
            { time: impulse[0].t, price: impulse[0].c },
            { time: flag[flag.length - 1].t, price: flag[flag.length - 1].c },
          ],
        })
      }
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
      if (flagRange < Math.abs(impulseMove) * 0.28) {
        hits.push({
          id: `pen-bear-${flag[flag.length - 1].t}`,
          category: 'classic',
          name: 'Bear Pennant',
          bias: 'bearish',
          startT: impulse[0].t,
          endT: flag[flag.length - 1].t,
          confidence: 0.6,
          points: [
            { time: impulse[0].t, price: impulse[0].c },
            { time: flag[flag.length - 1].t, price: flag[flag.length - 1].c },
          ],
        })
      }
    }
  }

  // Triangle family — contracting range + slope of highs/lows
  if (n > 50) {
    const recent = window.slice(-36)
    const first = recent.slice(0, 12)
    const lastSeg = recent.slice(-12)
    const r1 = Math.max(...first.map((b) => b.h)) - Math.min(...first.map((b) => b.l))
    const r2 = Math.max(...lastSeg.map((b) => b.h)) - Math.min(...lastSeg.map((b) => b.l))
    const hiFirst = Math.max(...first.map((b) => b.h))
    const hiLast = Math.max(...lastSeg.map((b) => b.h))
    const loFirst = Math.min(...first.map((b) => b.l))
    const loLast = Math.min(...lastSeg.map((b) => b.l))
    const end = recent[recent.length - 1]

    if (r2 < r1 * 0.55 && r1 > 0) {
      hits.push({
        id: `tri-${end.t}`,
        category: 'classic',
        name: 'Triangle Squeeze',
        bias: 'neutral',
        startT: recent[0].t,
        endT: end.t,
        confidence: 0.6,
        points: [
          { time: recent[0].t, price: recent[0].c },
          { time: end.t, price: end.c },
        ],
        note: 'Range contracting — breakout direction TBD',
      })

      const flatHigh = Math.abs(hiLast - hiFirst) / hiFirst < 0.015
      const flatLow = Math.abs(loLast - loFirst) / Math.max(loFirst, 1e-9) < 0.015
      const risingLows = loLast > loFirst * 1.01
      const fallingHighs = hiLast < hiFirst * 0.99
      const risingHighs = hiLast > hiFirst * 1.01
      const fallingLows = loLast < loFirst * 0.99

      if (flatHigh && risingLows) {
        hits.push({
          id: `atri-${end.t}`,
          category: 'classic',
          name: 'Ascending Triangle',
          bias: 'bullish',
          startT: recent[0].t,
          endT: end.t,
          confidence: 0.64,
          points: [
            { time: recent[0].t, price: hiFirst },
            { time: end.t, price: loLast },
          ],
        })
      } else if (flatLow && fallingHighs) {
        hits.push({
          id: `dtri-${end.t}`,
          category: 'classic',
          name: 'Descending Triangle',
          bias: 'bearish',
          startT: recent[0].t,
          endT: end.t,
          confidence: 0.64,
          points: [
            { time: recent[0].t, price: loFirst },
            { time: end.t, price: hiLast },
          ],
        })
      } else if (fallingHighs && risingLows) {
        hits.push({
          id: `stri-${end.t}`,
          category: 'classic',
          name: 'Symmetrical Triangle',
          bias: 'neutral',
          startT: recent[0].t,
          endT: end.t,
          confidence: 0.63,
          points: [
            { time: recent[0].t, price: recent[0].c },
            { time: end.t, price: end.c },
          ],
        })
      }

      // Wedges: both boundaries slope same direction while range contracts
      if (risingHighs && risingLows && r2 < r1 * 0.7) {
        hits.push({
          id: `rwedge-${end.t}`,
          category: 'classic',
          name: 'Rising Wedge',
          bias: 'bearish',
          startT: recent[0].t,
          endT: end.t,
          confidence: 0.61,
          points: [
            { time: recent[0].t, price: loFirst },
            { time: end.t, price: hiLast },
          ],
        })
      }
      if (fallingHighs && fallingLows && r2 < r1 * 0.7) {
        hits.push({
          id: `fwedge-${end.t}`,
          category: 'classic',
          name: 'Falling Wedge',
          bias: 'bullish',
          startT: recent[0].t,
          endT: end.t,
          confidence: 0.61,
          points: [
            { time: recent[0].t, price: hiFirst },
            { time: end.t, price: loLast },
          ],
        })
      }
    }
  }

  // Cup & Handle — rounded base then shallow pullback
  if (n >= 80) {
    const cup = window.slice(-80, -15)
    const handle = window.slice(-15)
    if (cup.length >= 40 && handle.length >= 8) {
      const left = cup.slice(0, 15)
      const mid = cup.slice(Math.floor(cup.length / 2) - 8, Math.floor(cup.length / 2) + 8)
      const right = cup.slice(-15)
      const leftHi = Math.max(...left.map((b) => b.h))
      const rightHi = Math.max(...right.map((b) => b.h))
      const midLo = Math.min(...mid.map((b) => b.l))
      const rim = Math.min(leftHi, rightHi)
      const depth = (rim - midLo) / rim
      const rimMatch = Math.abs(leftHi - rightHi) / rim < 0.04
      const handleHi = Math.max(...handle.map((b) => b.h))
      const handleLo = Math.min(...handle.map((b) => b.l))
      const handleDepth = (handleHi - handleLo) / handleHi
      const last = handle[handle.length - 1]
      if (
        rimMatch &&
        depth >= 0.08 &&
        depth <= 0.35 &&
        handleDepth < depth * 0.55 &&
        handleHi <= rim * 1.02 &&
        last.c > handleLo * 1.01
      ) {
        hits.push({
          id: `cup-${last.t}`,
          category: 'classic',
          name: 'Cup & Handle',
          bias: 'bullish',
          startT: cup[0].t,
          endT: last.t,
          confidence: 0.66,
          points: [
            { time: left[Math.floor(left.length / 2)].t, price: leftHi },
            { time: mid[Math.floor(mid.length / 2)].t, price: midLo },
            { time: right[Math.floor(right.length / 2)].t, price: rightHi },
            { time: last.t, price: last.c },
          ],
        })
      }

      // Inverse cup & handle (bearish)
      const leftLo = Math.min(...left.map((b) => b.l))
      const rightLo = Math.min(...right.map((b) => b.l))
      const midHi = Math.max(...mid.map((b) => b.h))
      const floor = Math.max(leftLo, rightLo)
      const rise = (midHi - floor) / floor
      const floorMatch = Math.abs(leftLo - rightLo) / Math.max(floor, 1e-9) < 0.04
      if (
        floorMatch &&
        rise >= 0.08 &&
        rise <= 0.35 &&
        handleDepth < rise * 0.55 &&
        handleLo >= floor * 0.98 &&
        last.c < handleHi * 0.99
      ) {
        hits.push({
          id: `icup-${last.t}`,
          category: 'classic',
          name: 'Inverse Cup & Handle',
          bias: 'bearish',
          startT: cup[0].t,
          endT: last.t,
          confidence: 0.64,
          points: [
            { time: left[Math.floor(left.length / 2)].t, price: leftLo },
            { time: mid[Math.floor(mid.length / 2)].t, price: midHi },
            { time: last.t, price: last.c },
          ],
        })
      }
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
