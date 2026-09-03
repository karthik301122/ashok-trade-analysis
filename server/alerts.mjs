import { sqlAll, sqlOne, sqlRun } from './db.mjs'
import { readMarketSnapshotRow } from './snapshotJob.mjs'
import { matchAlertRule } from './alertMatch.mjs'
import { queryPatternScanState } from './patternScanStore.mjs'
import { alertEmailConfigured, sendAlertEmail } from './alertEmail.mjs'
import {
  listAlertEmailOptInUserPrefs,
  listAlertEmailOptInUsers,
  filterPatternAlertEventsForUser,
  filterPatternAlertItemsForUser,
} from './userPrefs.mjs'
import { log } from './log.mjs'

/**
 * @typedef {{ id?: number, name: string, type: string, params: object, webhookUrl?: string|null, enabled?: boolean }} AlertRule
 */

export { matchAlertRule } from './alertMatch.mjs'

export async function listAlertRules() {
  const rows = await sqlAll('SELECT * FROM alert_rules ORDER BY id DESC')
  return rows.map(rowToRule)
}

export async function createAlertRule(input) {
  const now = Date.now()
  const info = await sqlRun(
    `INSERT INTO alert_rules (name, type, params_json, webhook_url, enabled, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      String(input.name || 'Alert'),
      String(input.type || 'rs_min'),
      JSON.stringify(input.params || {}),
      input.webhookUrl || null,
      input.enabled === false ? 0 : 1,
      now,
    ],
  )
  const id = Number(info.lastInsertRowid)
  return getAlertRule(id)
}

export async function getAlertRule(id) {
  const row = await sqlOne('SELECT * FROM alert_rules WHERE id = ?', [id])
  return row ? rowToRule(row) : null
}

export async function deleteAlertRule(id) {
  await sqlRun('DELETE FROM alert_rules WHERE id = ?', [id])
  return true
}

/** Remove auto-managed pattern rules and recreate for subscribed pattern ids. */
export async function syncPatternAlertRules(patternIds) {
  const ids = [...new Set(patternIds.map((id) => String(id).trim()).filter(Boolean))].sort()

  await sqlRun(
    `DELETE FROM alert_rules
     WHERE type IN ('pattern_forming', 'pattern_confirmed')
       AND params_json LIKE '%"auto":true%'`,
  )

  for (const patternId of ids) {
    const label = patternAlertLabel(patternId)
    await createAlertRule({
      name: `${label} forming`,
      type: 'pattern_forming',
      params: { minScore: 60, patternId, patternLabel: label, auto: true },
      enabled: true,
    })
    await createAlertRule({
      name: `${label} confirmed`,
      type: 'pattern_confirmed',
      params: { patternId, patternLabel: label, auto: true },
      enabled: true,
    })
  }

  return ids.length
}

export async function listAlertEvents(limit = 50, username = null) {
  const rows = await sqlAll(
    `SELECT e.*, r.name AS rule_name FROM alert_events e
     LEFT JOIN alert_rules r ON r.id = e.rule_id
     ORDER BY e.id DESC LIMIT ?`,
    [limit],
  )
  let events = rows.map((r) => ({
    id: r.id,
    ruleId: r.rule_id,
    ruleName: r.rule_name,
    ticker: r.ticker,
    message: r.message,
    createdAt: r.created_at,
    delivered: Boolean(r.delivered),
    payload: safeJson(r.payload_json),
  }))

  if (username) {
    events = await filterPatternAlertEventsForUser(username, events)
  }

  return events
}

function rowToRule(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    params: safeJson(row.params_json) || {},
    webhookUrl: row.webhook_url,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
  }
}

function safeJson(s) {
  try {
    return s ? JSON.parse(s) : null
  } catch {
    return null
  }
}

/**
 * Evaluate enabled rules against the latest market snapshot.
 */
export async function evaluateAlerts() {
  const snap = await readMarketSnapshotRow()
  const stocks = snap?.stocks
    ? Object.entries(snap.stocks).map(([ticker, p]) => ({ ticker, ...p }))
    : []
  const rules = (await listAlertRules()).filter((r) => r.enabled)
  const fired = []
  const emailQueue = []

  for (const rule of rules) {
    let matches = []
    if (rule.type === 'pattern_forming' || rule.type === 'pattern_confirmed') {
      matches = await matchPatternAlertRule(rule)
    } else {
      if (!stocks.length) continue
      matches = matchAlertRule(rule, stocks, snap)
    }
    for (const m of matches) {
      const recorded = await recordEvent(rule.id, m.ticker, m.message, m.payload)
      let delivered = false
      if (rule.webhookUrl) {
        delivered = await postWebhook(rule.webhookUrl, {
          rule: rule.name,
          type: rule.type,
          ticker: m.ticker,
          message: m.message,
          at: new Date().toISOString(),
          ...m.payload,
        })
        if (delivered) {
          await sqlRun('UPDATE alert_events SET delivered = 1 WHERE id = ?', [recorded.id])
        }
      }
      if (recorded.isNew) {
        emailQueue.push({
          eventId: recorded.id,
          ruleName: rule.name,
          ticker: m.ticker,
          message: m.message,
          patternId: m.payload?.patternId ? String(m.payload.patternId) : null,
          score: Number.isFinite(Number(m.payload?.score)) ? Number(m.payload.score) : null,
          delivered,
        })
      }
      fired.push({
        ruleId: rule.id,
        ruleName: rule.name,
        ticker: m.ticker,
        message: m.message,
        delivered,
      })
    }
  }

  if (emailQueue.length && alertEmailConfigured()) {
    const optInUsers = await listAlertEmailOptInUserPrefs()
    let sentCount = 0
    for (const { username, minScore } of optInUsers) {
      const items = await filterPatternAlertItemsForUser(username, emailQueue, minScore)
      for (const item of items) {
        const emailOk = await sendAlertEmail(item, username)
        if (!emailOk) continue
        sentCount++
        if (!item.delivered) {
          await sqlRun('UPDATE alert_events SET delivered = 1 WHERE id = ?', [item.eventId])
        }
        const row = fired.find(
          (f) =>
            f.ruleName === item.ruleName &&
            f.ticker === item.ticker &&
            f.message === item.message,
        )
        if (row) row.delivered = true
      }
    }
    log('info', 'alerts.email', { optInUsers: optInUsers.length, sentCount })
  }

  log('info', 'alerts.evaluate', {
    rules: rules.length,
    fired: fired.length,
    stocks: stocks.length,
    emailConfigured: alertEmailConfigured(),
    emailQueued: emailQueue.length,
    emailRecipients: alertEmailConfigured() ? (await listAlertEmailOptInUsers()).length : 0,
  })
  if (
    !stocks.length &&
    fired.length === 0 &&
    rules.some((r) => r.type !== 'pattern_forming' && r.type !== 'pattern_confirmed')
  ) {
    return { fired, error: 'No market snapshot — run npm run snapshot', evaluatedAt: Date.now(), stockCount: 0 }
  }
  return { fired, evaluatedAt: Date.now(), stockCount: stocks.length }
}

async function recordEvent(ruleId, ticker, message, payload) {
  const patternId = payload?.patternId ? String(payload.patternId) : null
  const score = Number(payload?.score)
  // Pattern hits: allow one email per (rule, ticker, score) so N stocks/patterns
  // each get their own mail. Suppress only an identical score within 6h to avoid scan spam.
  // Non-pattern rules keep a 24h ticker dedupe.
  if (ticker && patternId && Number.isFinite(score)) {
    const windowStart = Date.now() - 6 * 60 * 60 * 1000
    const recent = await sqlAll(
      `SELECT id, payload_json FROM alert_events
       WHERE rule_id = ? AND ticker = ? AND created_at > ?
       ORDER BY id DESC LIMIT 20`,
      [ruleId, ticker, windowStart],
    )
    const rounded = Math.round(score)
    for (const row of recent) {
      const p = safeJson(row.payload_json) || {}
      if (String(p.patternId || '') === patternId && Math.round(Number(p.score)) === rounded) {
        return { id: Number(row.id), isNew: false }
      }
    }
  } else if (ticker) {
    const dayStart = Date.now() - 24 * 60 * 60 * 1000
    const dup = await sqlOne(
      `SELECT id FROM alert_events WHERE rule_id = ? AND ticker = ? AND created_at > ? LIMIT 1`,
      [ruleId, ticker, dayStart],
    )
    if (dup) return { id: Number(dup.id), isNew: false }
  }
  const info = await sqlRun(
    `INSERT INTO alert_events (rule_id, ticker, message, payload_json, created_at, delivered)
     VALUES (?, ?, ?, ?, ?, 0)
     RETURNING id`,
    [ruleId, ticker, message, JSON.stringify(payload || {}), Date.now()],
  )
  return { id: Number(info.lastInsertRowid), isNew: true }
}

async function matchPatternAlertRule(rule) {
  const p = rule.params || {}
  const minScore = Number(p.minScore ?? 60)
  const patternId = p.patternId ? String(p.patternId) : null
  const label = p.patternLabel ? String(p.patternLabel) : patternAlertLabel(patternId)
  const confirmed = rule.type === 'pattern_confirmed'
  const confirmedMin = 85
  const rows = await queryPatternScanState({
    minScore: confirmed ? confirmedMin : minScore,
    patternId,
    confirmed: confirmed ? true : false,
  })
  const out = []
  for (const r of rows) {
    if (confirmed && r.score < confirmedMin) continue
    if (!confirmed && r.confirmed) continue
    const rowLabel = patternId && r.patternId === patternId ? label : patternAlertLabel(r.patternId)
    out.push({
      ticker: r.ticker,
      message: confirmed
        ? `${r.ticker} ${rowLabel} confirmed (${r.score}%)`
        : `${r.ticker} ${rowLabel} forming ${r.score}%`,
      payload: { patternId: r.patternId, score: r.score, confirmed: r.confirmed },
    })
  }
  return out.slice(0, 200)
}

function patternAlertLabel(patternId) {
  if (!patternId) return 'pattern'
  if (patternId.startsWith('chart:')) {
    try {
      return decodeURIComponent(patternId.slice(6))
    } catch {
      return patternId.slice(6)
    }
  }
  if (patternId.startsWith('custom:')) return 'My pattern'
  return patternId
}

async function postWebhook(url, body) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return res.ok
  } catch {
    return false
  }
}
