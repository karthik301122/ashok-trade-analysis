import { sqlAll, sqlOne, sqlRun } from './db.mjs'
import { normalizeUsername } from './userStore.mjs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isEmailLogin(username) {
  const u = normalizeUsername(username)
  return EMAIL_RE.test(u) && u.length >= 5 && u.length <= 64
}

function normalizeTicker(ticker) {
  return String(ticker).trim().toUpperCase()
}

function normalizePatternIds(ids) {
  return [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))].sort()
}

function normalizeWatches(watches) {
  const byTicker = new Map()
  for (const w of watches || []) {
    const ticker = normalizeTicker(w.ticker)
    if (!ticker) continue
    const set = byTicker.get(ticker) ?? new Set()
    for (const id of w.patternIds || []) {
      const pid = String(id).trim()
      if (pid) set.add(pid)
    }
    if (set.size) byTicker.set(ticker, set)
  }
  return [...byTicker.entries()]
    .map(([ticker, ids]) => ({ ticker, patternIds: [...ids].sort() }))
    .sort((a, b) => a.ticker.localeCompare(b.ticker))
}

/** @returns {{ watches: object[], legacyPatternIds?: string[] }} */
function parsePatternAlertPrefsJson(raw) {
  if (!raw) return { watches: [] }
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return {
        watches: [],
        legacyPatternIds: normalizePatternIds(parsed),
      }
    }
    if (parsed?.v === 2 && Array.isArray(parsed.watches)) {
      return { watches: normalizeWatches(parsed.watches) }
    }
    return { watches: [] }
  } catch {
    return { watches: [] }
  }
}

export async function getPatternAlertWatches(username) {
  const row = await sqlOne('SELECT pattern_alert_ids_json FROM user_prefs WHERE username = ?', [
    normalizeUsername(username),
  ])
  return parsePatternAlertPrefsJson(row?.pattern_alert_ids_json).watches
}

export async function getPatternAlertPrefs(username) {
  const row = await sqlOne('SELECT pattern_alert_ids_json FROM user_prefs WHERE username = ?', [
    normalizeUsername(username),
  ])
  return parsePatternAlertPrefsJson(row?.pattern_alert_ids_json)
}

export async function getPatternAlertIds(username) {
  const prefs = await getPatternAlertPrefs(username)
  const out = new Set(prefs.legacyPatternIds || [])
  for (const w of prefs.watches) {
    for (const id of w.patternIds) out.add(id)
  }
  return [...out].sort()
}

export async function setPatternAlertWatches(username, watches) {
  const u = normalizeUsername(username)
  const normalized = normalizeWatches(watches)
  const now = Date.now()
  await sqlRun(
    `INSERT INTO user_prefs (username, pattern_alert_ids_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(username) DO UPDATE SET
       pattern_alert_ids_json = excluded.pattern_alert_ids_json,
       updated_at = excluded.updated_at`,
    [u, JSON.stringify({ v: 2, watches: normalized }), now],
  )
  const allIds = await listAllSubscribedPatternIds()
  const { syncPatternAlertRules } = await import('./alerts.mjs')
  await syncPatternAlertRules(allIds)
  return normalized
}

/** Legacy global pattern list (any ticker). Prefer setPatternAlertWatches. */
export async function setPatternAlertIds(username, patternIds) {
  const u = normalizeUsername(username)
  const ids = normalizePatternIds(patternIds)
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
    const prefs = parsePatternAlertPrefsJson(row.pattern_alert_ids_json)
    for (const id of prefs.legacyPatternIds || []) out.add(id)
    for (const w of prefs.watches) {
      for (const id of w.patternIds) out.add(id)
    }
  }
  return [...out].sort()
}

/** Whether a user should receive an alert for ticker + pattern. */
export async function userSubscribedToPatternAlert(username, ticker, patternId) {
  const prefs = await getPatternAlertPrefs(username)
  const pid = String(patternId)
  if (prefs.legacyPatternIds?.includes(pid)) return true
  const t = normalizeTicker(ticker)
  return prefs.watches.some((w) => w.ticker === t && w.patternIds.includes(pid))
}

export async function filterPatternAlertItemsForUser(username, items) {
  const prefs = await getPatternAlertPrefs(username)
  const legacy = new Set(prefs.legacyPatternIds || [])
  const watchMap = new Map(prefs.watches.map((w) => [w.ticker, new Set(w.patternIds)]))
  return items.filter((item) => {
    if (!item.patternId) return true
    const pid = String(item.patternId)
    if (legacy.has(pid)) return true
    const t = normalizeTicker(item.ticker)
    const patterns = watchMap.get(t)
    return patterns?.has(pid) ?? false
  })
}

export async function filterPatternAlertEventsForUser(username, events) {
  const prefs = await getPatternAlertPrefs(username)
  const legacy = new Set(prefs.legacyPatternIds || [])
  const watchMap = new Map(prefs.watches.map((w) => [w.ticker, new Set(w.patternIds)]))
  return events.filter((e) => {
    const pid = e.payload?.patternId
    if (!pid) return true
    const id = String(pid)
    if (legacy.has(id)) return true
    const t = normalizeTicker(e.ticker)
    const patterns = watchMap.get(t)
    return patterns?.has(id) ?? false
  })
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
