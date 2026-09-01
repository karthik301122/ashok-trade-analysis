/**
 * Refresh breadth universe membership from EODHD Fundamentals index components.
 *
 * ASX 200 (AXJO), All Ordinaries / Top 500 (AORD), Small Ordinaries (AXSO).
 * Mid = Top 500 minus ASX 200.
 *
 * Usage:
 *   npm run refresh:index-members
 *
 * Cost: ~10 EODHD API calls per index ≈ 30 calls per refresh.
 */
import { loadEnvFile } from '../server/loadEnv.mjs'
import { refreshIndexMembersFromEodhd } from '../server/eodhdIndexMembers.mjs'

loadEnvFile()

const result = await refreshIndexMembersFromEodhd()
if (result.skipped) {
  console.log(`Skipped: ${result.reason}`)
  process.exit(0)
}
console.log(JSON.stringify(result, null, 2))
