# Self-host (local or VPS) — SQLite backend

Live ASX prices come from `yahoo-finance2`. OHLCV bars, breadth history, and
universe snapshots persist in **SQLite** (`data/asx.sqlite` by default).

> Render is no longer the recommended host for this app (ephemeral disk). Prefer
> a machine/VPS with durable storage.

## Requirements

- **Node.js 22+** (uses built-in `node:sqlite`)
- Network access to Yahoo Finance

## Quick start

```powershell
cd "C:\Trade Analysis\ashok-trade-analysis"
npm install
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
| `AUTH_SECRET` + `AUTH_USERS` | Optional login gate |
| `API_RATE_LIMIT` | Max `/api/series` requests per IP per minute (default `180`) |
| `DATABASE_PATH` | SQLite file path (default `./data/asx.sqlite`) |
| `PORT` | Prod listen port (default `4173`) |

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
| `npm run snapshot -- --force` | Force re-pull from Yahoo |
| `npm run refresh:asx200` | Refresh ASX200 list from free IOZ holdings |
| `GET /api/health` | DB path, snapshot freshness, job status |
| `GET /api/snapshot` | Full CachedPerf map for the SPA |
| `POST /api/snapshot/refresh` | Kick a background rebuild |

## Notes

- First snapshot crawl of ~2k tickers is slow (Yahoo rate limits). Later runs use SQLite bars + incremental refresh.
- API logs are JSON lines on stdout (`series.ok`, `rate_limited`, `snapshot.refresh`, `alerts.evaluate`, …).
- The SPA prefers a **fresh** server snapshot (`< 12h`); otherwise it falls back to progressive browser fetches.
- Breadth “This Month” / SMA history accumulates via `/api/breadth/daily` in SQLite.
- Keep `data/` out of git (already gitignored) — it holds the DB and IOZ download scratch.
