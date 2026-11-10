import crypto from 'crypto'
import { sqlAll, sqlOne, sqlRun, withTransaction } from './db.mjs'
import { normalizeUsername } from './userStore.mjs'
import { readLiveQuotesMap } from './liveQuotes.mjs'
import { peekCachedLastPrices } from './snapshotJob.mjs'

export const PAPER_STARTING_CASH = 100_000

function normalizeTicker(ticker) {
  const t = String(ticker || '')
    .trim()
    .toUpperCase()
  if (!/^[A-Z0-9.^=-]{1,20}$/.test(t)) return null
  return t
}

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100
}

function roundQty(n) {
  return Math.round(Number(n) * 10000) / 10000
}

/**
 * Best available desk fill price: live overlay → in-memory lastPrices → series_meta.
 * @param {string} ticker
 * @returns {Promise<{ price: number, source: string } | null>}
 */
export async function resolveFillPrice(ticker) {
  const t = normalizeTicker(ticker)
  if (!t) return null

  try {
    const live = await readLiveQuotesMap()
    const q = live.get(t)
    if (q && Number(q.close) > 0) {
      return { price: Number(q.close), source: 'live' }
    }
  } catch {
    /* fall through */
  }

  const cached = peekCachedLastPrices()
  const fromCache = Number(cached?.[t])
  if (Number.isFinite(fromCache) && fromCache > 0) {
    return { price: fromCache, source: 'cache' }
  }

  try {
    const row = await sqlOne('SELECT last FROM series_meta WHERE symbol = ?', [t])
    const last = Number(row?.last)
    if (Number.isFinite(last) && last > 0) {
      return { price: last, source: 'series_meta' }
    }
  } catch {
    /* no series */
  }
  return null
}

/**
 * @param {string[]} tickers
 * @returns {Promise<Record<string, number>>}
 */
async function resolveMarks(tickers) {
  /** @type {Record<string, number>} */
  const out = {}
  if (!tickers.length) return out

  let live = new Map()
  try {
    live = await readLiveQuotesMap()
  } catch {
    live = new Map()
  }
  const cached = peekCachedLastPrices()

  const missing = []
  for (const t of tickers) {
    const q = live.get(t)
    if (q && Number(q.close) > 0) {
      out[t] = Number(q.close)
      continue
    }
    const c = Number(cached?.[t])
    if (Number.isFinite(c) && c > 0) {
      out[t] = c
      continue
    }
    missing.push(t)
  }

  for (const t of missing) {
    try {
      const row = await sqlOne('SELECT last FROM series_meta WHERE symbol = ?', [t])
      const last = Number(row?.last)
      if (Number.isFinite(last) && last > 0) out[t] = last
    } catch {
      /* skip */
    }
  }
  return out
}

async function ensureAccount(username) {
  const u = normalizeUsername(username)
  const existing = await sqlOne(
    `SELECT username, cash, starting_cash AS "startingCash", updated_at AS "updatedAt"
     FROM paper_accounts WHERE username = ?`,
    [u],
  )
  if (existing) {
    return {
      username: u,
      cash: Number(existing.cash),
      startingCash: Number(existing.startingCash),
      updatedAt: Number(existing.updatedAt),
    }
  }
  const now = Date.now()
  await sqlRun(
    `INSERT INTO paper_accounts (username, cash, starting_cash, updated_at) VALUES (?, ?, ?, ?)`,
    [u, PAPER_STARTING_CASH, PAPER_STARTING_CASH, now],
  )
  return {
    username: u,
    cash: PAPER_STARTING_CASH,
    startingCash: PAPER_STARTING_CASH,
    updatedAt: now,
  }
}

async function listPositions(username) {
  const u = normalizeUsername(username)
  const rows = await sqlAll(
    `SELECT ticker, qty, avg_cost AS "avgCost", updated_at AS "updatedAt"
     FROM paper_positions WHERE username = ? AND qty > 0
     ORDER BY ticker`,
    [u],
  )
  return rows.map((r) => ({
    ticker: String(r.ticker),
    qty: Number(r.qty),
    avgCost: Number(r.avgCost),
    updatedAt: Number(r.updatedAt),
  }))
}

/**
 * @param {string} username
 */
export async function getOrCreatePortfolio(username) {
  const account = await ensureAccount(username)
  const positions = await listPositions(username)
  const marks = await resolveMarks(positions.map((p) => p.ticker))

  let positionsValue = 0
  let costBasis = 0
  const marked = positions.map((p) => {
    const mark = marks[p.ticker] ?? p.avgCost
    const marketValue = roundMoney(mark * p.qty)
    const cost = roundMoney(p.avgCost * p.qty)
    const unrealizedPnl = roundMoney(marketValue - cost)
    positionsValue += marketValue
    costBasis += cost
    return {
      ...p,
      mark: roundMoney(mark),
      marketValue,
      costBasis: cost,
      unrealizedPnl,
      unrealizedPnlPct: cost > 0 ? roundMoney((unrealizedPnl / cost) * 100) : 0,
    }
  })

  const cash = roundMoney(account.cash)
  const equity = roundMoney(cash + positionsValue)
  const starting = roundMoney(account.startingCash)
  const totalPnl = roundMoney(equity - starting)
  const totalPnlPct = starting > 0 ? roundMoney((totalPnl / starting) * 100) : 0

  return {
    username: account.username,
    cash,
    startingCash: starting,
    positionsValue: roundMoney(positionsValue),
    equity,
    totalPnl,
    totalPnlPct,
    positions: marked,
    updatedAt: account.updatedAt,
  }
}

/**
 * @param {string} username
 * @param {{ ticker?: string, side?: string, qty?: number, fillPrice?: number, source?: string }} order
 */
export async function placeMarketOrder(username, order = {}) {
  const u = normalizeUsername(username)
  const ticker = normalizeTicker(order.ticker)
  if (!ticker) {
    return { ok: false, status: 400, error: 'Invalid ticker' }
  }
  const side = String(order.side || '')
    .trim()
    .toLowerCase()
  if (side !== 'buy' && side !== 'sell') {
    return { ok: false, status: 400, error: 'side must be buy or sell' }
  }
  const qty = roundQty(order.qty)
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, status: 400, error: 'Quantity must be a positive number' }
  }

  const forced = Number(order.fillPrice)
  let price
  let priceSource
  if (Number.isFinite(forced) && forced > 0) {
    price = roundMoney(forced)
    priceSource = String(order.source || 'replay').slice(0, 32)
  } else {
    const fill = await resolveFillPrice(ticker)
    if (!fill) {
      return {
        ok: false,
        status: 400,
        error: `No price available for ${ticker}. Try again when the desk has a live or last price.`,
      }
    }
    price = roundMoney(fill.price)
    priceSource = String(order.source || fill.source || 'desk').slice(0, 32)
  }
  const notional = roundMoney(price * qty)

  await ensureAccount(u)

  try {
    await withTransaction(async (tx) => {
      const acct = await tx.sqlOne(`SELECT cash FROM paper_accounts WHERE username = ?`, [u])
      const cash = Number(acct?.cash) || 0
      const pos = await tx.sqlOne(
        `SELECT qty, avg_cost AS "avgCost" FROM paper_positions WHERE username = ? AND ticker = ?`,
        [u, ticker],
      )
      const held = Number(pos?.qty) || 0
      const avgCost = Number(pos?.avgCost) || 0
      const now = Date.now()

      if (side === 'buy') {
        if (notional > cash + 1e-9) {
          throw Object.assign(new Error('Insufficient cash for this buy'), { status: 400 })
        }
        const newQty = roundQty(held + qty)
        const newAvg =
          newQty > 0 ? roundMoney((avgCost * held + price * qty) / newQty) : price
        const newCash = roundMoney(cash - notional)
        await tx.sqlRun(`UPDATE paper_accounts SET cash = ?, updated_at = ? WHERE username = ?`, [
          newCash,
          now,
          u,
        ])
        if (held > 0) {
          await tx.sqlRun(
            `UPDATE paper_positions SET qty = ?, avg_cost = ?, updated_at = ? WHERE username = ? AND ticker = ?`,
            [newQty, newAvg, now, u, ticker],
          )
        } else {
          await tx.sqlRun(
            `INSERT INTO paper_positions (username, ticker, qty, avg_cost, updated_at) VALUES (?, ?, ?, ?, ?)`,
            [u, ticker, newQty, newAvg, now],
          )
        }
      } else {
        if (qty > held + 1e-9) {
          throw Object.assign(new Error(`Not enough shares to sell (held ${held})`), {
            status: 400,
          })
        }
        const newQty = roundQty(held - qty)
        const newCash = roundMoney(cash + notional)
        await tx.sqlRun(`UPDATE paper_accounts SET cash = ?, updated_at = ? WHERE username = ?`, [
          newCash,
          now,
          u,
        ])
        if (newQty <= 1e-9) {
          await tx.sqlRun(`DELETE FROM paper_positions WHERE username = ? AND ticker = ?`, [
            u,
            ticker,
          ])
        } else {
          await tx.sqlRun(
            `UPDATE paper_positions SET qty = ?, updated_at = ? WHERE username = ? AND ticker = ?`,
            [newQty, now, u, ticker],
          )
        }
      }

      const id = crypto.randomUUID()
      await tx.sqlRun(
        `INSERT INTO paper_trades (id, username, ticker, side, qty, price, created_at, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, u, ticker, side, qty, price, now, priceSource],
      )
    })
  } catch (err) {
    const status = Number(err?.status) || 500
    return {
      ok: false,
      status,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  const portfolio = await getOrCreatePortfolio(u)
  return {
    ok: true,
    fill: { ticker, side, qty, price, source: priceSource, notional },
    portfolio,
  }
}

/**
 * @param {string} username
 * @param {{ limit?: number }} [opts]
 */
export async function listTrades(username, opts = {}) {
  const u = normalizeUsername(username)
  await ensureAccount(u)
  const limit = Math.min(200, Math.max(1, Number(opts.limit) || 50))
  const rows = await sqlAll(
    `SELECT id, ticker, side, qty, price, created_at AS "createdAt"
     FROM paper_trades WHERE username = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [u, limit],
  )
  return rows.map((r) => ({
    id: String(r.id),
    ticker: String(r.ticker),
    side: String(r.side),
    qty: Number(r.qty),
    price: Number(r.price),
    createdAt: Number(r.createdAt),
  }))
}

/**
 * @param {string} username
 */
export async function resetPortfolio(username) {
  const u = normalizeUsername(username)
  const now = Date.now()
  await withTransaction(async (tx) => {
    await tx.sqlRun(`DELETE FROM paper_trades WHERE username = ?`, [u])
    await tx.sqlRun(`DELETE FROM paper_positions WHERE username = ?`, [u])
    const existing = await tx.sqlOne(`SELECT username FROM paper_accounts WHERE username = ?`, [u])
    if (existing) {
      await tx.sqlRun(
        `UPDATE paper_accounts SET cash = starting_cash, updated_at = ? WHERE username = ?`,
        [now, u],
      )
    } else {
      await tx.sqlRun(
        `INSERT INTO paper_accounts (username, cash, starting_cash, updated_at) VALUES (?, ?, ?, ?)`,
        [u, PAPER_STARTING_CASH, PAPER_STARTING_CASH, now],
      )
    }
  })
  return getOrCreatePortfolio(u)
}
