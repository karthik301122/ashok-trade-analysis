import { sqlOne, sqlRun } from './db.mjs'
import { normalizeUsername } from './userStore.mjs'

/**
 * @param {unknown} raw
 * @returns {{ starredNames: string[], customPatterns: unknown[], scanWindow: string, chartInterval: string } | null}
 */
function parsePrefsJson(raw) {
  if (!raw) return null
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!parsed || typeof parsed !== 'object') return null
    return {
      starredNames: Array.isArray(parsed.starredNames)
        ? parsed.starredNames.filter((n) => typeof n === 'string')
        : [],
      customPatterns: Array.isArray(parsed.customPatterns) ? parsed.customPatterns : [],
      scanWindow: typeof parsed.scanWindow === 'string' ? parsed.scanWindow : '1m',
      chartInterval: typeof parsed.chartInterval === 'string' ? parsed.chartInterval : 'auto',
    }
  } catch {
    return null
  }
}

/**
 * @param {string} username
 * @returns {Promise<object | null>}
 */
export async function getUserPatternPrefs(username) {
  const u = normalizeUsername(username)
  if (!u) return null
  const row = await sqlOne('SELECT prefs_json AS "prefsJson" FROM user_patterns WHERE username = ?', [
    u,
  ])
  return parsePrefsJson(row?.prefsJson)
}

/**
 * Upsert pattern prefs. Uses username as primary key id for simplicity.
 * @param {string} username
 * @param {{ starredNames?: unknown[], customPatterns?: unknown[], scanWindow?: string, chartInterval?: string }} prefs
 */
export async function saveUserPatternPrefs(username, prefs) {
  const u = normalizeUsername(username)
  if (!u) throw new Error('username required')
  const normalized = {
    starredNames: Array.isArray(prefs?.starredNames)
      ? prefs.starredNames.filter((n) => typeof n === 'string')
      : [],
    customPatterns: Array.isArray(prefs?.customPatterns) ? prefs.customPatterns : [],
    scanWindow: typeof prefs?.scanWindow === 'string' ? prefs.scanWindow : '1m',
    chartInterval: typeof prefs?.chartInterval === 'string' ? prefs.chartInterval : 'auto',
  }
  const now = Date.now()
  await sqlRun(
    `INSERT INTO user_patterns (id, username, prefs_json, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       prefs_json = excluded.prefs_json,
       updated_at = excluded.updated_at`,
    [u, u, JSON.stringify(normalized), now],
  )
  return normalized
}
