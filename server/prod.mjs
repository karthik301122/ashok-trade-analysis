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
import { dbPath } from './db.mjs'

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
app.use(express.json({ limit: '8mb' }))

mountExpressApi(app)

app.use(express.static(dist))

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(dist, 'index.html'))
})

app.listen(port, () => {
  console.log(`ASX Sector Intelligence running on http://localhost:${port}`)
  console.log(`SQLite: ${dbPath()}`)
  console.log(authEnabled() ? 'Auth: enabled (login required)' : 'Auth: disabled (set AUTH_SECRET)')
  maybeStartBackgroundSnapshot()
})
