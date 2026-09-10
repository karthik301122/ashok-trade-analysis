/**
 * Optional daily market note email to opted-in users.
 */
import { listMarketNoteOptInUsers } from './userPrefs.mjs'
import { sendMail, alertEmailConfigured } from './alertEmail.mjs'
import { readPatternHitsDay } from './patternHitsStore.mjs'
import { log } from './log.mjs'

let running = false
let started = false
let lastSentDay = ''

function todayAsOf() {
  return new Date().toISOString().slice(0, 10)
}

async function buildNoteText() {
  let day = null
  try {
    day = await readPatternHitsDay('latest')
  } catch {
    day = null
  }
  const asOf = day?.asOf || todayAsOf()
  const counts = day?.counts && typeof day.counts === 'object' ? day.counts : {}
  const top = Object.entries(counts)
    .map(([id, n]) => ({ id, n: Number(n) || 0 }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 8)

  const lines = [
    `Traders Scope market note · ${asOf}`,
    '',
    top.length
      ? `Pattern highlights: ${top.map((t) => `${t.id} (${t.n})`).join(', ')}`
      : 'Pattern highlights will appear once today’s desk scan finishes.',
    '',
    'Open the desk: https://tradersscope.com/',
    '',
    'You received this because market notes are enabled in your profile. Unsubscribe anytime there.',
  ]
  return { asOf, text: lines.join('\n'), subject: `Market note · ${asOf}` }
}

/**
 * @param {{ force?: boolean }} [opts]
 */
export async function runMarketNoteJob(opts = {}) {
  if (running) return { ok: false, skipped: true, reason: 'already-running' }
  const day = todayAsOf()
  if (!opts.force && lastSentDay === day) {
    return { ok: true, skipped: true, reason: 'already-sent-today' }
  }
  if (!alertEmailConfigured()) {
    return { ok: false, skipped: true, reason: 'smtp-not-configured' }
  }
  running = true
  try {
    const users = await listMarketNoteOptInUsers()
    const note = await buildNoteText()
    let sent = 0
    for (const to of users) {
      const ok = await sendMail({
        to,
        subject: note.subject,
        text: note.text,
      })
      if (ok) sent += 1
    }
    lastSentDay = day
    log('info', 'marketNote.job.done', { recipients: users.length, sent, asOf: note.asOf })
    return { ok: true, recipients: users.length, sent, asOf: note.asOf }
  } finally {
    running = false
  }
}

export function maybeStartMarketNoteJob(opts = {}) {
  if (started && !opts.force) return
  started = true
  const delayMs = Number(opts.delayMs) || 0
  const run = () => {
    void runMarketNoteJob(opts).catch((err) => {
      log('warn', 'marketNote.job.fail', {
        message: err instanceof Error ? err.message : String(err),
      })
    })
  }
  if (delayMs > 0) setTimeout(run, delayMs)
  else run()

  const intervalMs = Number(process.env.MARKET_NOTE_INTERVAL_MS) || 24 * 60 * 60 * 1000
  setInterval(() => {
    void runMarketNoteJob({}).catch(() => {})
  }, intervalMs)
}
