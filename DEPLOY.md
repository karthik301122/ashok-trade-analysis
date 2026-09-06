# Self-host (local or VPS) — SQLite backend

Live ASX prices come from **EODHD** when `EODHD_API_TOKEN` is set (Yahoo removed).
OHLCV bars, breadth history, and universe snapshots persist in **SQLite** (`data/asx.sqlite` by default).

> Render works but needs **EODHD_API_TOKEN** and a first snapshot build. Disk is
> ephemeral — snapshot is rebuilt after deploy (see `render.yaml`).

## Render (ashoktrades.onrender.com)

1. **Environment variables** — set in `render.yaml` (auto on deploy) or Render dashboard:

   | Variable | Required | Notes |
   |----------|----------|--------|
   | `EODHD_API_TOKEN` | **Yes** | Set in host dashboard only — never commit |
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
- Network access to EODHD (`EODHD_API_TOKEN` required)

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
| `EODHD_API_TOKEN` | EODHD API key — required for market data |
| `DATA_PROVIDER` | `eodhd` (Yahoo removed; other values ignored) |
| `EODHD_ONLY` | always on when token set — no Yahoo fallback |
| `PRODUCTION_MODE` | `true` — shared server snapshot only (recommended for multi-user) |
| `ADMIN_USERS` | Comma list of usernames allowed to force snapshot rebuild |
| `ADMIN_API_KEY` | Optional `x-admin-key` header for cron (`POST /api/snapshot/refresh?force=1&priority=desk`) |
| `SERIES_RATE_LIMIT` | `/api/series` per IP per minute (default `600` in production) |
| `SNAPSHOT_RATE_LIMIT` | `/api/snapshot` GET per IP per minute (default `60` in production) |
| `AUTH_SECRET` + `AUTH_USERS` | **Required** when `PRODUCTION_MODE=true` — login is mandatory |
| `DATABASE_URL` | **Production (Azure):** PostgreSQL connection string — when set, the app uses Postgres instead of SQLite |
| `DATABASE_PATH` | Local dev SQLite file (default `./data/asx.sqlite`) — ignored when `DATABASE_URL` is set |
| `PGSSLMODE` | Set to `disable` only for local Postgres without SSL |
| `PORT` | Prod listen port (default `4173`) |

### Azure PostgreSQL (production)

Production on **tradersscope-app** should use **Azure Database for PostgreSQL — Flexible Server** instead of SQLite.

**1. Create the database (Portal)**

1. **Create a resource** → **Azure Database for PostgreSQL flexible server**
2. Region: **Australia East**, tier: **Burstable B1ms** (or higher for heavy snapshot rebuilds)
3. Admin user + password, database name: `tradersscope`
4. Networking: allow Azure services; add your App Service outbound IPs if using public access
5. Copy the connection string (Node.js format), e.g.  
   `postgresql://user:password@hostname.postgres.database.azure.com:5432/tradersscope?sslmode=require`

**2. Configure App Service**

Azure Portal → **tradersscope-app** → **Configuration** → Application settings:

| Name | Value |
|------|--------|
| `DATABASE_URL` | Full PostgreSQL connection string |
| (remove or ignore) | `DATABASE_PATH` — not used when `DATABASE_URL` is set |

Save and restart the app. On startup the server creates tables automatically (`server/db/schema.postgres.sql`).

**3. Migrate existing SQLite data (one-time)**

From a machine that can reach both the old SQLite file and Azure Postgres:

```powershell
$env:DATABASE_URL = "postgresql://..."
$env:SQLITE_PATH = "C:\path\to\asx.sqlite"   # or /mounts/appdata/asx.sqlite from Kudu
node scripts/migrate-sqlite-to-postgres.mjs
```

Then trigger **Refresh** in the UI (or `POST /api/snapshot/refresh?force=1&priority=desk`) to refresh the desk snapshot.

**4. Verify**

```bash
curl -s https://tradersscope.com/api/health | jq '.store, .database, .readiness'
```

`store` should be `"postgres"`.

**5. Maintenance mode**

While rebuilding a fresh Postgres snapshot (or other upgrades), block public use without stopping background jobs:

| Name | Value |
|------|--------|
| `MAINTENANCE_MODE` | `true` |
| `MAINTENANCE_MESSAGE` | Optional custom text for the maintenance screen |

Save and restart. Visitors see a maintenance page; `/api/health` and `/api/ping` still work for monitoring. Remove `MAINTENANCE_MODE` or set `false` when `readiness.snapshotAcceptable` is true.

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
- Schedule: `curl -X POST -H "x-admin-key: $ADMIN_API_KEY" https://tradersscope.com/api/snapshot/refresh?force=1&priority=desk`
- Weekly full EODHD pull (optional): `.../api/snapshot/refresh?force=1`
- Check readiness: `GET /api/health` → `readiness.multiUserReady`

### Scheduled snapshot (Azure cron — Logic App)

Keeps the shared desk fresh without manual Refresh. Uses **Azure Logic Apps (Consumption)** only — no GitHub cron required.

**Why:** In production all users read one server snapshot. After ASX close the app (and optional Logic App) force-pulls ASX200 + mid + small from EODHD. Cache is a same-day accelerator only.

**Cost (typical):** **~$0–2/month**. One Logic App run per day = ~30 HTTP calls/month. Consumption Logic Apps bill per action (fractions of a cent); well within free/low tiers. You already pay for App Service — the cron does not add another app server.

**Step 1 — Set `ADMIN_API_KEY` on the web app**

1. Generate a secret: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
2. Azure Portal → **tradersscope-app** → **Configuration** → add `ADMIN_API_KEY` = that value → **Save**

**Step 2 — Deploy Logic App (Portal UI)**

1. **Create a resource** → **Logic App** → **Consumption** (not Standard)
2. Name: `tradersscope-snapshot-cron`, region: **Australia East**, same resource group as the web app
3. After create: **Logic app designer** → **Blank Logic App**
4. Trigger: **Recurrence**
   - Interval: **1 Day**
   - Time zone: **(UTC+10:00) Canberra, Melbourne, Sydney**
   - At: **5:30 PM** (after ASX close; adjust if needed)
5. Action: **HTTP**
   - Method: **POST**
   - URI: `https://tradersscope.com/api/snapshot/refresh?force=1&priority=desk`
   - Headers: `x-admin-key` = same value as `ADMIN_API_KEY` on the web app
6. **Save** → **Run Trigger** once to test → check **Run history** (should be Succeeded)

**Step 2 alternate — CLI + Bicep (same repo)**

```powershell
az login
$key = "paste-ADMIN_API_KEY-here"
.\azure\deploy-snapshot-cron.ps1 -ResourceGroup tradersscope-rg -AdminApiKey $key
```

**Optional — weekly full EODHD refresh**

Add a second Logic App (or a second HTTP action on Sunday 2:00 AM) calling:

`POST https://tradersscope.com/api/snapshot/refresh?force=1` with the same `x-admin-key` header. Slow (~hours); run off-hours only.

**Verify**

```bash
curl -s https://tradersscope.com/api/health | jq '.readiness, .job'
```

After the scheduled run, `snapshotLoaded` should be high (~2400+) and `snapshotAcceptable` true.

### Live (delayed) prices during ASX session

The server polls EODHD **live (delayed ~15 min)** quotes every **15 minutes** between **10:00–16:30 Sydney** and overlays **Price** and **Day %** on the sector table. No extra Azure cron needed — runs inside `tradersscope-app`. Optional admin/cron: `POST /api/live-quotes/refresh` with `x-admin-key`.


### Auth (mandatory in production)

When `PRODUCTION_MODE=true`, the server **refuses to start** without `AUTH_SECRET`.
All market APIs require a signed-in session.

```powershell
# Generate a secret
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

# .env
AUTH_SECRET=<paste-secret>
AUTH_USERS=username:$2b$10$...   # node scripts/hash-password.mjs "password"

# Or seed SQLite users on the server:
npm run create-user -- username password --admin
```

**Azure (tradersscope-app)** — Application settings:

| Setting | Value |
|---------|--------|
| `AUTH_SECRET` | Long random string |
| `PUBLIC_APP_URL` | Canonical site URL for password-reset links (e.g. `https://traderscope.com`) |
| `AUTH_USERS` | `user:$2b$hash,...` (optional, alongside DB users) |
| `PRODUCTION_MODE` | `true` |

No public registration — accounts are seeded only.

### Auth (optional local dev)

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
