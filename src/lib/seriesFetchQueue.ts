/** Client-side throttle for `/api/series` — avoids wedging App Service during pattern scans. */

const GAP_MS = import.meta.env.PROD ? 120 : 40
/** Match server SERIES_MAX_IN_FLIGHT (prod default 1). Extra client concurrency just queues 503s. */
const MAX_CONCURRENT = import.meta.env.PROD ? 1 : 3
const FETCH_TIMEOUT_MS = import.meta.env.PROD ? 12_000 : 35_000

let active = 0
const waiters: Array<() => void> = []
let lastStartAt = 0
let chain: Promise<unknown> = Promise.resolve()
/** Pause new starts after server shedding / timeouts. */
let pauseUntil = 0

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
  const pause = pauseUntil - Date.now()
  if (pause > 0) await sleep(pause)
  const wait = lastStartAt + GAP_MS - Date.now()
  if (wait > 0) await sleep(wait)
  lastStartAt = Date.now()
}

function noteServerBusy(res: Response, body?: { retryAfterMs?: number; reason?: string }) {
  let waitMs = 5_000
  const retryAfter = res.headers.get('retry-after')
  if (retryAfter) {
    const sec = Number(retryAfter)
    if (Number.isFinite(sec) && sec > 0) waitMs = sec * 1000
  } else if (typeof body?.retryAfterMs === 'number' && body.retryAfterMs > 0) {
    waitMs = body.retryAfterMs
  } else if (body?.reason === 'shedding' || body?.reason === 'timeout') {
    waitMs = 15_000
  }
  pauseUntil = Math.max(pauseUntil, Date.now() + waitMs)
  return waitMs
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
          if (res.status === 429 || res.status === 503) {
            let body: { retryAfterMs?: number; reason?: string } | undefined
            try {
              body = (await res.clone().json()) as { retryAfterMs?: number; reason?: string }
            } catch {
              /* ignore */
            }
            const waitMs = noteServerBusy(res, body)
            await sleep(waitMs)
            continue
          }
          return res
        } catch (err) {
          if (attempt >= 4) throw err
          pauseUntil = Math.max(pauseUntil, Date.now() + 3_000)
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
