import { sqlAll, sqlOne, sqlRun } from './db.mjs'
import {
  directorFromHeadline,
  filingKindFromHeadline,
  isDirectorInterestAnnouncement,
  parseDirectorInterestPdf,
} from './asxFilingsParse.mjs'

const MARKIT = 'https://asx.api.markitdigital.com/asx-research/1.0'
const UA = 'Mozilla/5.0 (compatible; TradersScope/1.0; +https://traderscope.com)'
const FRESH_TICKER_MS = 6 * 60 * 60 * 1000
const FRESH_MARKET_MS = 10 * 60 * 1000

let schemaReady = false

export async function ensureAsxFilingsSchema() {
  if (schemaReady) return
  await sqlRun(`
    CREATE TABLE IF NOT EXISTS asx_filings (
      document_key TEXT PRIMARY KEY,
      ticker TEXT NOT NULL,
      headline TEXT,
      kind TEXT,
      director TEXT,
      side TEXT,
      shares DOUBLE PRECISION,
      consideration_aud DOUBLE PRECISION,
      announced_at BIGINT NOT NULL,
      date_of_change TEXT,
      pdf_url TEXT,
      raw_json TEXT,
      updated_at BIGINT NOT NULL
    )
  `)
  await sqlRun(`CREATE INDEX IF NOT EXISTS idx_asx_filings_ticker_announced ON asx_filings (ticker, announced_at DESC)`)
  await sqlRun(`CREATE INDEX IF NOT EXISTS idx_asx_filings_side_announced ON asx_filings (side, announced_at DESC)`)
  schemaReady = true
}

function pdfUrl(documentKey) {
  return `${MARKIT}/file/${encodeURIComponent(documentKey)}`
}

function announcedTs(iso) {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : Date.now()
}

/**
 * Sydney calendar day bounds (UTC ms).
 * @param {'today'|'week'} window
 */
export function sydneyWindowBounds(window = 'today') {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const todaySydney = fmt.format(new Date()) // YYYY-MM-DD
  const start = sydneyMidnightUtcMs(todaySydney)
  if (window === 'week') {
    return { from: start - 6 * 86_400_000, to: start + 86_400_000 }
  }
  return { from: start, to: start + 86_400_000 }
}

/** @param {string} ymd YYYY-MM-DD in Sydney */
function sydneyMidnightUtcMs(ymd) {
  // Prefer AEDT/AEST by probing offsets
  for (const off of ['+11:00', '+10:00']) {
    const t = Date.parse(`${ymd}T00:00:00${off}`)
    const check = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Australia/Sydney',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(t + 3600_000))
    if (check === ymd) return t
  }
  return Date.parse(`${ymd}T00:00:00+10:00`)
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(45_000),
  })
  if (!res.ok) throw new Error(`ASX Markit ${res.status}`)
  return res.json()
}

async function fetchPdfText(documentKey) {
  const { PDFParse } = await import('pdf-parse')
  const res = await fetch(pdfUrl(documentKey), {
    headers: { 'User-Agent': UA, Accept: 'application/pdf' },
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new Error(`ASX PDF ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const parser = new PDFParse({ data: buf })
  try {
    const result = await parser.getText()
    return result?.text || ''
  } finally {
    await parser.destroy?.()
  }
}

function rowToFiling(row) {
  return {
    documentKey: row.document_key,
    ticker: row.ticker,
    headline: row.headline,
    kind: row.kind,
    director: row.director,
    side: row.side,
    shares: row.shares != null ? Number(row.shares) : null,
    considerationAud: row.consideration_aud != null ? Number(row.consideration_aud) : null,
    announcedAt: Number(row.announced_at),
    dateOfChange: row.date_of_change,
    pdfUrl: row.pdf_url,
    updatedAt: Number(row.updated_at),
  }
}

/**
 * @param {object} item Markit announcement
 * @param {string} ticker
 * @param {{ parsePdf?: boolean }} [opts]
 */
export async function upsertFilingFromAnnouncement(item, ticker, opts = {}) {
  await ensureAsxFilingsSchema()
  const documentKey = item.documentKey
  if (!documentKey) return null
  const existing = await sqlOne('SELECT * FROM asx_filings WHERE document_key = ?', [documentKey])
  const parsePdf = opts.parsePdf !== false
  // Re-parse when asked — PDF text extraction is the source of truth for side/shares.
  const needsParse = parsePdf && (opts.forceParse || !existing || existing.side === 'unknown' || existing.shares == null)

  let parsed = {
    director: directorFromHeadline(item.headline) || existing?.director || null,
    side: existing?.side || 'unknown',
    shares: existing?.shares != null ? Number(existing.shares) : null,
    considerationAud: existing?.consideration_aud != null ? Number(existing.consideration_aud) : null,
    dateOfChange: existing?.date_of_change || null,
    kind: filingKindFromHeadline(item.headline) || existing?.kind || 'director-interest',
  }

  if (parsePdf && needsParse) {
    try {
      const text = await fetchPdfText(documentKey)
      const p = parseDirectorInterestPdf(text, {
        headline: item.headline,
        ticker,
        documentKey,
        announcedAt: item.date,
      })
      parsed = {
        director: p.director || parsed.director,
        side: p.side || parsed.side,
        shares: p.shares ?? parsed.shares,
        considerationAud: p.considerationAud ?? parsed.considerationAud,
        dateOfChange: p.dateOfChange || parsed.dateOfChange,
        kind: p.kind || parsed.kind,
      }
    } catch (err) {
      console.warn(`[asx-filings] PDF parse failed ${documentKey}:`, err instanceof Error ? err.message : err)
    }
  }

  const now = Date.now()
  const announcedAt = announcedTs(item.date)
  await sqlRun(
    `INSERT INTO asx_filings (
      document_key, ticker, headline, kind, director, side, shares, consideration_aud,
      announced_at, date_of_change, pdf_url, raw_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(document_key) DO UPDATE SET
      ticker = excluded.ticker,
      headline = excluded.headline,
      kind = excluded.kind,
      director = COALESCE(excluded.director, asx_filings.director),
      side = CASE WHEN excluded.side != 'unknown' THEN excluded.side ELSE asx_filings.side END,
      shares = COALESCE(excluded.shares, asx_filings.shares),
      consideration_aud = COALESCE(excluded.consideration_aud, asx_filings.consideration_aud),
      announced_at = excluded.announced_at,
      date_of_change = COALESCE(excluded.date_of_change, asx_filings.date_of_change),
      pdf_url = excluded.pdf_url,
      raw_json = excluded.raw_json,
      updated_at = excluded.updated_at`,
    [
      documentKey,
      String(ticker).toUpperCase(),
      item.headline || null,
      parsed.kind,
      parsed.director,
      parsed.side,
      parsed.shares,
      parsed.considerationAud,
      announcedAt,
      parsed.dateOfChange,
      pdfUrl(documentKey),
      JSON.stringify({ source: 'asx-markit', announcementType: item.announcementType || item.announcementTypes }),
      now,
    ],
  )
  return sqlOne('SELECT * FROM asx_filings WHERE document_key = ?', [documentKey]).then(rowToFiling)
}

export async function ingestMarketDirectorAnnouncements(opts = {}) {
  await ensureAsxFilingsSchema()
  const json = await fetchJson(`${MARKIT}/markets/announcements?count=25`)
  const items = json?.data?.items || []
  const directorItems = items.filter(isDirectorInterestAnnouncement)
  const out = []
  for (const item of directorItems) {
    const ticker = String(item.symbol || item.companies?.[0]?.symbolDisplay || '').toUpperCase()
    if (!ticker || !/^[A-Z0-9]{1,6}$/.test(ticker)) continue
    const row = await upsertFilingFromAnnouncement(item, ticker, {
      parsePdf: opts.parsePdf !== false,
      forceParse: true,
    })
    if (row) out.push(row)
  }
  return { scanned: items.length, director: directorItems.length, upserted: out.length, filings: out }
}

export async function getFilingsForTicker(ticker, opts = {}) {
  await ensureAsxFilingsSchema()
  const t = String(ticker).toUpperCase().replace(/\.AX$/i, '')
  const force = Boolean(opts.forceRefresh)
  const newest = await sqlOne(
    'SELECT updated_at FROM asx_filings WHERE ticker = ? ORDER BY updated_at DESC LIMIT 1',
    [t],
  )
  const fresh = newest && Date.now() - Number(newest.updated_at) < FRESH_TICKER_MS
  if (force || !fresh) {
    try {
      const json = await fetchJson(`${MARKIT}/companies/${encodeURIComponent(t)}/announcements?count=50`)
      const items = (json?.data?.items || []).filter(isDirectorInterestAnnouncement)
      for (const item of items) {
        await upsertFilingFromAnnouncement(item, t, { parsePdf: true, forceParse: force })
      }
    } catch (err) {
      console.warn(`[asx-filings] ticker ${t}:`, err instanceof Error ? err.message : err)
    }
  }
  const rows = await sqlAll(
    `SELECT * FROM asx_filings WHERE ticker = ? ORDER BY announced_at DESC LIMIT 30`,
    [t],
  )
  return {
    ticker: t,
    source: 'asx-markit',
    disclaimer: 'Disclosed ASX Appendix 3X/3Y/3Z filings — not live market buyers.',
    filings: rows.map(rowToFiling),
  }
}

export async function getLargestDisclosedBuys(window = 'week') {
  await ensureAsxFilingsSchema()
  const w = window === 'today' ? 'today' : 'week'
  // Refresh market cache if stale
  const newest = await sqlOne('SELECT MAX(updated_at) AS u FROM asx_filings')
  if (!newest?.u || Date.now() - Number(newest.u) > FRESH_MARKET_MS) {
    try {
      await ingestMarketDirectorAnnouncements({ parsePdf: true })
    } catch (err) {
      console.warn('[asx-filings] market ingest:', err instanceof Error ? err.message : err)
    }
  }

  const { from, to } = sydneyWindowBounds(w)
  const rows = await sqlAll(
    `SELECT * FROM asx_filings
     WHERE side = 'buy' AND announced_at >= ? AND announced_at < ?
       AND shares IS NOT NULL AND shares > 0
     ORDER BY
       CASE WHEN consideration_aud IS NOT NULL THEN consideration_aud ELSE 0 END DESC,
       shares DESC
     LIMIT 25`,
    [from, to],
  )
  return {
    window: w,
    from,
    to,
    source: 'asx-markit',
    disclaimer: 'Largest disclosed director buys from ASX filings (Appendix 3Y etc.) — not broker tape.',
    buys: rows.map(rowToFiling),
  }
}
