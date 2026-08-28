/**
 * Generate docs/ScanScript-Guide.pdf from docs/scan-script-guide.html
 * Usage: node scripts/generate-scan-script-pdf.mjs
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const htmlPath = path.join(root, 'docs', 'scan-script-guide.html')
const pdfPath = path.join(root, 'docs', 'ScanScript-Guide.pdf')
const htmlUrl = `file:///${htmlPath.replace(/\\/g, '/')}`

const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean)

const browser = chromeCandidates.find((p) => existsSync(p))

if (!browser) {
  console.error('Chrome or Edge not found. Open docs/scan-script-guide.html and print to PDF.')
  process.exit(1)
}

const result = spawnSync(
  browser,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-pdf-header-footer',
    `--print-to-pdf=${pdfPath}`,
    htmlUrl,
  ],
  { encoding: 'utf8' },
)

if (result.status !== 0) {
  console.error(result.stderr || result.stdout || 'PDF generation failed')
  process.exit(result.status ?? 1)
}

console.log(`PDF written: ${pdfPath}`)
