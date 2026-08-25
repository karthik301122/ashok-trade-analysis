/**
 * Structured JSON logs for the Node API (one line per event).
 * @param {'info'|'warn'|'error'|'debug'} level
 * @param {string} msg
 * @param {Record<string, unknown>} [fields]
 */
export function log(level, msg, fields = {}) {
  const line = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...fields,
  }
  const text = JSON.stringify(line)
  if (level === 'error') console.error(text)
  else if (level === 'warn') console.warn(text)
  else console.log(text)
}

/**
 * Fixed-window rate limiter (in-memory).
 * @param {string} key
 * @param {{ limit?: number, windowMs?: number }} [opts]
 * @returns {{ ok: boolean, remaining: number, retryAfterMs?: number }}
 */
const buckets = new Map()

export function checkRateLimit(key, opts = {}) {
  const limit = Number(opts.limit) || 180
  const windowMs = Number(opts.windowMs) || 60_000
  const now = Date.now()
  let b = buckets.get(key)
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + windowMs }
    buckets.set(key, b)
  }
  b.count += 1
  if (b.count > limit) {
    return { ok: false, remaining: 0, retryAfterMs: Math.max(0, b.resetAt - now) }
  }
  return { ok: true, remaining: Math.max(0, limit - b.count) }
}

/** Best-effort client key from Node IncomingMessage / Express req */
export function clientKey(req) {
  const xf = req.headers?.['x-forwarded-for']
  if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0].trim()
  return req.socket?.remoteAddress || req.ip || 'local'
}

/** Prune stale buckets occasionally to avoid unbounded growth */
export function pruneRateLimitBuckets(now = Date.now()) {
  for (const [k, b] of buckets) {
    if (now >= b.resetAt + 60_000) buckets.delete(k)
  }
}
