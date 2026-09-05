import nodemailer from 'nodemailer'
import { log } from './log.mjs'

/** Official outbound address for pattern alert mail. */
export const DEFAULT_ALERT_FROM = 'TradersScope Alerts <alerts@traderscope.com>'

let transporter = null

export function alertEmailConfigured() {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim(),
  )
}

/** From header — prefer SMTP_FROM, else always the official alerts@ mailbox (not SMTP_USER). */
export function alertEmailFromAddress() {
  return process.env.SMTP_FROM?.trim() || DEFAULT_ALERT_FROM
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
 * Generic outbound mail via configured SMTP.
 * @param {{ to: string, subject: string, text: string, html?: string }} opts
 */
export async function sendMail(opts) {
  if (!alertEmailConfigured()) return false
  const transport = getTransporter()
  if (!transport) return false
  const to = String(opts?.to || '')
    .trim()
    .toLowerCase()
  if (!to || !opts?.subject || !opts?.text) return false
  try {
    await transport.sendMail({
      from: alertEmailFromAddress(),
      replyTo: 'alerts@traderscope.com',
      to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html || undefined,
    })
    return true
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log('error', 'mail.send.fail', { to, message })
    return false
  }
}

/**
 * Send a registration / verification OTP.
 * @param {string} to
 * @param {string} otp
 * @param {string} [displayName]
 */
export async function sendOtpEmail(to, otp, displayName = '') {
  const name = String(displayName || '').trim()
  const greeting = name ? `Hi ${name},` : 'Hi,'
  const subject = 'TradersScope verification code'
  const text = [
    greeting,
    '',
    `Your TradersScope verification code is: ${otp}`,
    '',
    'This code expires in 15 minutes.',
    'If you did not request this, you can ignore this email.',
  ].join('\n')
  const html = [
    `<p>${greeting}</p>`,
    `<p>Your TradersScope verification code is:</p>`,
    `<p style="font-size:28px;font-weight:700;letter-spacing:4px">${otp}</p>`,
    `<p style="font-size:12px;color:#666">Expires in 15 minutes. If you did not request this, ignore this email.</p>`,
  ].join('')
  const ok = await sendMail({ to, subject, text, html })
  if (ok) log('info', 'auth.otp.sent', { to })
  return ok
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

  const from = alertEmailFromAddress()
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
      replyTo: 'alerts@traderscope.com',
      to,
      subject,
      text,
      html,
    })
    log('info', 'alert.email.sent', {
      recipient: to,
      from,
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
