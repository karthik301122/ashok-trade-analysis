/** @type {Promise<unknown> | null} */
let runningJob = null

/** Daily EODHD index membership refresh (~30 API calls when stale). */
export function maybeStartIndexMembersScheduler() {
  const refreshMs = Number(process.env.INDEX_MEMBERS_REFRESH_MS) || 24 * 60 * 60 * 1000
  const tick = () => {
    if (runningJob) return
    runningJob = import('./eodhdIndexMembers.mjs')
      .then((m) => m.refreshIndexMembersIfStale())
      .catch((err) => {
        console.warn(
          '[index-members] refresh error:',
          err instanceof Error ? err.message : err,
        )
      })
      .finally(() => {
        runningJob = null
      })
  }
  setInterval(tick, refreshMs)
  // Defer first run so snapshot build gets API quota first after deploy.
  setTimeout(tick, 10 * 60_000)
  console.log(
    `[index-members] daily refresh scheduled (every ${Math.round(refreshMs / 3600000)}h, ~30 API calls when stale)`,
  )
}
