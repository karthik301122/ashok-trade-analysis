/**
 * Free ASX200 membership via iShares Core S&P/ASX 200 ETF (IOZ) holdings CSV
 * published by BlackRock (public FDF file).
 *
 * This is the best free proxy for official ASX200 constituents — not S&P's
 * licensed file, but IOZ tracks the index and publishes full equity holdings.
 *
 * Usage:
 *   node scripts/fetch-asx200-ioz.mjs
 *   npm run build:members   # uses data/asx200-ioz.csv automatically
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const dataDir = path.join(root, 'data')
const rawPath = path.join(dataDir, 'ioz-holdings-raw.csv')
const csvOut = path.join(dataDir, 'asx200-ioz.csv')
const universePath = path.join(root, 'src', 'data', 'asxUniverse.json')

const IOZ_FDF_URL = 'https://www.blackrock.com/au/literature/fdf/fdf-ioz-en_au.csv'

fs.mkdirSync(dataDir, { recursive: true })

function parseCsvLine(line) {
  const parts = []
  let cur = ''
  let q = false
  for (const ch of line) {
    if (ch === '"') {
      q = !q
      continue
    }
    if (ch === ',' && !q) {
      parts.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  parts.push(cur)
  return parts
}

/** Known names that don't use AU000000XXX ISIN form */
const NAME_ALIASES = {
  'BLOCK CDI': 'SQ2',
  'FISHER AND PAYKEL HEALTHCARE CORPO': 'FPH',
  'FISHER AND PAYKEL HEALTHCARE': 'FPH',
  'HOMECO DAILY NEEDS UNITS': 'HDN',
  'HOMECO DAILY NEEDS': 'HDN',
}

function tickerFromIsin(isin) {
  if (!isin) return null
  // Classic ASX equity ISIN: AU000000XXXD  (ticker padded in positions 8–13)
  const m = String(isin).toUpperCase().match(/^AU000000([A-Z0-9]{1,6})\d$/)
  return m ? m[1] : null
}

function normName(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/\b(LIMITED|LTD\.?|GROUP|HOLDINGS?|CORPORATION|CORP\.?|PLC|THE)\b/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

async function download() {
  const res = await fetch(IOZ_FDF_URL)
  if (!res.ok) throw new Error(`IOZ download failed: HTTP ${res.status}`)
  const text = await res.text()
  fs.writeFileSync(rawPath, text)
  return text
}

function extractEquities(text) {
  const lines = text.split(/\r?\n/)
  let inHoldings = false
  const rows = []
  for (const line of lines) {
    if (line.startsWith('Holdings: Securities')) {
      inHoldings = true
      continue
    }
    if (inHoldings && line.startsWith('Holdings:')) break
    if (!inHoldings || !line.trim() || line.startsWith('ASSET CLASS')) continue
    const p = parseCsvLine(line)
    if (p[0] !== 'EQUITY') continue
    rows.push({ name: p[1] || '', isin: (p[4] || '').trim().toUpperCase() })
  }
  return rows
}

function resolveTickers(equities) {
  const universe = JSON.parse(fs.readFileSync(universePath, 'utf8'))
  const byTicker = new Map(universe.map((u) => [u.ticker, u]))
  const byName = new Map()
  for (const u of universe) {
    byName.set(normName(u.name), u.ticker)
    byName.set(normName(u.ticker + ' ' + u.name), u.ticker)
  }

  const tickers = new Set()
  const unresolved = []

  for (const e of equities) {
    const aliasKey = Object.keys(NAME_ALIASES).find((k) =>
      String(e.name).toUpperCase().startsWith(k),
    )
    if (aliasKey) {
      tickers.add(NAME_ALIASES[aliasKey])
      continue
    }
    let t = tickerFromIsin(e.isin)
    if (t && byTicker.has(t)) {
      tickers.add(t)
      continue
    }
    // ISIN ticker not in universe — still keep if looks valid (index member we lack)
    if (t && /^[A-Z0-9]{1,6}$/.test(t) && t !== 'IOZ') {
      tickers.add(t)
      continue
    }
    const n = normName(e.name)
    const hit = byName.get(n)
    if (hit) {
      tickers.add(hit)
      continue
    }
    // Soft match: universe name contained in holding name or vice versa
    let soft = null
    for (const u of universe) {
      const un = normName(u.name)
      if (!un || un.length < 4) continue
      if (n.includes(un) || un.includes(n)) {
        soft = u.ticker
        break
      }
    }
    if (soft) tickers.add(soft)
    else unresolved.push(e)
  }

  tickers.delete('IOZ')
  return { tickers: [...tickers].sort(), unresolved }
}

const text = await download()
const equities = extractEquities(text)
const { tickers, unresolved } = resolveTickers(equities)

const header = `# ASX200 proxy from iShares IOZ ETF holdings (BlackRock FDF)
# Source: ${IOZ_FDF_URL}
# Fetched: ${new Date().toISOString()}
# Equity rows: ${equities.length} · Resolved tickers: ${tickers.length} · Unresolved: ${unresolved.length}
TICKER
`
fs.writeFileSync(csvOut, header + tickers.join('\n') + '\n')

console.log(`Downloaded IOZ holdings → ${rawPath}`)
console.log(`Wrote ${csvOut} · ${tickers.length} tickers`)
if (unresolved.length) {
  console.log(`Unresolved (${unresolved.length}) — first few:`)
  for (const u of unresolved.slice(0, 8)) {
    console.log(`  ${u.isin || '?'}  ${u.name}`)
  }
}
if (tickers.length < 180 || tickers.length > 220) {
  console.warn(
    `Warning: expected ~200 ASX200 names, got ${tickers.length}. Check BlackRock file format.`,
  )
}
