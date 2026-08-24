/**
 * Apply mineral commodity industries onto src/data/asxUniverse.json
 * Usage: node scripts/apply-mineral-industries.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { classifyMineral, MINERAL_INDUSTRIES } from './mineral-industries.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const file = path.join(root, 'src/data/asxUniverse.json')
const rows = JSON.parse(fs.readFileSync(file, 'utf8'))

const counts = Object.fromEntries(Object.values(MINERAL_INDUSTRIES).map((v) => [v, 0]))
let changed = 0

for (const s of rows) {
  const next = classifyMineral(s)
  if (!next) continue
  if (s.sector !== next.sector || s.industry !== next.industry) {
    s.sector = next.sector
    s.industry = next.industry
    changed++
  }
  if (counts[next.industry] != null) counts[next.industry]++
}

fs.writeFileSync(file, JSON.stringify(rows))
console.log('updated', changed, 'of', rows.length)
console.log(counts)
