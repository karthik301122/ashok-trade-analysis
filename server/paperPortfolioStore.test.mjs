import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initDb, sqlRun } from './db.mjs'
import {
  PAPER_STARTING_CASH,
  getOrCreatePortfolio,
  listTrades,
  placeMarketOrder,
  resetPortfolio,
} from './paperPortfolioStore.mjs'

vi.mock('./liveQuotes.mjs', () => ({
  readLiveQuotesMap: async () =>
    new Map([
      ['BHP', { close: 40, change_p: 0, volume: 0, updated_at: Date.now() }],
      ['CBA', { close: 100, change_p: 0, volume: 0, updated_at: Date.now() }],
    ]),
  getLiveQuotesMeta: async () => ({ usable: true }),
}))

vi.mock('./snapshotJob.mjs', () => ({
  peekCachedLastPrices: () => ({}),
}))

describe('paperPortfolioStore', () => {
  beforeEach(async () => {
    await initDb()
    await sqlRun('DELETE FROM paper_trades')
    await sqlRun('DELETE FROM paper_positions')
    await sqlRun('DELETE FROM paper_accounts')
  })

  it('creates a portfolio with starting cash', async () => {
    const p = await getOrCreatePortfolio('learner@example.com')
    expect(p.cash).toBe(PAPER_STARTING_CASH)
    expect(p.equity).toBe(PAPER_STARTING_CASH)
    expect(p.positions).toEqual([])
  })

  it('buys and sells at the live price', async () => {
    const buy = await placeMarketOrder('learner@example.com', {
      ticker: 'bhp',
      side: 'buy',
      qty: 100,
    })
    expect(buy.ok).toBe(true)
    expect(buy.fill.price).toBe(40)
    expect(buy.portfolio.cash).toBe(PAPER_STARTING_CASH - 4000)
    expect(buy.portfolio.positions).toHaveLength(1)
    expect(buy.portfolio.positions[0].ticker).toBe('BHP')
    expect(buy.portfolio.positions[0].qty).toBe(100)

    const sell = await placeMarketOrder('learner@example.com', {
      ticker: 'BHP',
      side: 'sell',
      qty: 40,
    })
    expect(sell.ok).toBe(true)
    expect(sell.portfolio.positions[0].qty).toBe(60)
    expect(sell.portfolio.cash).toBe(PAPER_STARTING_CASH - 4000 + 1600)

    const trades = await listTrades('learner@example.com')
    expect(trades).toHaveLength(2)
    expect(trades[0].side).toBe('sell')
    expect(trades[1].side).toBe('buy')
  })

  it('rejects insufficient cash and oversell', async () => {
    const tooBig = await placeMarketOrder('learner@example.com', {
      ticker: 'CBA',
      side: 'buy',
      qty: 10_000,
    })
    expect(tooBig.ok).toBe(false)
    expect(tooBig.error).toMatch(/Insufficient cash/i)

    await placeMarketOrder('learner@example.com', { ticker: 'BHP', side: 'buy', qty: 10 })
    const oversell = await placeMarketOrder('learner@example.com', {
      ticker: 'BHP',
      side: 'sell',
      qty: 50,
    })
    expect(oversell.ok).toBe(false)
    expect(oversell.error).toMatch(/Not enough shares/i)
  })

  it('resets cash, positions, and trades', async () => {
    await placeMarketOrder('learner@example.com', { ticker: 'BHP', side: 'buy', qty: 50 })
    const reset = await resetPortfolio('learner@example.com')
    expect(reset.cash).toBe(PAPER_STARTING_CASH)
    expect(reset.positions).toEqual([])
    expect(await listTrades('learner@example.com')).toEqual([])
  })
})
