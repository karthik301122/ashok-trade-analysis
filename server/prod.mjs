import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  authEnabled,
  assertAuthConfigured,
} from './auth.mjs'
import { mountExpressApi } from './apiHandlers.mjs'
import { loadEnvFile } from './loadEnv.mjs'
import { maybeStartBackgroundSnapshot } from './snapshotJob.mjs'
import { maybeStartLiveQuoteScheduler } from './liveQuoteJob.mjs'
import { maybeStartIndexMembersScheduler } from './indexMembersJob.mjs'
import { maybeStartAsxFilingsScheduler } from './asxFilingsJob.mjs'
import { maybeStartDeskSyncScheduler } from './deskSyncJob.mjs'
import { dbPath, dbStoreLabel, initDb } from './db.mjs'
import { maintenanceMiddleware } from './maintenance.mjs'

loadEnvFile()

try {
  assertAuthConfigured()
} catch (err) {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const dist = path.join(root, 'dist')
const port = Number(process.env.PORT) || 4173

const app = express()
app.set('trust proxy', 1)
app.use(express.json({ limit: '8mb' }))
app.use(maintenanceMiddleware)

await initDb()

// Static assets first so HTML/JS/CSS never wait behind snapshot/API work.
app.use(
  express.static(dist, {
    index: false,
    maxAge: '1h',
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-store')
      }
    },
  }),
)

mountExpressApi(app)

app.get(/.*/, (_req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.sendFile(path.join(dist, 'index.html'))
})

app.listen(port, '0.0.0.0', () => {
  console.log(`ASX Sector Intelligence running on http://localhost:${port}`)
  console.log(`Database: ${dbPath()} (${dbStoreLabel()})`)
  console.log(authEnabled() ? 'Auth: enabled (login required)' : 'Auth: disabled (set AUTH_SECRET)')
  // Light schedulers only at first. Full snapshot rebuild/auto-retry is opt-in /
  // deferred so boot never wedges the event loop for everyone.
  setTimeout(() => {
    maybeStartLiveQuoteScheduler()
    maybeStartIndexMembersScheduler()
    maybeStartAsxFilingsScheduler()
  }, 20_000)
  setTimeout(() => {
    maybeStartDeskSyncScheduler()
    // Opt-in only — automatic universe rebuild on boot has wedged production.
    if (process.env.SNAPSHOT_BACKGROUND_ON_BOOT === '1') {
      maybeStartBackgroundSnapshot()
    }
  }, 120_000)
})
