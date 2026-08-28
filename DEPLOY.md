# Self-host (local or VPS) — SQLite backend

Live ASX prices come from **EODHD** when `EODHD_API_TOKEN` is set (optional Yahoo fallback).
OHLCV bars, breadth history, and universe snapshots persist in **SQLite** (`data/asx.sqlite` by default).

> Render is no longer the recommended host for this app (ephemeral disk). Prefer
> a machine/VPS with durable storage.

## Requirements

- **Node.js 22+** (uses built-in `node:sqlite`)
- Network access to EODHD (or Yahoo if no token / fallback)

## Quick start

```powershell
cd "C:\Trade Analysis\ashok-trade-analysis"
npm install
# Copy .env.example → .env and set EODHD_API_TOKEN
npm run refresh:asx200    # free ASX200 membership via iShares IOZ
npm run snapshot          # build SQLite universe snapshot (takes several minutes first time)
npm run dev               # http://localhost:5173
```

Production:

```powershell
npm run build
npm start                 # http://localhost:4173 — also starts a background snapshot if stale
```

## Environment

See `.env.example`.

| Variable | Purpose |
|----------|---------|
| `EODHD_API_TOKEN` | EODHD API key — enables primary market data provider |
| `DATA_PROVIDER` | `auto` (default), `eodhd`, or `yahoo` |
| `EODHD_YAHOO_FALLBACK` | `true` (default) — Yahoo when EODHD has no bar for a ticker |
| `PRODUCTION_MODE` | `true` — shared server snapshot only (recommended for multi-user) |
| `ADMIN_USERS` | Comma list of usernames allowed to force snapshot rebuild |
| `ADMIN_API_KEY` | Optional `x-admin-key` header for cron (`POST /api/snapshot/refresh`) |
| `SERIES_RATE_LIMIT` | `/api/series` per IP per minute (default `600` in production) |
| `SNAPSHOT_RATE_LIMIT` | `/api/snapshot` GET per IP per minute (default `60` in production) |
| `AUTH_SECRET` + `AUTH_USERS` | Optional login gate |
| `DATABASE_PATH` | SQLite file path (default `./data/asx.sqlite`) |
| `PORT` | Prod listen port (default `4173`) |

### Multi-user production (200 users)

```powershell
# .env
PRODUCTION_MODE=true
EODHD_API_TOKEN=...
ADMIN_USERS=ops,admin
ADMIN_API_KEY=long-random-secret   # for scheduled snapshot cron
SERIES_RATE_LIMIT=600
```

- Users load **`GET /api/snapshot`** only — no browser crawl of ~2k tickers.
- Schedule: `curl -X POST -H "x-admin-key: $ADMIN_API_KEY" http://localhost:4173/api/snapshot/refresh?force=1`
- Check readiness: `GET /api/health` → `readiness.multiUserReady`

### Auth (optional)

```powershell
node scripts/hash-password.mjs "choose-a-strong-password"
$env:AUTH_SECRET = "dev-secret-change-me"
$env:AUTH_USERS = "ashok:<paste-hash-here>"
npm run dev
```

## Useful commands

| Command | What it does |
|---------|----------------|
| `npm run snapshot` | Build/refresh SQLite market snapshot |
| `npm run snapshot -- --force` | Force re-pull from EODHD |
| `npm run merge:eodhd-universe` | Add all EODHD AU symbols (ETFs, funds, notes) to universe |
| `npm run build:universe:full` | Rebuild from CSV + EODHD merge |
| `npm run refresh:asx200` | Refresh ASX200 list from free IOZ holdings |
| `GET /api/health` | DB path, snapshot freshness, job status |
| `GET /api/snapshot` | Full CachedPerf map for the SPA |
| `POST /api/snapshot/refresh` | Kick a background rebuild |

## Notes

- First snapshot crawl of ~2.5k AU instruments is slower on first EODHD pull. Later runs use SQLite bars + incremental refresh.
- API logs are JSON lines on stdout (`series.ok`, `rate_limited`, `snapshot.refresh`, `alerts.evaluate`, …).
- The SPA prefers a **fresh** server snapshot (`< 12h`); otherwise it falls back to progressive browser fetches.
- Breadth “This Month” / SMA history accumulates via `/api/breadth/daily` in SQLite.
- Keep `data/` out of git (already gitignored) — it holds the DB and IOZ download scratch.
