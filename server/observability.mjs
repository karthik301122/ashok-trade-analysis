/**
 * Optional Sentry + snapshot failure alerting.
 * Soft-fail: boots without @sentry/node when SENTRY_DSN is unset or package missing.
 *
 * Install (optional): `npm i @sentry/node`
 * Env: SENTRY_DSN, SNAPSHOT_FAIL_ALERT_RATIO (default 0.15)
 */
import { log } from './log.mjs'

let sentry = null
let sentryInitAttempted = false

/**
 * @returns {Promise<void>}
 */
export async function initSentry() {
  if (sentryInitAttempted) return
  sentryInitAttempted = true
  const dsn = process.env.SENTRY_DSN?.trim()
  if (!dsn) return
  try {
    const mod = await import('@sentry/node')
    const Sentry = mod.default || mod
    Sentry.init({ dsn })
    sentry = Sentry
    log('info', 'sentry.init_ok', {})
  } catch (err) {
    log('warn', 'sentry.init_skipped', {
      message: err instanceof Error ? err.message : String(err),
      hint: 'npm i @sentry/node or unset SENTRY_DSN',
    })
    sentry = null
  }
}

/**
 * @param {unknown} err
 */
export function captureException(err) {
  try {
    if (sentry?.captureException) {
      sentry.captureException(err)
      return
    }
  } catch {
    /* ignore */
  }
  log('error', 'unhandled.exception', {
    message: err instanceof Error ? err.message : String(err),
  })
}

/**
 * Warn when snapshot failure ratio exceeds threshold.
 * @param {number} failed
 * @param {number} total
 */
export function maybeAlertSnapshotFailures(failed, total) {
  const f = Number(failed) || 0
  const t = Number(total) || 0
  if (t <= 0) return
  const ratioEnv = Number(process.env.SNAPSHOT_FAIL_ALERT_RATIO)
  const threshold = Number.isFinite(ratioEnv) && ratioEnv >= 0 ? ratioEnv : 0.15
  const ratio = f / t
  if (ratio > threshold) {
    log('warn', 'snapshot.fail_ratio_high', {
      failed: f,
      total: t,
      ratio: Math.round(ratio * 1000) / 1000,
      threshold,
    })
  }
}
