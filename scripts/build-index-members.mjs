import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

/**
 * Build membership sets for breadth universes.
 *
 * Priority for ASX200:
 *   1. INDEX_ASX200_CSV env path (manual / official)
 *   2. data/asx200-ioz.csv from `npm run fetch:asx200` (free IOZ ETF holdings)
 *   3. Weight-rank proxy from asxUniverse.json
 *
 * Usage:
 *   npm run fetch:asx200 && npm run build:members
 *   # or
 *   node scripts/build-index-members.mjs
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const universePath = path.join(root, 'src', 'data', 'asxUniverse.json')
const outPath = path.join(root, 'src', 'data', 'indexMembers.json')
const iozCsvDefault = path.join(root, 'data', 'asx200-ioz.csv')

const universe = JSON.parse(fs.readFileSync(universePath, 'utf8'))
const ranked = [...universe].sort((a, b) => b.weight - a.weight)

function fromCsv(csvPath) {
  const text = fs.readFileSync(csvPath, 'utf8')
  const tickers = new Set()
  for (const line of text.trim().split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const t = trimmed.split(/[,;\t]/)[0].replace(/["']/g, '').trim().toUpperCase()
    if (t === 'TICKER' || t === 'ASX' || t === 'CODE') continue
    if (/^[A-Z0-9]{1,6}$/.test(t)) tickers.add(t)
  }
  return [...tickers]
}

const envCsv = process.env.INDEX_ASX200_CSV
let asx200
let source
let note

if (envCsv && fs.existsSync(envCsv)) {
  asx200 = fromCsv(envCsv)
  source = 'official-csv'
  note =
    'ASX200 from INDEX_ASX200_CSV; ASX500/mid/small still weight-rank slices of our universe.'
} else if (fs.existsSync(iozCsvDefault)) {
  asx200 = fromCsv(iozCsvDefault)
  source = 'ioz-etf-holdings'
  note =
    'ASX200 proxied from free BlackRock iShares IOZ ETF holdings (tracks S&P/ASX 200). Not S&P licensed constituents. ASX500/mid/small still weight-rank slices. Refresh: npm run fetch:asx200 && npm run build:members'
} else {
  asx200 = ranked.slice(0, 200).map((r) => r.ticker)
  source = 'weight-rank-proxy'
  note =
    'All sets derived from weight ranks in asxUniverse.json. For free ASX200 proxy run: npm run fetch:asx200 && npm run build:members'
}

const asx500 = ranked.slice(0, 500).map((r) => r.ticker)
const mid = ranked.slice(200, 500).map((r) => r.ticker)
const small = ranked.slice(500).map((r) => r.ticker)

const payload = {
  asOf: new Date().toISOString().slice(0, 10),
  source,
  note,
  asx200,
  asx500,
  mid,
  small,
}

fs.writeFileSync(outPath, JSON.stringify(payload))
console.log(
  `Wrote ${outPath} · source=${source} · asx200=${asx200.length} asx500=${asx500.length} mid=${mid.length} small=${small.length}`,
)
