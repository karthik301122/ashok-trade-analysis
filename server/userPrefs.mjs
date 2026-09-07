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
  for (const id of await listAllComboPatternIds()) out.add(id)
  return [...out].sort()
}

function normalizeCombos(combos) {
  if (!Array.isArray(combos)) return []
  const out = []
  const seen = new Set()
  for (const raw of combos) {
    const id = String(raw?.id || '').trim()
    if (!id || seen.has(id)) continue
    const op = raw.op === 'and' ? 'and' : 'or'
    let timeframe =
      raw.timeframe === 'daily' || raw.timeframe === 'weekly' || raw.timeframe === 'mixed'
        ? raw.timeframe
        : op === 'or'
          ? 'mixed'
          : 'daily'
    if (op === 'and' && timeframe === 'mixed') timeframe = 'daily'
    const patternIds = [
      ...new Set((raw.patternIds || []).map((x) => String(x).trim()).filter(Boolean)),
    ].sort()
    if (patternIds.length < 2) continue
    const name = String(raw.name || '').trim() || `Combo (${op.toUpperCase()})`
    const ms = Number(raw.minScore)
    out.push({
      id,
      name: name.slice(0, 80),
      op,
      timeframe,
      patternIds,
      enabled: raw.enabled !== false,
      minScore: Number.isFinite(ms) ? Math.max(60, Math.min(100, Math.round(ms))) : 60,
    })
    seen.add(id)
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export async function getPatternComboAlerts(username) {
  const row = await sqlOne('SELECT pattern_combo_alerts_json FROM user_prefs WHERE username = ?', [
    normalizeUsername(username),
  ])
  if (!row?.pattern_combo_alerts_json) return []
  try {
    const parsed = JSON.parse(row.pattern_combo_alerts_json)
    return normalizeCombos(Array.isArray(parsed) ? parsed : parsed?.combos)
  } catch {
    return []
  }
}

export async function setPatternComboAlerts(username, combos) {
  const u = normalizeUsername(username)
  const normalized = normalizeCombos(combos)
  const now = Date.now()
  await sqlRun(
    `INSERT INTO user_prefs (username, pattern_combo_alerts_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(username) DO UPDATE SET
       pattern_combo_alerts_json = excluded.pattern_combo_alerts_json,
       updated_at = excluded.updated_at`,
    [u, JSON.stringify(normalized), now],
  )
  const allIds = await listAllSubscribedPatternIds()
  const { syncPatternAlertRules, syncPatternComboRules } = await import('./alerts.mjs')
  await syncPatternAlertRules(allIds)
  await syncPatternComboRules()
  return normalized
}

export async function listAllComboPatternIds() {
  const rows = await sqlAll(
    'SELECT pattern_combo_alerts_json FROM user_prefs WHERE pattern_combo_alerts_json IS NOT NULL',
  )
  const out = new Set()
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.pattern_combo_alerts_json)
      const list = Array.isArray(parsed) ? parsed : parsed?.combos
      for (const c of normalizeCombos(list || [])) {
        if (!c.enabled) continue
        for (const id of c.patternIds) out.add(id)
      }
    } catch {
      /* ignore */
    }
  }
  return [...out].sort()
}

/** All enabled combos across users (for evaluate). */
export async function listAllPatternComboAlerts() {
  const rows = await sqlAll(
    `SELECT username, pattern_combo_alerts_json FROM user_prefs
     WHERE pattern_combo_alerts_json IS NOT NULL`,
  )
  const out = []
  for (const row of rows) {
    const username = normalizeUsername(row.username)
    try {
      const parsed = JSON.parse(row.pattern_combo_alerts_json)
      const list = Array.isArray(parsed) ? parsed : parsed?.combos
      for (const c of normalizeCombos(list || [])) {
        if (!c.enabled) continue
        out.push({ ...c, ownerUsername: username })
      }
    } catch {
      /* ignore */
    }
  }
  return out
}

/** Whether a user owns a combo that includes this pattern (for event filtering). */
export async function userOwnsComboWithPattern(username, patternId) {
  const combos = await getPatternComboAlerts(username)
  const pid = String(patternId)
  if (pid.startsWith('combo:')) {
    const comboId = pid.slice(6)
    return combos.some((c) => c.id === comboId)
  }
  return combos.some((c) => c.enabled && c.patternIds.includes(pid))
}

/** Whether a user should receive an alert for ticker + pattern. */
export async function userSubscribedToPatternAlert(username, ticker, patternId) {
  const prefs = await getPatternAlertPrefs(username)
  const pid = String(patternId)
  if (prefs.legacyPatternIds?.includes(pid)) return true
  const t = normalizeTicker(ticker)
  return prefs.watches.some((w) => w.ticker === t && w.patternIds.includes(pid))
}

export const DEFAULT_ALERT_EMAIL_MIN_SCORE = 80
export const UI_PATTERN_HIT_MIN_SCORE = 60

export function clampAlertEmailMinScore(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return DEFAULT_ALERT_EMAIL_MIN_SCORE
  return Math.max(60, Math.min(100, Math.round(v)))
}

export async function filterPatternAlertItemsForUser(username, items, minScore) {
  const prefs = await getPatternAlertPrefs(username)
  const combos = await getPatternComboAlerts(username)
  const comboIds = new Set(combos.filter((c) => c.enabled).map((c) => c.id))
  const legacy = new Set(prefs.legacyPatternIds || [])
  const watchMap = new Map(prefs.watches.map((w) => [w.ticker, new Set(w.patternIds)]))
  const threshold =
    minScore != null ? clampAlertEmailMinScore(minScore) : await getAlertEmailMinScore(username)
  return items.filter((item) => {
    if (!item.patternId) return true
    const pid = String(item.patternId)
    const score = Number(item.score)
    if (Number.isFinite(score) && score < threshold) return false
    if (pid.startsWith('combo:')) {
      return comboIds.has(pid.slice(6)) || item.ownerUsername === normalizeUsername(username)
    }
    if (legacy.has(pid)) return true
    const t = normalizeTicker(item.ticker)
    const patterns = watchMap.get(t)
    if (patterns?.has(pid)) return true
    return combos.some((c) => c.enabled && c.patternIds.includes(pid))
  })
}

export async function filterPatternAlertEventsForUser(username, events) {
  const prefs = await getPatternAlertPrefs(username)
  const combos = await getPatternComboAlerts(username)
  const comboIds = new Set(combos.filter((c) => c.enabled).map((c) => c.id))
  const legacy = new Set(prefs.legacyPatternIds || [])
  const watchMap = new Map(prefs.watches.map((w) => [w.ticker, new Set(w.patternIds)]))
  return events.filter((e) => {
    const pid = e.payload?.patternId
    if (!pid) return true
    const id = String(pid)
    if (id.startsWith('combo:')) {
      return comboIds.has(id.slice(6)) || e.payload?.ownerUsername === normalizeUsername(username)
    }
    if (legacy.has(id)) return true
    const t = normalizeTicker(e.ticker)
    const patterns = watchMap.get(t)
    if (patterns?.has(id)) return true
    return combos.some((c) => c.enabled && c.patternIds.includes(id))
  })
}

export async function getAlertEmailOptIn(username) {
  const row = await sqlOne('SELECT alert_email_opt_in FROM user_prefs WHERE username = ?', [
    normalizeUsername(username),
  ])
  return Boolean(row?.alert_email_opt_in)
}

export async function getAlertEmailMinScore(username) {
  const row = await sqlOne('SELECT alert_email_min_score FROM user_prefs WHERE username = ?', [
    normalizeUsername(username),
  ])
  if (row?.alert_email_min_score == null) return DEFAULT_ALERT_EMAIL_MIN_SCORE
  return clampAlertEmailMinScore(row.alert_email_min_score)
}

export async function setAlertEmailMinScore(username, minScore) {
  const u = normalizeUsername(username)
  const score = clampAlertEmailMinScore(minScore)
  const now = Date.now()
  await sqlRun(
    `INSERT INTO user_prefs (username, alert_email_min_score, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(username) DO UPDATE SET
       alert_email_min_score = excluded.alert_email_min_score,
       updated_at = excluded.updated_at`,
    [u, score, now],
  )
  return score
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

/** Opt-in users with their email min-score threshold. */
export async function listAlertEmailOptInUserPrefs() {
  const rows = await sqlAll(
    `SELECT username, alert_email_min_score FROM user_prefs
     WHERE alert_email_opt_in = 1 ORDER BY username`,
  )
  const out = []
  for (const row of rows) {
    const u = normalizeUsername(row.username)
    if (!isEmailLogin(u)) continue
    out.push({
      username: u,
      minScore: clampAlertEmailMinScore(row.alert_email_min_score ?? DEFAULT_ALERT_EMAIL_MIN_SCORE),
    })
  }
  return out
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
