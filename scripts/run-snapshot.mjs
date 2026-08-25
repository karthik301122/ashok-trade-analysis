/**
 * CLI: build / refresh the SQLite universe snapshot.
 * Usage: npm run snapshot
 *        npm run snapshot -- --force
 */
import { runUniverseSnapshot } from '../server/snapshotJob.mjs'
import { dbPath } from '../server/db.mjs'

const force = process.argv.includes('--force')
console.log(`Database: ${dbPath()}`)
console.log(force ? 'Forcing full snapshot…' : 'Building snapshot if stale/missing…')

try {
  const result = await runUniverseSnapshot({ force })
  console.log(JSON.stringify(result, null, 2))
  process.exit(0)
} catch (err) {
  console.error(err)
  process.exit(1)
}
