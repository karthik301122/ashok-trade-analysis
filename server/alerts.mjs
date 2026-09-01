import { sqlAll, sqlOne, sqlRun } from './db.mjs'
import { readMarketSnapshotRow } from './snapshotJob.mjs'
import { matchAlertRule } from './alertMatch.mjs'
import { queryPatternScanState } from './patternScanStore.mjs'
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

export async function listAlertEvents(limit = 50) {
  const rows = await sqlAll(
    `SELECT e.*, r.name AS rule_name FROM alert_events e
     LEFT JOIN alert_rules r ON r.id = e.rule_id
     ORDER BY e.id DESC LIMIT ?`,
    [limit],
  )
  return rows.map((r) => ({
    id: r.id,
    ruleId: r.rule_id,
    ruleName: r.rule_name,
    ticker: r.ticker,
    message: r.message,
    createdAt: r.created_at,
    delivered: Boolean(r.delivered),
    payload: safeJson(r.payload_json),
  }))
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

  for (const rule of rules) {
    let matches = []
    if (rule.type === 'pattern_forming' || rule.type === 'pattern_confirmed') {
      matches = await matchPatternAlertRule(rule)
    } else {
      if (!stocks.length) continue
      matches = matchAlertRule(rule, stocks, snap)
    }
    for (const m of matches) {
      const eventId = await recordEvent(rule.id, m.ticker, m.message, m.payload)
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
          await sqlRun('UPDATE alert_events SET delivered = 1 WHERE id = ?', [eventId])
        }
      }
      fired.push({ ruleId: rule.id, ruleName: rule.name, ticker: m.ticker, message: m.message, delivered })
    }
  }
  log('info', 'alerts.evaluate', { rules: rules.length, fired: fired.length, stocks: stocks.length })
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
  const dayStart = Date.now() - 24 * 60 * 60 * 1000
  if (ticker) {
    const dup = await sqlOne(
      `SELECT id FROM alert_events WHERE rule_id = ? AND ticker = ? AND created_at > ? LIMIT 1`,
      [ruleId, ticker, dayStart],
    )
    if (dup) return Number(dup.id)
  }
  const info = await sqlRun(
    `INSERT INTO alert_events (rule_id, ticker, message, payload_json, created_at, delivered)
     VALUES (?, ?, ?, ?, ?, 0)
     RETURNING id`,
    [ruleId, ticker, message, JSON.stringify(payload || {}), Date.now()],
  )
  return Number(info.lastInsertRowid)
}

async function matchPatternAlertRule(rule) {
  const p = rule.params || {}
  const minScore = Number(p.minScore ?? 60)
  const patternId = p.patternId ? String(p.patternId) : null
  const confirmed = rule.type === 'pattern_confirmed'
  const rows = await queryPatternScanState({
    minScore: confirmed ? 100 : minScore,
    patternId,
    confirmed: confirmed ? true : false,
  })
  const out = []
  for (const r of rows) {
    if (confirmed && r.score < 100) continue
    if (!confirmed && r.confirmed) continue
    const label = patternId || r.patternId
    out.push({
      ticker: r.ticker,
      message: confirmed
        ? `${r.ticker} ${label} confirmed (100%)`
        : `${r.ticker} ${label} forming ${r.score}%`,
      payload: { patternId: r.patternId, score: r.score, confirmed: r.confirmed },
    })
  }
  return out.slice(0, 25)
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
