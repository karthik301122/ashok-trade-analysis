/**
 * Generate ScanScript-Guide.pdf from docs/scan-script-guide.html
 * Writes to docs/ (source copy) and public/ (served by Vite / production).
 * Usage: node scripts/generate-scan-script-pdf.mjs
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const htmlPath = path.join(root, 'docs', 'scan-script-guide.html')
const docsPdfPath = path.join(root, 'docs', 'ScanScript-Guide.pdf')
const publicDir = path.join(root, 'public')
const publicPdfPath = path.join(publicDir, 'ScanScript-Guide.pdf')
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
    `--print-to-pdf=${docsPdfPath}`,
    htmlUrl,
  ],
  { encoding: 'utf8' },
)

if (result.status !== 0) {
  console.error(result.stderr || result.stdout || 'PDF generation failed')
  process.exit(result.status ?? 1)
}

mkdirSync(publicDir, { recursive: true })
copyFileSync(docsPdfPath, publicPdfPath)
console.log(`PDF written: ${docsPdfPath}`)
console.log(`PDF copied:  ${publicPdfPath}`)
