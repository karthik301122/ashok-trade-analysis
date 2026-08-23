import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { fetchAsx200, fetchAsxTicker, fetchChartCloses } from './yf.mjs'
import {
  authEnabled,
  getUserFromRequest,
  sessionClearCookieHeader,
  sessionSetCookieHeader,
  createSessionToken,
  verifyCredentials,
} from './auth.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const dist = path.join(root, 'dist')
const port = Number(process.env.PORT) || 4173

const app = express()
app.use(express.json({ limit: '32kb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, provider: 'yahoo-finance2', authRequired: authEnabled() })
})

app.get('/api/auth/me', (req, res) => {
  if (!authEnabled()) {
    return res.json({ user: null, authRequired: false })
  }
  const user = getUserFromRequest(req)
  if (!user) return res.status(401).json({ user: null, authRequired: true })
  return res.json({ user, authRequired: true })
})

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

app.get('/api/series/:ticker', async (req, res) => {
  if (authEnabled() && !getUserFromRequest(req)) {
    return res.status(401).json({ error: 'Unauthorized', authRequired: true })
  }
  try {
    const ticker = decodeURIComponent(req.params.ticker).toUpperCase()
    if (!ticker || !/^[A-Z0-9.^=\-]{1,20}$/.test(ticker)) {
      return res.status(400).json({ error: 'Invalid ticker' })
    }
    const from = typeof req.query.from === 'string' ? req.query.from : '2023-01-01'
    const isIndex = ticker === '^AXJO' || ticker === 'XJO' || ticker === 'ASX200'
    const isRawYahoo = ticker.includes('=') || ticker.includes('-') || ticker.includes('.')
    const data = isIndex
      ? await fetchAsx200(from)
      : isRawYahoo
        ? await fetchChartCloses(ticker, from)
        : await fetchAsxTicker(ticker, from)
    if (!data) return res.status(404).json({ error: 'No series', ticker })
    return res.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: message })
  }
})

app.use(express.static(dist))

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(dist, 'index.html'))
})

app.listen(port, () => {
  console.log(`ASX Sector Intelligence running on http://localhost:${port}`)
  console.log(authEnabled() ? 'Auth: enabled' : 'Auth: disabled (set AUTH_USERS + AUTH_SECRET)')
})
