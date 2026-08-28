# Self-host (local or VPS) — SQLite backend

Live ASX prices come from **EODHD** when `EODHD_API_TOKEN` is set (optional Yahoo fallback).
OHLCV bars, breadth history, and universe snapshots persist in **SQLite** (`data/asx.sqlite` by default).

> Render works but needs **EODHD_API_TOKEN** and a first snapshot build. Disk is
> ephemeral — snapshot is rebuilt after deploy (see `render.yaml`).

## Render (ashoktrades.onrender.com)

1. **Environment variables** — set in `render.yaml` (auto on deploy) or Render dashboard:

   | Variable | Required | Notes |
   |----------|----------|--------|
   | `EODHD_API_TOKEN` | **Yes** | In `render.yaml` for now — rotate and move to dashboard secret later |
   | `PRODUCTION_MODE` | Yes | `true` (in `render.yaml`) |
   | `DATA_PROVIDER` | Yes | `eodhd` (in `render.yaml`) |
   | `AUTH_SECRET` | If login enabled | Session signing key |
   | `AUTH_USERS` | If login enabled | `user:$2b$...` bcrypt hashes |
   | `ADMIN_USERS` | Optional | Users who can force snapshot refresh |
   | `ADMIN_API_KEY` | Optional | Cron header `x-admin-key` for `POST /api/snapshot/refresh` |

2. **After deploy**, check readiness:

   ```text
   https://ashoktrades.onrender.com/api/health
   ```

   Wait until `readiness.snapshotAcceptable` is `true` (first build ~5–10 min).

3. **Force rebuild** (admin):

   ```bash
   curl -X POST -H "x-admin-key: YOUR_ADMIN_API_KEY" \
     "https://ashoktrades.onrender.com/api/snapshot/refresh?force=1"
   ```

4. **Ephemeral disk**: SQLite is wiped on redeploy. Schedule a daily cron on Render
   (or external) to `POST /api/snapshot/refresh` with `x-admin-key`.

> For production at scale, prefer a VPS with persistent disk (see below).

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
