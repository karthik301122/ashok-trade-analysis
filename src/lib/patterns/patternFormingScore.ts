/** Score 0–100 from boolean checklist items (pattern forming progress). */
export function scoreFromFlags(flags: boolean[]): number {
  if (!flags.length) return 0
  const passed = flags.filter(Boolean).length
  return Math.round((passed / flags.length) * 100)
}

export function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

/** 0 below `lo`, 100 at/above `hi`, linear in between (higher is better). */
export function rampUp(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) return 0
  if (hi <= lo) return value >= hi ? 100 : 0
  if (value <= lo) return 0
  if (value >= hi) return 100
  return clampScore(((value - lo) / (hi - lo)) * 100)
}

/** 100 at/below `best`, 0 at/above `worst`, linear in between (lower is better). */
export function rampDown(value: number, best: number, worst: number): number {
  if (!Number.isFinite(value)) return 0
  if (worst <= best) return value <= best ? 100 : 0
  if (value <= best) return 100
  if (value >= worst) return 0
  return clampScore((1 - (value - best) / (worst - best)) * 100)
}

/** Weighted average of partial scores (weights need not sum to 1). */
export function blendScores(parts: Array<{ score: number; weight: number }>): number {
  let num = 0
  let den = 0
  for (const p of parts) {
    const w = Number(p.weight)
    if (!Number.isFinite(w) || w <= 0) continue
    num += clampScore(p.score) * w
    den += w
  }
  if (!den) return 0
  return clampScore(num / den)
}
