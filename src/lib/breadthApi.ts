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
      indexBars: Array.isArray(json?.indexBars) ? json.indexBars : [],
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
