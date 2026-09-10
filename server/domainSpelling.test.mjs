import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Single-s typo (trader-scope). Correct public host is tradersscope.com (traders + scope). */
const WRONG_DOMAIN = /traderscope\.com/i

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', 'data'])
const TEXT_EXT = new Set([
  '.mjs',
  '.js',
  '.ts',
  '.tsx',
  '.jsx',
  '.html',
  '.xml',
  '.txt',
  '.md',
  '.example',
  '.yml',
  '.yaml',
  '.css',
  '.ps1',
])

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p, out)
    else if (TEXT_EXT.has(path.extname(ent.name)) || ent.name === '.env.example') out.push(p)
  }
  return out
}

describe('public domain spelling', () => {
  it('never uses traderscope.com (one s) — correct is tradersscope.com', () => {
    const hits = []
    for (const file of walk(root)) {
      // This test file documents the forbidden spelling.
      if (file.endsWith(`${path.sep}domainSpelling.test.mjs`)) continue
      const text = fs.readFileSync(file, 'utf8')
      if (!WRONG_DOMAIN.test(text)) continue
      for (const [i, line] of text.split(/\r?\n/).entries()) {
        if (WRONG_DOMAIN.test(line)) hits.push(`${path.relative(root, file)}:${i + 1}`)
      }
    }
    expect(hits, `Wrong domain traderscope.com found:\n${hits.join('\n')}`).toEqual([])
  })
})
