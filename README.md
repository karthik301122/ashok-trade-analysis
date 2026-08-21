# ASX Sector Intelligence

Australian-market sector intelligence desk for Ashok — same workflow as TradeGuru-style sector panels, built for **ASX** stocks with **ASX200** as the benchmark.

## Features

- **Sector Table** — expandable industries/stocks, mood, cycle, heatmapped returns, star stocks, copy to TradingView (`ASX:TICKER`)
- **Money Rotation** — capital flow in/out vs ASX200 (3M / 1M / 1W)
- **Rotation Clock** — Early / Mid / Late / Exit cycle map
- **Sector Analytics** — % above MA, relative strength, near 52W high + strong industries/stocks
- **Industry Analytics** — filterable industry rankings
- **Breadth Analysis** — market breadth overview
- Light / dark mode

## Run

```bash
npm install
npm run dev
```

Open the local URL Vite prints (usually `http://localhost:5173`).

## Data

Loads **live ASX prices** via **yahoo-finance2** (local Vite middleware — better full-market coverage than the public Yahoo chart proxy).

- Universe: **~1,977 ASX listed companies**
- Progressive load — UI appears after ~100 stocks, then fills toward the full list
- Returns, MAs, RS, 52W, star flags from daily closes
- Compact metrics cached for **6 hours**
- **Refresh live** forces a new pull
- Rebuild list: `npm run build:universe`
- Health check: `http://localhost:5173/api/health`

### Star stocks

A **star stock** outperformed **ASX200** over the **last 3 months**.

In Sector Table: **★ Star Stocks** filter + **Copy N star stocks** for TradingView (`ASX:TICKER`).
