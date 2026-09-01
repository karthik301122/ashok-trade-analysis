import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { eodhdEnabled, getEodhdToken } from './eodhd.mjs'
import { withEodhdThrottle } from './eodhdThrottle.mjs'
import { isEodhdDailyLimitExceeded } from './eodhdLimit.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const outPath = path.join(root, 'src', 'data', 'indexMembers.json')

/** EODHD Fundamentals index symbols (override via env). */
export const DEFAULT_INDEX_SYMBOLS = {
  asx200: 'AXJO.INDX',
  top500: 'AORD.INDX',
  small: 'AXSO.INDX',
}

const REFRESH_MS = () => {
  const n = Number(process.env.INDEX_MEMBERS_REFRESH_MS)
  return Number.isFinite(n) && n > 0 ? n : 24 * 60 * 60 * 1000
}

let cachedMembers = null
let cachedMtime = 0

function indexSymbol(envKey, fallback) {
  const v = process.env[envKey]?.trim()
  return v || fallback
}

function componentsToRows(components) {
  if (!components) return []
  if (Array.isArray(components)) return components
  if (typeof components === 'object') return Object.values(components)
  return []
}

/** Map EODHD component row to ASX ticker (CBA, BHP). */
export function eodhdComponentToTicker(row) {
  if (!row || typeof row !== 'object') return ''
  const code = String(row.Code ?? row.code ?? '').trim().toUpperCase()
  if (!code) return ''
  if (code.includes('.')) {
    const base = code.split('.')[0]
    return /^[A-Z0-9]{1,6}$/.test(base) ? base : ''
  }
  return /^[A-Z0-9]{1,6}$/.test(code) ? code : ''
}

function componentWeight(row) {
  const w = Number(row?.Weight ?? row?.weight)
  return Number.isFinite(w) ? w : 0
}

/**
 * @param {unknown[]} rows
 * @returns {string[]}
 */
export function tickersFromComponentRows(rows) {
  const seen = new Set()
  const sorted = [...rows].sort((a, b) => componentWeight(b) - componentWeight(a))
  const out = []
  for (const row of sorted) {
    const t = eodhdComponentToTicker(row)
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

/**
 * Fetch current index components via EODHD Fundamentals (~10 API calls per index).
 * @param {string} symbol e.g. AXJO.INDX
 */
export async function fetchEodhdIndexComponents(symbol) {
  const token = getEodhdToken()
  if (!token || isEodhdDailyLimitExceeded()) return null

  return withEodhdThrottle(async () => {
    const url = new URL(`https://eodhd.com/api/fundamentals/${encodeURIComponent(symbol)}`)
    url.searchParams.set('api_token', token)
    url.searchParams.set('fmt', 'json')
    url.searchParams.set('filter', 'Components')

    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) })
    if (res.status === 404) return null
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`EODHD fundamentals ${symbol}: ${res.status} ${text.slice(0, 120)}`)
    }
    const data = await res.json()
    if (data && typeof data === 'object' && !Array.isArray(data) && data.error) {
      throw new Error(String(data.error))
    }
    const rows = componentsToRows(data)
    const tickers = tickersFromComponentRows(rows)
    if (!tickers.length) return null
    return { symbol, tickers, count: tickers.length }
  })
}

/**
 * Build membership sets:
 * - asx200: S&P/ASX 200
 * - asx500: All Ordinaries (~500 largest on ASX)
 * - mid: in asx500 but not in asx200
 * - small: S&P/ASX Small Ordinaries
 */
export async function buildMembershipFromEodhd() {
  const sym200 = indexSymbol('EODHD_INDEX_ASX200', DEFAULT_INDEX_SYMBOLS.asx200)
  const sym500 = indexSymbol('EODHD_INDEX_TOP500', DEFAULT_INDEX_SYMBOLS.top500)
  const symSmall = indexSymbol('EODHD_INDEX_SMALL', DEFAULT_INDEX_SYMBOLS.small)

  const [r200, r500, rSmall] = await Promise.all([
    fetchEodhdIndexComponents(sym200),
    fetchEodhdIndexComponents(sym500),
    fetchEodhdIndexComponents(symSmall),
  ])

  if (!r200?.tickers?.length) {
    throw new Error(`No ASX 200 components from ${sym200}`)
  }
  if (!r500?.tickers?.length) {
    throw new Error(`No Top 500 / All Ordinaries components from ${sym500}`)
  }
  if (!rSmall?.tickers?.length) {
    throw new Error(`No Small Ordinaries components from ${symSmall}`)
  }

  const asx200 = r200.tickers
  const asx500 = r500.tickers
  const set200 = new Set(asx200)
  const mid = asx500.filter((t) => !set200.has(t))
  const small = rSmall.tickers

  return {
    asOf: new Date().toISOString().slice(0, 10),
    source: 'eodhd-fundamentals',
    note:
      `ASX200=${sym200}, Top500=${sym500} (All Ordinaries), Small=${symSmall}. Mid = Top500 minus ASX200. ~30 EODHD API calls/day to refresh.`,
    symbols: { asx200: sym200, top500: sym500, small: symSmall },
    asx200,
    asx500,
    mid,
    small,
  }
}

export function indexMembersPath() {
  return outPath
}

export function loadIndexMembersFile() {
  if (!fs.existsSync(outPath)) return null
  const stat = fs.statSync(outPath)
  if (cachedMembers && cachedMtime === stat.mtimeMs) return cachedMembers
  cachedMembers = JSON.parse(fs.readFileSync(outPath, 'utf8'))
  cachedMtime = stat.mtimeMs
  return cachedMembers
}

export function tickersForUniverseId(universeId) {
  const file = loadIndexMembersFile()
  if (!file) return []
  const key = universeId === 'asx200' || universeId === 'asx500' || universeId === 'mid' || universeId === 'small'
    ? universeId
    : null
  if (!key || !Array.isArray(file[key])) return []
  return file[key]
}

export function isIndexMembersFresh() {
  if (!fs.existsSync(outPath)) return false
  const stat = fs.statSync(outPath)
  return Date.now() - stat.mtimeMs < REFRESH_MS()
}

/**
 * Pull EODHD index constituents and write src/data/indexMembers.json.
 */
export async function refreshIndexMembersFromEodhd() {
  if (!eodhdEnabled()) {
    return { skipped: true, reason: 'eodhd_disabled' }
  }
  if (isEodhdDailyLimitExceeded()) {
    return { skipped: true, reason: 'eodhd_daily_limit' }
  }

  const payload = await buildMembershipFromEodhd()
  fs.writeFileSync(outPath, JSON.stringify(payload))
  cachedMembers = payload
  cachedMtime = fs.statSync(outPath).mtimeMs

  console.log(
    `[index-members] refreshed · asx200=${payload.asx200.length} asx500=${payload.asx500.length} mid=${payload.mid.length} small=${payload.small.length}`,
  )

  return {
    ok: true,
    asx200: payload.asx200.length,
    asx500: payload.asx500.length,
    mid: payload.mid.length,
    small: payload.small.length,
    path: outPath,
  }
}

export async function refreshIndexMembersIfStale() {
  if (isIndexMembersFresh()) {
    return { skipped: true, reason: 'fresh' }
  }
  return refreshIndexMembersFromEodhd()
}
