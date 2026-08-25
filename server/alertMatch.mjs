/**
 * Pure alert matching (no DB) — unit-testable.
 * @param {{ type: string, params?: object }} rule
 * @param {object[]} stocks
 * @param {{ loaded?: number, indexPerf?: { m3?: number } }} snap
 */
export function matchAlertRule(rule, stocks, snap = {}) {
  const out = []
  const p = rule.params || {}
  if (rule.type === 'rs_min') {
    const minRs = Number(p.minRs ?? 70)
    for (const s of stocks) {
      if ((s.rs ?? 0) >= minRs) {
        out.push({
          ticker: s.ticker,
          message: `${s.ticker} RS ${s.rs} ≥ ${minRs}`,
          payload: { rs: s.rs, m3: s.m3 },
        })
      }
    }
  } else if (rule.type === 'rvol_min') {
    const minRvol = Number(p.minRvol ?? 2)
    for (const s of stocks) {
      if ((s.relativeVolume ?? 0) >= minRvol) {
        out.push({
          ticker: s.ticker,
          message: `${s.ticker} RVOL ${s.relativeVolume}× ≥ ${minRvol}×`,
          payload: { relativeVolume: s.relativeVolume, volume: s.volume },
        })
      }
    }
  } else if (rule.type === 'breadth_above20') {
    const minPct = Number(p.minPct ?? 60)
    const pct =
      stocks.length > 0
        ? (stocks.filter((s) => s.above20ma).length / stocks.length) * 100
        : 0
    if (pct >= minPct) {
      out.push({
        ticker: null,
        message: `Breadth: ${pct.toFixed(1)}% above 20 SMA ≥ ${minPct}%`,
        payload: { pct, loaded: snap.loaded },
      })
    }
  } else if (rule.type === 'm3_outperform') {
    const minExcess = Number(p.minExcess ?? 8)
    const indexM3 = snap.indexPerf?.m3 ?? 0
    for (const s of stocks) {
      const excess = (s.m3 ?? 0) - indexM3
      if (excess >= minExcess) {
        out.push({
          ticker: s.ticker,
          message: `${s.ticker} 3M excess ${excess.toFixed(1)}pp vs index`,
          payload: { m3: s.m3, indexM3, excess },
        })
      }
    }
  }
  return out.slice(0, 25)
}
