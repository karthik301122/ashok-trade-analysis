import YahooFinance from 'yahoo-finance2'

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] })

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * @param {string} symbol Yahoo symbol e.g. CBA.AX or ^AXJO
 * @param {string} [period1] ISO date
 */
export async function fetchChartCloses(symbol, period1 = '2023-01-01') {
  let lastErr = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await yf.chart(symbol, {
        period1,
        interval: '1d',
      })
      const quotes = (result.quotes || []).filter((q) => q.close != null && Number.isFinite(q.close))
      // Allow thin history for microcaps (was 30 — too strict)
      if (quotes.length < 15) return null

      const closes = quotes.map((q) => ({
        t: Math.floor(new Date(q.date).getTime() / 1000),
        c: Number(q.close),
        v: Number.isFinite(q.volume) ? Number(q.volume) : 0,
      }))
      const last = closes[closes.length - 1].c
      const yearAgo = closes[closes.length - 1].t - 365 * 24 * 3600
      const lastYear = closes.filter((b) => b.t >= yearAgo)
      const high52 = Math.max(...lastYear.map((b) => b.c), last)

      return {
        symbol,
        closes,
        last,
        high52,
        meta: {
          currency: result.meta?.currency,
          exchange: result.meta?.exchangeName,
          instrument: result.meta?.instrumentType,
        },
      }
    } catch (err) {
      lastErr = err
      await sleep(400 * (attempt + 1) + Math.random() * 300)
    }
  }
  if (lastErr) return null
  return null
}

export async function fetchAsxTicker(ticker, period1) {
  return fetchChartCloses(`${String(ticker).toUpperCase()}.AX`, period1)
}

export async function fetchAsx200(period1) {
  return fetchChartCloses('^AXJO', period1)
}
