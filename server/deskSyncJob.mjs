/**
 * After ASX close: force-pull desk universes (ASX200 + mid + small) from EODHD.
 * Runs in-process so production stays fresh without relying on manual Refresh.
 */
import { isAsxMarketSession } from './liveQuotes.mjs'
import { eodhdEnabled } from './eodhd.mjs'
import { isEodhdDailyLimitExceeded } from './eodhdLimit.mjs'
import { maintenanceEnabled } from './maintenance.mjs'
import { runAsx200ForceRefresh, getSnapshotJobStatus } from './snapshotJob.mjs'

/** @type {ReturnType<typeof setInterval> | null} */
let timer = null
/** Sydney calendar day string of last successful/attempted sync, e.g. 2026-09-04 */
let lastSyncDay = ''

function sydneyParts(now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(new Date(now))
  const get = (type) => parts.find((p) => p.type === type)?.value ?? ''
  const year = get('year')
  const month = get('month')
  const day = get('day')
  return {
    weekday: get('weekday'),
    hour: Number(get('hour') || 0),
    minute: Number(get('minute') || 0),
    dayKey: `${year}-${month}-${day}`,
  }
}

/** Weekday after the cash close — default window 17:30–19:00 Sydney. */
export function shouldRunDeskEodSync(now = Date.now()) {
  const p = sydneyParts(now)
  if (p.weekday === 'Sat' || p.weekday === 'Sun') return false
  if (isAsxMarketSession(now)) return false
  const mins = p.hour * 60 + p.minute
  const start = 17 * 60 + 30
  const end = 19 * 60
  return mins >= start && mins <= end
}

export async function maybeRunDeskEodSync(now = Date.now()) {
  if (!eodhdEnabled()) return { skipped: true, reason: 'eodhd_disabled' }
  if (maintenanceEnabled()) return { skipped: true, reason: 'maintenance' }
  if (isEodhdDailyLimitExceeded()) return { skipped: true, reason: 'eodhd_daily_limit' }
  if (!shouldRunDeskEodSync(now)) return { skipped: true, reason: 'outside_window' }

  const { dayKey } = sydneyParts(now)
  if (lastSyncDay === dayKey) return { skipped: true, reason: 'already_ran_today' }

  const job = await getSnapshotJobStatus()
  if (job.status === 'running') return { skipped: true, reason: 'snapshot_running' }

  lastSyncDay = dayKey
  console.log(`[desk-sync] starting after-close force refresh (${dayKey} Sydney)`)
  try {
    const result = await runAsx200ForceRefresh()
    console.log('[desk-sync] done', {
      loaded: result?.loaded,
      failed: result?.failed,
      priority: result?.priority,
    })
    return { ok: true, dayKey, result }
  } catch (err) {
    // Allow retry later in the same window if the job failed hard.
    lastSyncDay = ''
    console.warn(
      '[desk-sync] failed:',
      err instanceof Error ? err.message : String(err),
    )
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function maybeStartDeskSyncScheduler() {
  if (!eodhdEnabled()) return
  if (timer) return
  const tick = () => {
    void maybeRunDeskEodSync().catch((err) => {
      console.warn('[desk-sync] tick error:', err instanceof Error ? err.message : err)
    })
  }
  // Every 10 minutes is enough for a 90-minute post-close window.
  timer = setInterval(tick, 10 * 60 * 1000)
  setTimeout(tick, 60_000)
  console.log('[desk-sync] scheduler armed (Sydney weekdays 17:30–19:00)')
}
