/**
 * Build membership sets for breadth universes.
 *
 * Primary: EODHD Fundamentals index components (npm run refresh:index-members).
 * Fallback: IOZ CSV for ASX200 + weight-rank slices (legacy).
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { loadEnvFile } from '../server/loadEnv.mjs'

loadEnvFile()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

async function main() {
  const { eodhdEnabled, refreshIndexMembersFromEodhd } = await import(
    '../server/eodhdIndexMembers.mjs'
  )

  if (eodhdEnabled()) {
    try {
      const result = await refreshIndexMembersFromEodhd()
      if (!result.skipped) return
      console.warn(`[build:members] EODHD skipped (${result.reason}), using fallback…`)
    } catch (err) {
      console.warn(
        `[build:members] EODHD failed (${err instanceof Error ? err.message : err}), using fallback…`,
      )
    }
  }

  // Legacy fallback (IOZ + weight ranks)
  await import('./build-index-members-legacy.mjs')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
