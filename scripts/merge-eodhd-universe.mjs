/**
 * Merge full EODHD AU exchange list into src/data/asxUniverse.json.
 * Keeps sector/industry/weight from existing company rows; adds ETFs, funds, notes, etc.
 *
 * Requires EODHD_API_TOKEN in .env or environment.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { loadEnvFile } from '../server/loadEnv.mjs'
import { classifyMineral } from './mineral-industries.mjs'

loadEnvFile()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const universePath = path.join(root, 'src', 'data', 'asxUniverse.json')
const metaPath = path.join(root, 'data', 'asx-universe-meta.json')

const TYPE_SECTOR = {
  ETF: 'ETFs',
  FUND: 'Funds',
  Notes: 'Structured Products',
  'Preferred Stock': 'Preferred Equity',
}

const TYPE_INDUSTRY = {
  ETF: 'Exchange Traded Fund',
  FUND: 'Managed Fund',
  Notes: 'Notes & Structured',
  'Preferred Stock': 'Preferred Stock',
}

function cleanName(name) {
  return String(name || '')
    .replace(/\s+LIMITED$/i, '')
    .replace(/\s+LTD\.?$/i, '')
    .trim()
    .slice(0, 64)
}

function inferEtfIndustry(name) {
  const n = name.toLowerCase()
  if (n.includes('bond') || n.includes('fixed income')) return 'Bond ETF'
  if (n.includes('gold') || n.includes('silver')) return 'Commodity ETF'
  if (n.includes('property') || n.includes('reit')) return 'Property ETF'
  if (n.includes('asx 200') || n.includes('asx200') || n.includes('s&p/asx 200')) return 'Australian Equity ETF'
  if (n.includes('asx 300') || n.includes('broad')) return 'Broad Market ETF'
  if (n.includes('sector') || n.includes('resources') || n.includes('financials')) return 'Sector ETF'
  if (n.includes('international') || n.includes('global') || n.includes('world')) return 'International ETF'
  return 'Exchange Traded Fund'
}

function isValidCode(code) {
  return /^[A-Z0-9][A-Z0-9.-]{0,14}$/i.test(code)
}

async function fetchEodhdAuList() {
  const token = process.env.EODHD_API_TOKEN?.trim()
  if (!token) throw new Error('EODHD_API_TOKEN missing — set in .env')
  const url = `https://eodhd.com/api/exchange-symbol-list/AU?api_token=${token}&fmt=json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`EODHD symbol list failed: ${res.status}`)
  const data = await res.json()
  if (!Array.isArray(data)) throw new Error('Unexpected EODHD symbol list response')
  return data
}

function loadExistingUniverse() {
  if (!fs.existsSync(universePath)) return []
  return JSON.parse(fs.readFileSync(universePath, 'utf8'))
}

function rowFromEodhd(entry, existing) {
  const ticker = String(entry.Code || '').trim().toUpperCase()
  const type = String(entry.Type || 'Common Stock').trim()
  const name = cleanName(entry.Name) || ticker

  if (existing) {
    return {
      ...existing,
      name: existing.name || name,
      instrumentType: existing.instrumentType || type,
    }
  }

  if (type === 'Common Stock') {
    const row = {
      ticker,
      name,
      sector: 'Miscellaneous',
      industry: 'Unclassified',
      weight: 0.001,
      instrumentType: type,
    }
    const mineral = classifyMineral(row)
    if (mineral) {
      row.sector = mineral.sector
      row.industry = mineral.industry
    }
    return row
  }

  const sector = TYPE_SECTOR[type] || 'Other Instruments'
  const industry =
    type === 'ETF'
      ? inferEtfIndustry(name)
      : TYPE_INDUSTRY[type] || type

  return {
    ticker,
    name,
    sector,
    industry,
    weight: 0.001,
    instrumentType: type,
  }
}

async function main() {
  const existingRows = loadExistingUniverse()
  const byTicker = new Map(existingRows.map((r) => [r.ticker.toUpperCase(), r]))
  const eodList = await fetchEodhdAuList()

  let added = 0
  let updated = 0
  const typeCounts = {}

  for (const entry of eodList) {
    const ticker = String(entry.Code || '').trim().toUpperCase()
    if (!ticker || !isValidCode(ticker)) continue
    const type = String(entry.Type || 'unknown')
    typeCounts[type] = (typeCounts[type] || 0) + 1

    const prev = byTicker.get(ticker)
    const row = rowFromEodhd(entry, prev)
    if (!prev) added++
    else updated++
    byTicker.set(ticker, row)
  }

  const rows = [...byTicker.values()].sort(
    (a, b) => b.weight - a.weight || a.ticker.localeCompare(b.ticker),
  )

  fs.mkdirSync(path.dirname(universePath), { recursive: true })
  fs.writeFileSync(universePath, JSON.stringify(rows))

  const meta = {
    count: rows.length,
    generatedAt: new Date().toISOString(),
    source: 'eodhd-au-exchange-symbol-list + asxUniverse merge',
    eodhdSymbols: eodList.length,
    added,
    updated,
    typeCounts,
    instrumentTypes: Object.fromEntries(
      [...rows.reduce((m, r) => {
        const t = r.instrumentType || 'Common Stock'
        m.set(t, (m.get(t) || 0) + 1)
        return m
      }, new Map)].sort((a, b) => b[1] - a[1]),
    ),
  }
  fs.mkdirSync(path.dirname(metaPath), { recursive: true })
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2))

  console.log('Universe merge complete')
  console.log('  total rows:', rows.length)
  console.log('  eodhd AU symbols:', eodList.length)
  console.log('  added:', added, 'updated:', updated)
  console.log('  by type:', meta.instrumentTypes)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
