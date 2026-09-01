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
 * @param {Array<{ ruleName: string, ticker?: string|null, message: string }>} items
 * @param {string[]} recipients — opted-in user login emails
 */
export async function sendAlertEmailDigest(items, recipients) {
  if (!items.length || !alertEmailConfigured()) return false
  const transport = getTransporter()
  if (!transport) return false

  const bcc = [...new Set(recipients.map((r) => String(r).trim().toLowerCase()).filter(Boolean))]
  if (!bcc.length) return false

  const from =
    process.env.SMTP_FROM?.trim() ||
    process.env.SMTP_USER?.trim() ||
    'alerts@tradersscope.com'
  const site = process.env.PUBLIC_SITE_URL?.trim() || 'https://tradersscope.com'
  const count = items.length
  const subject = `TradersScope: ${count} alert${count === 1 ? '' : 's'}`

  const lines = items.map((item) => {
    const who = item.ticker ? `${item.ticker} — ` : ''
    return `• ${item.ruleName}: ${who}${item.message}`
  })

  const text = [
    `TradersScope — ${count} new alert${count === 1 ? '' : 's'}`,
    '',
    ...lines,
    '',
    `View on site: ${site}`,
    '',
    'You receive this because you opted in to pattern alert emails in TradersScope.',
  ].join('\n')

  const html = [
    `<p><strong>TradersScope</strong> — ${count} new alert${count === 1 ? '' : 's'}</p>`,
    '<ul>',
    ...items.map((item) => {
      const who = item.ticker ? `<strong>${item.ticker}</strong> — ` : ''
      return `<li>${item.ruleName}: ${who}${item.message}</li>`
    }),
    '</ul>',
    `<p><a href="${site}">Open TradersScope</a> · <a href="${site}/alerts">Alerts</a></p>`,
    '<p style="font-size:12px;color:#666">You opted in to pattern alert emails on your account.</p>',
  ].join('')

  const smtpUser = process.env.SMTP_USER.trim()

  try {
    await transport.sendMail({
      from,
      to: smtpUser,
      bcc,
      subject,
      text,
      html,
    })
    log('info', 'alert.email.sent', { recipients: bcc.length, count })
    return true
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log('error', 'alert.email.fail', { recipients: bcc.length, count, message })
    return false
  }
}
