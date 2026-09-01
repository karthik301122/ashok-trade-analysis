export type BreadthDailyPoint = {
  day: string
  above20: number
  above50: number
  above200: number
  rsi50: number
  adNet: number
  advancing?: number | null
  declining?: number | null
  near52w?: number | null
  rsi70?: number | null
  rsi30?: number | null
  rs50?: number | null
  rvol15?: number | null
}

export type BreadthIndexBar = {
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
}

export type BreadthDailyResponse = {
  points: BreadthDailyPoint[]
  chartHistory: BreadthDailyPoint[]
  indexBars: BreadthIndexBar[]
}

function coerceNum(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : NaN
}

/** Postgres BIGINT timestamps may arrive as strings in JSON — normalize for charts. */
export function coerceIndexBar(raw: unknown): BreadthIndexBar | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const t = coerceNum(r.t)
  const c = coerceNum(r.c)
  if (!Number.isFinite(t) || !Number.isFinite(c)) return null
  const o = coerceNum(r.o)
  const h = coerceNum(r.h)
  const l = coerceNum(r.l)
  const v = coerceNum(r.v)
  const open = Number.isFinite(o) ? o : c
  return {
    t,
    c,
    o: open,
    h: Number.isFinite(h) ? h : Math.max(open, c),
    l: Number.isFinite(l) ? l : Math.min(open, c),
    v: Number.isFinite(v) ? v : 0,
  }
}

export function coerceIndexBars(raw: unknown): BreadthIndexBar[] {
  if (!Array.isArray(raw)) return []
  const out: BreadthIndexBar[] = []
  for (const row of raw) {
    const bar = coerceIndexBar(row)
    if (bar) out.push(bar)
  }
  return out
}

/** Client fallback when /api/breadth/daily indexBars are thin — uses cached ^AXJO series. */
export async function fetchIndexBarsForChart(fromIso: string): Promise<BreadthIndexBar[]> {
  try {
    const res = await fetch(
      `/api/series/^AXJO?from=${encodeURIComponent(fromIso)}`,
      { credentials: 'include', cache: 'no-store' },
    )
    if (!res.ok) return []
    const json = await res.json()
    const bars = coerceIndexBars(json?.closes)
    return bars.length >= 2 ? bars : []
  } catch {
    return []
  }
}

export async function fetchBreadthDaily(universe: string): Promise<BreadthDailyResponse> {
  try {
    const res = await fetch(`/api/breadth/daily?universe=${encodeURIComponent(universe)}`, {
      credentials: 'include',
      cache: 'no-store',
    })
    if (!res.ok) return { points: [], chartHistory: [], indexBars: [] }
    const json = await res.json()
    return {
      points: Array.isArray(json?.points) ? json.points : [],
      chartHistory: Array.isArray(json?.chartHistory) ? json.chartHistory : [],
      indexBars: coerceIndexBars(json?.indexBars),
    }
  } catch {
    return { points: [], chartHistory: [], indexBars: [] }
  }
}

export async function postBreadthDaily(
  universe: string,
  point: Omit<BreadthDailyPoint, 'day'> & { day?: string },
): Promise<BreadthDailyPoint[]> {
  try {
    const res = await fetch('/api/breadth/daily', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ universe, ...point }),
    })
    if (!res.ok) return []
    const json = await res.json()
    return Array.isArray(json?.points) ? json.points : []
  } catch {
    return []
  }
}
