/**
 * CLI: build / refresh the universe snapshot.
 */
import {
  runUniverseSnapshot,
  runRetryFailedSnapshot,
} from '../server/snapshotJob.mjs'
import { dbPath, initDb } from '../server/db.mjs'

const force = process.argv.includes('--force')
const retryFailed = process.argv.includes('--retry-failed')

await initDb()
console.log(`Database: ${dbPath()}`)
if (retryFailed) {
  console.log('Retrying failed tickers only (slow pass, force refresh)…')
} else {
  console.log(force ? 'Forcing full snapshot…' : 'Building snapshot if stale/missing…')
}

try {
  const result = retryFailed
    ? await runRetryFailedSnapshot()
    : await runUniverseSnapshot({ force })
  console.log(JSON.stringify(result, null, 2))
  process.exit(0)
} catch (err) {
  console.error(err)
  process.exit(1)
}
