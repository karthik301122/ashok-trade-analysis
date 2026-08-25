import type { OhlcBar, PatternHit } from './types'

export const VOLUME_ANALYZED = 3

function rsiWilder(closes: number[], period = 14): number[] {
  const out = new Array(closes.length).fill(NaN)
  if (closes.length <= period) return out
  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1]
    if (d >= 0) avgGain += d
    else avgLoss -= d
  }
  avgGain /= period
  avgLoss /= period
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    const gain = d > 0 ? d : 0
    const loss = d < 0 ? -d : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return out
}

export function detectVolumeMomentum(bars: OhlcBar[]): PatternHit[] {
  const hits: PatternHit[] = []
  if (bars.length < 40) return hits
  const closes = bars.map((b) => b.c)
  const rsi = rsiWilder(closes)

  // High relative volume breakout
  for (let i = Math.max(21, bars.length - 60); i < bars.length; i++) {
    const avg =
      bars.slice(i - 20, i).reduce((a, b) => a + (b.v || 0), 0) / 20
    if (avg <= 0) continue
    const rvol = (bars[i].v || 0) / avg
    const prev = bars[i - 1]
    if (rvol >= 1.8 && bars[i].c > prev.h) {
      hits.push({
        id: `rvol-bo-${bars[i].t}`,
        category: 'volume',
        name: 'Volume Breakout',
        bias: 'bullish',
        startT: prev.t,
        endT: bars[i].t,
        confidence: Math.min(0.9, 0.55 + rvol / 10),
        points: [
          { time: prev.t, price: prev.h },
          { time: bars[i].t, price: bars[i].c },
        ],
        note: `RVOL ${rvol.toFixed(1)}×`,
      })
    }
    if (rvol >= 1.8 && bars[i].c < prev.l) {
      hits.push({
        id: `rvol-bd-${bars[i].t}`,
        category: 'volume',
        name: 'Volume Breakdown',
        bias: 'bearish',
        startT: prev.t,
        endT: bars[i].t,
        confidence: Math.min(0.9, 0.55 + rvol / 10),
        points: [
          { time: prev.t, price: prev.l },
          { time: bars[i].t, price: bars[i].c },
        ],
        note: `RVOL ${rvol.toFixed(1)}×`,
      })
    }
  }

  // RSI divergence (simple swing)
  const i = bars.length - 1
  const lookback = 40
  if (i > lookback && Number.isFinite(rsi[i])) {
    let priceLowI = i
    let priceHighI = i
    for (let j = i - lookback; j < i; j++) {
      if (bars[j].l < bars[priceLowI].l) priceLowI = j
      if (bars[j].h > bars[priceHighI].h) priceHighI = j
    }
    // Bullish divergence: lower price low, higher RSI
    if (
      priceLowI < i - 5 &&
      bars[i].l <= bars[priceLowI].l * 1.005 &&
      rsi[i] > rsi[priceLowI] + 3
    ) {
      hits.push({
        id: `rsi-bull-${bars[i].t}`,
        category: 'volume',
        name: 'Bullish RSI Divergence',
        bias: 'bullish',
        startT: bars[priceLowI].t,
        endT: bars[i].t,
        confidence: 0.64,
        points: [
          { time: bars[priceLowI].t, price: bars[priceLowI].l },
          { time: bars[i].t, price: bars[i].l },
        ],
      })
    }
    // Bearish divergence
    if (
      priceHighI < i - 5 &&
      bars[i].h >= bars[priceHighI].h * 0.995 &&
      rsi[i] < rsi[priceHighI] - 3
    ) {
      hits.push({
        id: `rsi-bear-${bars[i].t}`,
        category: 'volume',
        name: 'Bearish RSI Divergence',
        bias: 'bearish',
        startT: bars[priceHighI].t,
        endT: bars[i].t,
        confidence: 0.64,
        points: [
          { time: bars[priceHighI].t, price: bars[priceHighI].h },
          { time: bars[i].t, price: bars[i].h },
        ],
      })
    }
  }

  const best = new Map<string, PatternHit>()
  for (const h of hits) {
    const prev = best.get(h.name)
    if (!prev || h.endT > prev.endT) best.set(h.name, h)
  }
  return [...best.values()].sort((a, b) => b.endT - a.endT)
}
