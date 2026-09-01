/** Client-side throttle for `/api/series` — avoids tripping server rate limits during pattern scans. */

const GAP_MS = import.meta.env.PROD ? 45 : 30
const MAX_CONCURRENT = import.meta.env.PROD ? 6 : 6
const FETCH_TIMEOUT_MS = 35_000

let active = 0
const waiters: Array<() => void> = []
let lastStartAt = 0
let chain: Promise<unknown> = Promise.resolve()

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function acquireSlot(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    waiters.push(() => {
      active++
      resolve()
    })
  })
}

function releaseSlot() {
  active = Math.max(0, active - 1)
  const next = waiters.shift()
  if (next) next()
}

async function waitGap() {
  const wait = lastStartAt + GAP_MS - Date.now()
  if (wait > 0) await sleep(wait)
  lastStartAt = Date.now()
}

/**
 * Fetch with global concurrency + gap, serialized through a chain so bursts stay smooth.
 */
export async function fetchSeriesQueued(url: string, init?: RequestInit): Promise<Response> {
  const run = async () => {
    await acquireSlot()
    try {
      await waitGap()
      for (let attempt = 0; attempt < 5; attempt++) {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
        try {
          const res = await fetch(url, {
            ...init,
            credentials: 'include',
            signal: controller.signal,
          })
          if (res.status !== 429) return res
          let waitMs = 10_000
          const retryAfter = res.headers.get('retry-after')
          if (retryAfter) {
            const sec = Number(retryAfter)
            if (Number.isFinite(sec) && sec > 0) waitMs = sec * 1000
          } else {
            try {
              const json = await res.clone().json()
              if (typeof json?.retryAfterMs === 'number' && json.retryAfterMs > 0) {
                waitMs = json.retryAfterMs
              }
            } catch {
              /* ignore */
            }
          }
          await sleep(waitMs)
        } catch (err) {
          if (attempt >= 4) throw err
          await sleep(1500)
        } finally {
          clearTimeout(timer)
        }
      }
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
      try {
        return await fetch(url, { ...init, credentials: 'include', signal: controller.signal })
      } finally {
        clearTimeout(timer)
      }
    } finally {
      releaseSlot()
    }
  }

  const p = chain.then(run, run)
  chain = p.catch(() => {})
  return p
}
