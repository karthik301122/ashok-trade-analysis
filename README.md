# ASX Sector Intelligence

Australian-market sector intelligence desk for Ashok — same workflow as TradeGuru-style sector panels, built for **ASX** stocks with **ASX200** as the benchmark.

## Features

- **Sector Table** — expandable industries/stocks, mood, cycle, heatmapped returns, star stocks, copy to TradingView (`ASX:TICKER`)
- **Money Rotation** — capital flow in/out vs ASX200 (3M / 1M / 1W)
- **Rotation Clock** — Early / Mid / Late / Exit cycle map (rule-based heuristic)
- **Sector Analytics** — % above MA, relative strength heuristic, near 52W high + strong industries/stocks
- **Industry Analytics** — filterable industry rankings
- **Breadth Analysis** — market breadth overview (universe filters are weight-rank proxies, not official index membership)
- **Pattern scan** — only implemented detectors (~36); no fake catalog padding
- Light / dark mode

## Data honesty

- Live prices via **yahoo-finance2**. If live load fails with no cache, the UI shows an error — it does **not** invent a demo market.
- Status badge: `LOADING` / `PARTIAL` / `LIVE` (partial when the loaded book is incomplete).
- RS score is `50 + (3M − index 3M) × 2.2`, not an IBD-style RS rating.
- “This Month” breadth tab is live calendar-month returns, not multi-year seasonality.
- **SQLite** (`data/asx.sqlite`): OHLCV bars, breadth daily points, full-market snapshot (run `npm run snapshot`).
- Universe membership: free path is iShares **IOZ** holdings (`npm run refresh:asx200`). Optional own CSV via `INDEX_ASX200_CSV`.
- **Alerts** page: RS / RVOL / breadth / excess-return rules + optional webhook (`POST /api/alerts/evaluate`).
- Stock chart modal shows **fundamentals** (PE, fwd PE, yield, mcap) from Yahoo, cached in SQLite.

## Run

```bash
npm install
npm run dev
```

Open the local URL Vite prints (usually `http://localhost:5173`).

## Data

Loads **live ASX prices** via **yahoo-finance2** (Vite middleware / Express).

- Universe: **~1,977 ASX listed companies**
- **SQLite** (`data/asx.sqlite`): OHLCV bars, breadth daily points, full-market snapshot
- Prefer server snapshot when fresh (`npm run snapshot`); else progressive browser load
- Compact metrics also cached in the browser for **6 hours**
- **Refresh live** forces a new pull
- Rebuild list: `npm run build:universe`
- ASX200 membership (free): `npm run refresh:asx200`
- Health check: `http://localhost:5173/api/health`

See [DEPLOY.md](./DEPLOY.md) for self-host + SQLite notes.

### Star stocks

A **star stock** outperformed **ASX200** over the **last 3 months**.

In Sector Table: **★ Star Stocks** filter + **Copy N star stocks** for TradingView (`ASX:TICKER`).
