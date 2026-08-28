import { loadEnvFile } from './loadEnv.mjs'

loadEnvFile()

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

const minGapMs = () => {
  const n = Number(process.env.EODHD_MIN_GAP_MS)
  return Number.isFinite(n) && n > 0 ? n : 550
}

const rateLimitBackoffMs = () => {
  const n = Number(process.env.EODHD_429_BACKOFF_MS)
  return Number.isFinite(n) && n > 0 ? n : 60_000
}

/** Serialize EODHD HTTP calls so snapshot builds do not burst past provider limits. */
let chain = Promise.resolve()
let lastFinishedAt = 0

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withEodhdThrottle(fn) {
  const scheduled = chain.then(async () => {
    const wait = lastFinishedAt + minGapMs() - Date.now()
    if (wait > 0) await sleep(wait)
    try {
      return await fn()
    } finally {
      lastFinishedAt = Date.now()
    }
  })
  chain = scheduled.catch(() => {})
  return scheduled
}

export function parseRetryAfterMs(headers) {
  const raw = headers?.get?.('retry-after') ?? headers?.['retry-after']
  if (!raw) return rateLimitBackoffMs()
  const asNum = Number(raw)
  if (Number.isFinite(asNum) && asNum > 0) return asNum * 1000
  const asDate = Date.parse(String(raw))
  if (Number.isFinite(asDate)) return Math.max(1000, asDate - Date.now())
  return rateLimitBackoffMs()
}

export { rateLimitBackoffMs }
