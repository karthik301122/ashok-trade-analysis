import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { fetchAsx200, fetchAsxTicker, fetchChartCloses } from './yf.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const dist = path.join(root, 'dist')
const port = Number(process.env.PORT) || 4173

const app = express()

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, provider: 'yahoo-finance2' })
})

app.get('/api/series/:ticker', async (req, res) => {
  try {
    const ticker = decodeURIComponent(req.params.ticker).toUpperCase()
    if (!ticker || !/^[A-Z0-9.^]{1,12}$/.test(ticker)) {
      return res.status(400).json({ error: 'Invalid ticker' })
    }
    const from = typeof req.query.from === 'string' ? req.query.from : '2023-01-01'
    const data =
      ticker === '^AXJO' || ticker === 'XJO' || ticker === 'ASX200'
        ? await fetchAsx200(from)
        : ticker.includes('.')
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
})
