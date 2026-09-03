import nodemailer from 'nodemailer'
import { log } from './log.mjs'

let transporter = null

export function alertEmailConfigured() {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim(),
  )
}

function getTransporter() {
  if (!alertEmailConfigured()) return null
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 587)
    const secure =
      process.env.SMTP_SECURE === '1' ||
      process.env.SMTP_SECURE === 'true' ||
      port === 465
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST.trim(),
      port,
      secure,
      auth: {
        user: process.env.SMTP_USER.trim(),
        pass: process.env.SMTP_PASS.trim(),
      },
    })
  }
  return transporter
}

/**
 * One email for a single alert hit (ticker + pattern / rule).
 * @param {{ ruleName: string, ticker?: string|null, message: string, score?: number|null }} item
 * @param {string} recipient — opted-in user login email
 */
export async function sendAlertEmail(item, recipient) {
  if (!item || !alertEmailConfigured()) return false
  const transport = getTransporter()
  if (!transport) return false

  const to = String(recipient || '')
    .trim()
    .toLowerCase()
  if (!to) return false

  const from =
    process.env.SMTP_FROM?.trim() ||
    process.env.SMTP_USER?.trim() ||
    'alerts@traderscope.com'
  const site = process.env.PUBLIC_SITE_URL?.trim() || 'https://traderscope.com'
  const ticker = item.ticker ? String(item.ticker).toUpperCase() : null
  const score = Number(item.score)
  const scoreLabel = Number.isFinite(score) ? ` (${Math.round(score)}%)` : ''
  const subject = ticker
    ? `TradersScope: ${ticker} — ${item.ruleName}${scoreLabel}`
    : `TradersScope: ${item.ruleName}`

  const text = [
    'TradersScope alert',
    '',
    item.message,
    '',
    `Rule: ${item.ruleName}`,
    ticker ? `Ticker: ${ticker}` : null,
    Number.isFinite(score) ? `Score: ${Math.round(score)}%` : null,
    '',
    `View on site: ${site}/alerts`,
    '',
    'You receive this because you opted in to pattern alert emails in TradersScope.',
  ]
    .filter((line) => line != null)
    .join('\n')

  const html = [
    '<p><strong>TradersScope alert</strong></p>',
    `<p>${item.message}</p>`,
    '<ul>',
    `<li>Rule: ${item.ruleName}</li>`,
    ticker ? `<li>Ticker: <strong>${ticker}</strong></li>` : null,
    Number.isFinite(score) ? `<li>Score: ${Math.round(score)}%</li>` : null,
    '</ul>',
    `<p><a href="${site}/alerts">Open Alerts</a></p>`,
    '<p style="font-size:12px;color:#666">You opted in to pattern alert emails on your account.</p>',
  ]
    .filter(Boolean)
    .join('')

  try {
    await transport.sendMail({
      from,
      to,
      subject,
      text,
      html,
    })
    log('info', 'alert.email.sent', {
      recipient: to,
      ticker,
      score: Number.isFinite(score) ? score : null,
    })
    return true
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log('error', 'alert.email.fail', { recipient: to, message })
    return false
  }
}

/**
 * @param {Array<{ ruleName: string, ticker?: string|null, message: string }>} items
 * @param {string[]} recipients — opted-in user login emails
 */
export async function sendAlertEmailDigest(items, recipients) {
  if (!items.length || !alertEmailConfigured()) return false
  let ok = false
  for (const recipient of recipients) {
    for (const item of items) {
      if (await sendAlertEmail(item, recipient)) ok = true
    }
  }
  return ok
}
