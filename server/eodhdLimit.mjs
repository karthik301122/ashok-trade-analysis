/** Tracks EODHD daily quota exhaustion (HTTP 402). Resets automatically after UTC midnight. */

let dailyLimitHit = false
/** @type {number} */
let dailyLimitAt = 0

export class EodhdDailyLimitError extends Error {
  constructor() {
    super('EODHD daily API limit exceeded')
    this.name = 'EodhdDailyLimitError'
  }
}

export function isEodhdDailyLimitExceeded() {
  if (!dailyLimitHit) return false
  const utcDay = Math.floor(Date.now() / 86400000)
  const limitDay = Math.floor(dailyLimitAt / 86400000)
  if (utcDay > limitDay) {
    dailyLimitHit = false
    dailyLimitAt = 0
    return false
  }
  return true
}

export function markEodhdDailyLimitExceeded() {
  if (!dailyLimitHit) {
    dailyLimitHit = true
    dailyLimitAt = Date.now()
    console.warn(
      '[eodhd] daily API limit exceeded — pausing outbound EODHD requests until UTC midnight',
    )
  }
}

export function eodhdDailyLimitMeta() {
  if (!isEodhdDailyLimitExceeded()) return null
  return {
    exceeded: true,
    since: dailyLimitAt,
    resumesAfterUtcMidnight: true,
  }
}

/** @param {number} status */
export function maybeMarkEodhdDailyLimit(status) {
  if (status === 402) markEodhdDailyLimitExceeded()
  return status === 402
}

export function clearEodhdDailyLimitForTests() {
  dailyLimitHit = false
  dailyLimitAt = 0
}

/** Clear pause after a successful EODHD response (e.g. extra calls purchased). */
export function clearEodhdDailyLimitOnSuccess() {
  if (!dailyLimitHit) return
  dailyLimitHit = false
  dailyLimitAt = 0
  console.log('[eodhd] API calls resumed after successful response')
}
