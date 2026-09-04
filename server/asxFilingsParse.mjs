/**
 * Parse Appendix 3Y / Change of Director's Interest PDF text (and headlines).
 * Free ASX Markit feed — no paid data.
 */

/**
 * @param {string} raw
 * @returns {number | null}
 */
export function parseShareCount(raw) {
  if (!raw) return null
  if (/\bnot\s+applicable\b|\bn\/?a\b|\bnil\b/i.test(raw)) return null
  const m = String(raw).replace(/,/g, '').match(/(\d+(?:\.\d+)?)/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * @param {string} text
 */
export function isOrdinaryEquityText(text) {
  const t = String(text || '')
  if (!/ordinary|fully\s+paid/i.test(t)) return false
  // Pure rights/options lines without ordinary shares
  if (/performance\s+rights?|options?|warrants?|rights?\s+to\s+acquire/i.test(t) && !/ordinary/i.test(t)) {
    return false
  }
  return true
}

/**
 * @param {string} text
 * @returns {number | null}
 */
export function parseConsiderationAud(text) {
  if (!text || /\bnot\s+applicable\b|\bnil\b|\bn\/?a\b|non-?cash|no\s+cash/i.test(text)) return null
  const cleaned = text.replace(/,/g, '')
  const m = cleaned.match(/(?:AUD|A\$|\$)\s*(\d+(?:\.\d+)?)/i) || cleaned.match(/(\d+(?:\.\d+)?)\s*(?:AUD|dollars?)/i)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * @param {string} text
 * @param {string} label
 */
function fieldAfter(text, label) {
  // Prefer same-line value (Appendix 3Y layout); fall back to short block.
  const lineRe = new RegExp(`${label}\\s*[:\\t ]+([^\\n\\r]+)`, 'i')
  const line = text.match(lineRe)
  if (line?.[1]?.trim()) return line[1].trim()

  const blockRe = new RegExp(
    `${label}\\s*[:\\n]?\\s*([\\s\\S]{0,280}?)(?=(?:\\n\\s*)?(?:Name of |Date of |Number |Value/|No\\. of |Class |Part |Nature of |If consideration|$))`,
    'i',
  )
  const m = text.match(blockRe)
  return m ? m[1].trim() : ''
}

/**
 * @param {string} headline
 */
export function directorFromHeadline(headline) {
  const h = String(headline || '')
  const m =
    h.match(/Appendix\s+3[XYZ]\s*[-–—]\s*(.+)$/i) ||
    h.match(/Change of Director'?s? Interest(?:\s+Notice)?\s*[-–—]\s*(.+)$/i)
  if (!m) return null
  return m[1].replace(/\s+/g, ' ').trim() || null
}

/**
 * @param {string} headline
 * @returns {'3X'|'3Y'|'3Z'|'director-interest'|null}
 */
export function filingKindFromHeadline(headline) {
  const h = String(headline || '')
  if (/Appendix\s+3X\b/i.test(h)) return '3X'
  if (/Appendix\s+3Z\b/i.test(h)) return '3Z'
  if (/Appendix\s+3Y\b/i.test(h)) return '3Y'
  if (/Change of Director'?s? Interest/i.test(h)) return 'director-interest'
  return null
}

/**
 * @param {string} pdfText
 * @param {{ headline?: string, ticker?: string, documentKey?: string, announcedAt?: string }} meta
 */
export function parseDirectorInterestPdf(pdfText, meta = {}) {
  const text = String(pdfText || '').replace(/\u00a0/g, ' ')
  const headline = meta.headline || ''

  const director =
    (fieldAfter(text, 'Name of Director').split('\n')[0] || '').replace(/\s+/g, ' ').trim() ||
    directorFromHeadline(headline)

  const dateOfChangeRaw = fieldAfter(text, 'Date of change').split('\n')[0]?.trim() || null
  const acquiredRaw = fieldAfter(text, 'Number acquired')
  const disposedRaw = fieldAfter(text, 'Number disposed')
  const considerationRaw = fieldAfter(text, 'Value/Consideration')

  const acquiredLine = acquiredRaw.split('\n').map((s) => s.trim()).filter(Boolean)[0] || acquiredRaw
  const disposedLine = disposedRaw.split('\n').map((s) => s.trim()).filter(Boolean)[0] || disposedRaw

  const acquiredShares = parseShareCount(acquiredLine)
  const disposedShares = parseShareCount(disposedLine)

  const acquiredOrdinary = isOrdinaryEquityText(acquiredLine) ? acquiredShares : null
  const disposedOrdinary = isOrdinaryEquityText(disposedLine) ? disposedShares : null

  let side = 'unknown'
  // Prefer ordinary equity moves; vesting often acquires ordinary + disposes rights.
  if (acquiredOrdinary) side = 'buy'
  else if (disposedOrdinary) side = 'sell'
  else if (acquiredShares && !disposedShares) side = 'buy'
  else if (disposedShares && !acquiredShares) side = 'sell'

  const shares =
    side === 'buy'
      ? acquiredOrdinary || acquiredShares
      : side === 'sell'
        ? disposedOrdinary || disposedShares
        : acquiredOrdinary || disposedOrdinary || acquiredShares || disposedShares

  const considerationAud = parseConsiderationAud(considerationRaw)

  return {
    ticker: meta.ticker ? String(meta.ticker).toUpperCase() : null,
    documentKey: meta.documentKey || null,
    headline: headline || null,
    kind: filingKindFromHeadline(headline) || '3Y',
    director: director || null,
    side,
    shares: shares ?? null,
    acquiredShares: acquiredOrdinary || acquiredShares,
    disposedShares: disposedOrdinary || disposedShares,
    considerationAud,
    dateOfChange: dateOfChangeRaw,
    announcedAt: meta.announcedAt || null,
    acquiredRaw: acquiredLine.slice(0, 200) || null,
    disposedRaw: disposedLine.slice(0, 200) || null,
    parseOk: Boolean(director || shares),
  }
}

/**
 * @param {{ announcementTypes?: string[], headline?: string }} item
 */
export function isDirectorInterestAnnouncement(item) {
  const types = (item.announcementTypes || []).join(' ')
  const h = item.headline || ''
  if (filingKindFromHeadline(h)) return true
  if (/Change of Director'?s? Interest/i.test(types)) return true
  if (/Appendix\s+3[XYZ]/i.test(h)) return true
  // Avoid "Director Nominations" etc.
  if (/Director Nominations|election of director/i.test(h)) return false
  return false
}
