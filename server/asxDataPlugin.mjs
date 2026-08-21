/**
 * Vite middleware: ASX prices via yahoo-finance2 (server-side).
 * Much better small-cap coverage than the public Yahoo chart HTTP proxy.
 */
import { fetchAsx200, fetchAsxTicker, fetchChartCloses } from './yf.mjs'

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function readUrl(req) {
  return new URL(req.url || '/', 'http://localhost')
}

export function asxDataPlugin() {
  return {
    name: 'asx-data-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const url = readUrl(req)
          if (!url.pathname.startsWith('/api/')) return next()

          // GET /api/series/CBA?from=2023-01-01
          if (url.pathname.startsWith('/api/series/')) {
            const ticker = decodeURIComponent(url.pathname.replace('/api/series/', '')).toUpperCase()
            if (!ticker || !/^[A-Z0-9.^]{1,12}$/.test(ticker)) {
              return sendJson(res, 400, { error: 'Invalid ticker' })
            }
            const from = url.searchParams.get('from') || '2023-01-01'
            const data =
              ticker === '^AXJO' || ticker === 'XJO' || ticker === 'ASX200'
                ? await fetchAsx200(from)
                : ticker.includes('.')
                  ? await fetchChartCloses(ticker, from)
                  : await fetchAsxTicker(ticker, from)
            if (!data) return sendJson(res, 404, { error: 'No series', ticker })
            return sendJson(res, 200, data)
          }

          // GET /api/health
          if (url.pathname === '/api/health') {
            return sendJson(res, 200, { ok: true, provider: 'yahoo-finance2' })
          }

          return next()
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          return sendJson(res, 500, { error: message })
        }
      })
    },
  }
}
