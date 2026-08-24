import fs from 'fs'
import { classifyMineral } from './mineral-industries.mjs'

const official = fs.readFileSync('data/asx-official.csv', 'utf8')
const london = fs.readFileSync('data/asx-london.csv', 'utf8')

function parseCsv(text) {
  return text.trim().split(/\r?\n/)
}

const mcap = new Map()
for (const line of parseCsv(london).slice(1)) {
  const m = line.match(/^"([^"]+)","([^"]*)","([^"]*)","([^"]*)",(\d+)/)
  if (m) mcap.set(m[1], Number(m[5]))
}

const sectorMap = {
  Energy: 'Energy Minerals',
  Materials: 'Non-Energy Minerals',
  'Capital Goods': 'Producer Manufacturing',
  'Commercial & Professional Services': 'Commercial Services',
  Transportation: 'Transportation',
  'Automobiles & Components': 'Consumer Durables',
  'Consumer Durables & Apparel': 'Consumer Durables',
  'Consumer Services': 'Consumer Services',
  'Media & Entertainment': 'Consumer Services',
  'Consumer Discretionary Distribution & Retail': 'Retail Trade',
  'Consumer Staples Distribution & Retail': 'Retail Trade',
  'Food, Beverage & Tobacco': 'Consumer Non-Durables',
  'Household & Personal Products': 'Consumer Non-Durables',
  'Health Care Equipment & Services': 'Health Services',
  'Pharmaceuticals, Biotechnology & Life Sciences': 'Health Technology',
  Banks: 'Finance',
  'Financial Services': 'Finance',
  Insurance: 'Finance',
  'Software & Services': 'Technology Services',
  'Technology Hardware & Equipment': 'Electronic Technology',
  'Semiconductors & Semiconductor Equipment': 'Electronic Technology',
  'Telecommunication Services': 'Communications',
  Utilities: 'Utilities',
  'Equity Real Estate Investment Trusts (REITs)': 'Finance',
  'Real Estate Management & Development': 'Finance',
  'Not Applic': 'Miscellaneous',
  'Classification Pending': 'Miscellaneous',
}

const rows = []
const lines = parseCsv(official)
let start = 0
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('ASX code')) {
    start = i + 1
    break
  }
}

for (const line of lines.slice(start)) {
  const m = line.match(/^"([^"]+)","([^"]+)","([^"]*)"/)
  if (!m) continue
  const name = m[1].replace(/\s+LIMITED$/i, '').replace(/\s+LTD\.?$/i, '').trim()
  const ticker = m[2].trim().toUpperCase()
  const gics = m[3].trim() || 'Miscellaneous'
  if (!/^[A-Z0-9]{1,6}$/.test(ticker)) continue
  const cap = mcap.get(ticker) ?? 0
  rows.push({
    ticker,
    name: name.length > 48 ? name.slice(0, 48) : name,
    sector: sectorMap[gics] || 'Miscellaneous',
    industry: gics === 'Not Applic' || gics === 'Classification Pending' ? 'Unclassified' : gics,
    weight: cap > 0 ? cap : 1,
  })
}

const total = rows.reduce((s, r) => s + r.weight, 0) || 1
for (const r of rows) {
  r.weight = Math.round((r.weight / total) * 100000) / 1000
  if (r.weight <= 0) r.weight = 0.001
}

for (const r of rows) {
  const next = classifyMineral(r)
  if (next) {
    r.sector = next.sector
    r.industry = next.industry
  }
}

rows.sort((a, b) => b.weight - a.weight || a.ticker.localeCompare(b.ticker))

fs.mkdirSync('src/data', { recursive: true })
fs.writeFileSync('src/data/asxUniverse.json', JSON.stringify(rows))
fs.writeFileSync(
  'data/asx-universe-meta.json',
  JSON.stringify(
    {
      count: rows.length,
      generatedAt: new Date().toISOString(),
      source: 'asx-official-20260302 + market caps Jun2025',
      sectors: [...new Set(rows.map((r) => r.sector))].length,
      industries: [...new Set(rows.map((r) => r.industry))].length,
    },
    null,
    2,
  ),
)

console.log('wrote', rows.length, 'tickers')
console.log(
  'top5',
  rows.slice(0, 5).map((r) => r.ticker + ':' + r.weight),
)
