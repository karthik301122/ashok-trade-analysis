/**
 * Publish branded daily-scan summaries to active billed organisations.
 */
import { listActiveBilledOrgs, listMembers } from './orgStore.mjs'
import { readPatternHitsDay } from './patternHitsStore.mjs'
import { readMarketSnapshotMeta, readMarketSnapshotLightMeta } from './snapshotJob.mjs'
import { upsertDailyScan } from './trainerPublishStore.mjs'
import { log } from './log.mjs'

let running = false
let started = false

function todayAsOf() {
  return new Date().toISOString().slice(0, 10)
}

function topPatternCounts(counts = {}) {
  return Object.entries(counts)
    .map(([id, n]) => ({ patternId: id, count: Number(n) || 0 }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)
}

async function buildDailyScanPayload() {
  const asOf = todayAsOf()
  let day = null
  try {
    day = await readPatternHitsDay('latest')
  } catch {
    day = null
  }
  if (!day) {
    try {
      day = await readPatternHitsDay(asOf)
    } catch {
      day = null
    }
  }

  let meta = null
  try {
    meta = (await readMarketSnapshotMeta()) || (await readMarketSnapshotLightMeta())
  } catch {
    meta = null
  }

  const topPatterns = topPatternCounts(day?.counts || {})
  const breadth =
    meta && typeof meta === 'object'
      ? {
          loaded: meta.loaded ?? meta.stockCount ?? null,
          failed: meta.failed ?? null,
          asOf: meta.asOf || meta.builtAt || null,
          source: meta.source || null,
        }
      : null

  const summaryParts = []
  if (topPatterns.length) {
    summaryParts.push(
      `Top patterns: ${topPatterns
        .slice(0, 5)
        .map((p) => `${p.patternId} (${p.count})`)
        .join(', ')}`,
    )
  }
  if (breadth?.loaded != null) {
    summaryParts.push(`Universe snapshot: ${breadth.loaded} names`)
  }

  return {
    asOf: day?.asOf || asOf,
    builtAt: Date.now(),
    topPatterns,
    breadth,
    summary: summaryParts.join('. ') || '',
    hitSample: Array.isArray(day?.hits) ? day.hits.slice(0, 40) : [],
  }
}

/**
 * @param {{ force?: boolean }} [opts]
 */
export async function runDailyScanJob(opts = {}) {
  if (running) return { ok: false, skipped: true, reason: 'already-running' }
  running = true
  try {
    const orgs = await listActiveBilledOrgs()
    const payload = await buildDailyScanPayload()
    const empty =
      !payload.summary &&
      !(Array.isArray(payload.topPatterns) && payload.topPatterns.length > 0) &&
      !payload.breadth

    const results = []
    for (const org of orgs) {
      const members = await listMembers(org.id)
      const publisher =
        members.find((m) => m.role === 'owner')?.username ||
        members.find((m) => m.role === 'admin')?.username ||
        members[0]?.username ||
        'system'
      try {
        const doc = await upsertDailyScan(org.id, publisher, {
          title: `Daily scan · ${payload.asOf}`,
          note: payload.summary || 'Market pattern summary for your cohort.',
          payload,
        })
        results.push({
          orgId: org.id,
          skippedEmptyOverwrite: Boolean(doc.skippedEmptyOverwrite),
          id: doc.id,
        })
      } catch (err) {
        results.push({
          orgId: org.id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    log('info', 'dailyScan.job.done', {
      orgs: orgs.length,
      empty,
      force: Boolean(opts.force),
    })
    return { ok: true, orgs: orgs.length, empty, results }
  } finally {
    running = false
  }
}

export function maybeStartDailyScanJob(opts = {}) {
  if (started && !opts.force) return
  started = true
  const delayMs = Number(opts.delayMs) || 0
  const run = () => {
    void runDailyScanJob(opts).catch((err) => {
      log('warn', 'dailyScan.job.fail', {
        message: err instanceof Error ? err.message : String(err),
      })
    })
  }
  if (delayMs > 0) setTimeout(run, delayMs)
  else run()

  // Re-run once per Sydney trading day morning-ish (every 24h after first).
  const intervalMs = Number(process.env.DAILY_SCAN_INTERVAL_MS) || 24 * 60 * 60 * 1000
  setInterval(() => {
    void runDailyScanJob({}).catch(() => {})
  }, intervalMs)
}
