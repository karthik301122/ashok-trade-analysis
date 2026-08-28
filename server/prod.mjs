import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  authEnabled,
  sessionClearCookieHeader,
  sessionSetCookieHeader,
  createSessionToken,
  verifyCredentials,
} from './auth.mjs'
import { mountExpressApi } from './apiHandlers.mjs'
import { loadEnvFile } from './loadEnv.mjs'
import { maybeStartBackgroundSnapshot } from './snapshotJob.mjs'
import { dbPath } from './db.mjs'

loadEnvFile()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const dist = path.join(root, 'dist')
const port = Number(process.env.PORT) || 4173

const app = express()
app.use(express.json({ limit: '8mb' }))

mountExpressApi(app)

app.post('/api/auth/login', async (req, res) => {
  if (!authEnabled()) {
    return res.status(400).json({ error: 'Auth is not configured on this server' })
  }
  const user = await verifyCredentials(req.body?.username, req.body?.password)
  if (!user) return res.status(401).json({ error: 'Invalid username or password' })
  const token = createSessionToken(user)
  res.setHeader('Set-Cookie', sessionSetCookieHeader(token))
  return res.json({ user })
})

app.post('/api/auth/logout', (_req, res) => {
  res.setHeader('Set-Cookie', sessionClearCookieHeader())
  return res.json({ ok: true })
})

app.use(express.static(dist))

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(dist, 'index.html'))
})

app.listen(port, () => {
  console.log(`ASX Sector Intelligence running on http://localhost:${port}`)
  console.log(`SQLite: ${dbPath()}`)
  console.log(authEnabled() ? 'Auth: enabled' : 'Auth: disabled (set AUTH_USERS + AUTH_SECRET)')
  maybeStartBackgroundSnapshot()
})
