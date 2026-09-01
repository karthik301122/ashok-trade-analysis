import { sqlAll, sqlOne, sqlRun } from './db.mjs'
import { normalizeUsername } from './userStore.mjs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isEmailLogin(username) {
  const u = normalizeUsername(username)
  return EMAIL_RE.test(u) && u.length >= 5 && u.length <= 64
}

function parsePatternIdsJson(raw) {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return [...new Set(parsed.map((id) => String(id).trim()).filter(Boolean))]
  } catch {
    return []
  }
}

export async function getAlertEmailOptIn(username) {
  const row = await sqlOne('SELECT alert_email_opt_in FROM user_prefs WHERE username = ?', [
    normalizeUsername(username),
  ])
  return Boolean(row?.alert_email_opt_in)
}

export async function setAlertEmailOptIn(username, optIn) {
  const u = normalizeUsername(username)
  const now = Date.now()
  await sqlRun(
    `INSERT INTO user_prefs (username, alert_email_opt_in, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(username) DO UPDATE SET
       alert_email_opt_in = excluded.alert_email_opt_in,
       updated_at = excluded.updated_at`,
    [u, optIn ? 1 : 0, now],
  )
  return optIn
}

export async function getPatternAlertIds(username) {
  const row = await sqlOne('SELECT pattern_alert_ids_json FROM user_prefs WHERE username = ?', [
    normalizeUsername(username),
  ])
  return parsePatternIdsJson(row?.pattern_alert_ids_json)
}

export async function setPatternAlertIds(username, patternIds) {
  const u = normalizeUsername(username)
  const ids = [...new Set(patternIds.map((id) => String(id).trim()).filter(Boolean))].sort()
  const now = Date.now()
  await sqlRun(
    `INSERT INTO user_prefs (username, pattern_alert_ids_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(username) DO UPDATE SET
       pattern_alert_ids_json = excluded.pattern_alert_ids_json,
       updated_at = excluded.updated_at`,
    [u, JSON.stringify(ids), now],
  )
  const allIds = await listAllSubscribedPatternIds()
  const { syncPatternAlertRules } = await import('./alerts.mjs')
  await syncPatternAlertRules(allIds)
  return ids
}

/** Union of pattern ids subscribed by any user. */
export async function listAllSubscribedPatternIds() {
  const rows = await sqlAll('SELECT pattern_alert_ids_json FROM user_prefs WHERE pattern_alert_ids_json IS NOT NULL')
  const out = new Set()
  for (const row of rows) {
    for (const id of parsePatternIdsJson(row.pattern_alert_ids_json)) out.add(id)
  }
  return [...out].sort()
}

/** Logins with opt-in whose username is a deliverable email address. */
export async function listAlertEmailOptInUsers() {
  const rows = await sqlAll(
    'SELECT username FROM user_prefs WHERE alert_email_opt_in = 1 ORDER BY username',
  )
  const out = []
  for (const row of rows) {
    const u = normalizeUsername(row.username)
    if (isEmailLogin(u)) out.push(u)
  }
  return out
}

export async function listAlertEmailRecipients() {
  return await listAlertEmailOptInUsers()
}

export async function countAlertEmailRecipients() {
  return (await listAlertEmailOptInUsers()).length
}
