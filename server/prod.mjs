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
app.disable('x-powered-by')
app.set('trust proxy', 1)

  /** Baseline security headers. */
app.use((_req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; script-src 'self' 'unsafe-inline'; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  )
  next()
})

// Skip JSON parser for Stripe webhook so mountExpressApi can use express.raw.
app.use((req, res, next) => {
  if (req.path === '/api/billing/webhook') return next()
  return express.json({ limit: '8mb' })(req, res, next)
})
app.use(maintenanceMiddleware)

await initDb()

try {
  const { initSentry } = await import('./observability.mjs')
  await initSentry()
} catch {
  /* optional */
}

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

// SPA shell: known app entry stays 200; unknown paths return real 404 (still serve the app HTML).
function sendSpa(res, status = 200) {
  res.status(status)
  res.setHeader('Cache-Control', 'no-store')
  res.sendFile(path.join(dist, 'index.html'))
}

const SPA_OK = new Set(['/', '/index.html', '/terms', '/privacy', '/how', '/invite'])

app.get(/.*/, (req, res) => {
  const pathOnly = (req.path || '/').split('?')[0] || '/'
  if (SPA_OK.has(pathOnly)) return sendSpa(res, 200)
  return sendSpa(res, 404)
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
    void import('./indexAnalysis.mjs')
      .then(({ warmIndexAnalysisSeries }) => {
        warmIndexAnalysisSeries()
        console.log('[index-analysis] sector index cache warm started')
      })
      .catch(() => {})
  }, 20_000)
  setTimeout(() => {
    maybeStartDeskSyncScheduler()
    // Opt-in only — automatic universe rebuild on boot has wedged production.
    if (process.env.SNAPSHOT_BACKGROUND_ON_BOOT === '1') {
      maybeStartBackgroundSnapshot()
    }
    // Ensure today's pattern hits exist even if the last snapshot finished before the job ran.
    void import('./patternJob.mjs')
      .then(({ maybeStartFullUniversePatternJob }) => maybeStartFullUniversePatternJob())
      .catch(() => {})
    void import('./dailyScanJob.mjs')
      .then(({ maybeStartDailyScanJob }) => maybeStartDailyScanJob({ delayMs: 30_000 }))
      .catch(() => {})
    void import('./marketNoteJob.mjs')
      .then(({ maybeStartMarketNoteJob }) => maybeStartMarketNoteJob({ delayMs: 60_000 }))
      .catch(() => {})
  }, 120_000)
})
