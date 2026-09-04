import { ingestMarketDirectorAnnouncements } from './asxFilings.mjs'

/** @type {ReturnType<typeof setInterval> | null} */
let timer = null
let running = null

function intervalMs() {
  const n = Number(process.env.ASX_FILINGS_POLL_MS)
  if (Number.isFinite(n) && n >= 60_000) return n
  return 15 * 60 * 1000
}

export async function runAsxFilingsIngest() {
  if (running) return running
  running = ingestMarketDirectorAnnouncements({ parsePdf: true })
    .then((r) => {
      console.log(
        `[asx-filings] market ingest scanned=${r.scanned} director=${r.director} upserted=${r.upserted}`,
      )
      return r
    })
    .catch((err) => {
      console.warn('[asx-filings] ingest failed:', err instanceof Error ? err.message : err)
      return null
    })
    .finally(() => {
      running = null
    })
  return running
}

export function maybeStartAsxFilingsScheduler() {
  if (process.env.ASX_FILINGS_DISABLED === 'true') {
    console.log('[asx-filings] scheduler disabled')
    return
  }
  if (timer) return
  const ms = intervalMs()
  console.log(`[asx-filings] scheduler every ${Math.round(ms / 60000)}m (ASX Markit, $0)`)
  const tick = () => {
    void runAsxFilingsIngest()
  }
  setTimeout(tick, 12_000)
  timer = setInterval(tick, ms)
}
