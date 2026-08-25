export type BreadthDailyPoint = {
  day: string
  above20: number
  above50: number
  above200: number
  rsi50: number
  adNet: number
}

export async function fetchBreadthDaily(
  universe: string,
): Promise<BreadthDailyPoint[]> {
  try {
    const res = await fetch(`/api/breadth/daily?universe=${encodeURIComponent(universe)}`, {
      credentials: 'include',
    })
    if (!res.ok) return []
    const json = await res.json()
    return Array.isArray(json?.points) ? json.points : []
  } catch {
    return []
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
