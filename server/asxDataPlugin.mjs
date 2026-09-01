/**
 * Vite middleware: ASX prices via EODHD (or Yahoo fallback) + SQLite cache/snapshot.
 */
import { handleConnectApi } from './apiHandlers.mjs'
import { assertAuthConfigured } from './auth.mjs'
import { loadEnvFile } from './loadEnv.mjs'
import { initDb } from './db.mjs'
import { maybeStartBackgroundSnapshot } from './snapshotJob.mjs'

loadEnvFile()

function sendJson(res, status, body, extraHeaders = {}) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  for (const [k, v] of Object.entries(extraHeaders)) {
    res.setHeader(k, v)
  }
  res.end(JSON.stringify(body))
}

export function asxDataPlugin() {
  return {
    name: 'asx-data-api',
    configureServer(server) {
      assertAuthConfigured()
      void initDb().then(() => maybeStartBackgroundSnapshot())
      server.middlewares.use(async (req, res, next) => {
        try {
          const send = (status, body, headers) => sendJson(res, status, body, headers)
          const handled = await handleConnectApi(req, res, send)
          if (handled) return
          return next()
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          return sendJson(res, 500, { error: message })
        }
      })
    },
  }
}
