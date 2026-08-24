/**
 * Re-apply mineral commodity industries onto src/data/asxUniverse.json
 * Usage: node scripts/apply-mineral-industries.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { classifyMineral, shouldReclassify, MINERAL_INDUSTRIES } from './mineral-industries.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const file = path.join(root, 'src/data/asxUniverse.json')
const rows = JSON.parse(fs.readFileSync(file, 'utf8'))

const counts = Object.fromEntries(Object.values(MINERAL_INDUSTRIES).map((v) => [v, 0]))
let changed = 0

for (const s of rows) {
  if (!shouldReclassify(s)) continue
  const next = classifyMineral(s)
  if (!next) continue
  if (s.sector !== next.sector || s.industry !== next.industry) changed++
  s.sector = next.sector
  s.industry = next.industry
  if (counts[next.industry] != null) counts[next.industry]++
}

fs.writeFileSync(file, JSON.stringify(rows))
console.log('changed', changed, '| mineral-tagged', Object.values(counts).reduce((a, b) => a + b, 0))
console.log(counts)
const otherPct = Math.round((counts['Other Mining'] / Object.values(counts).reduce((a, b) => a + b, 0)) * 1000) / 10
console.log('Other Mining share of mineral universe:', otherPct + '%')
