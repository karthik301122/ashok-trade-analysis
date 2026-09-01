CREATE TABLE IF NOT EXISTS bars (
  symbol TEXT NOT NULL,
  t BIGINT NOT NULL,
  o DOUBLE PRECISION NOT NULL,
  h DOUBLE PRECISION NOT NULL,
  l DOUBLE PRECISION NOT NULL,
  c DOUBLE PRECISION NOT NULL,
  v DOUBLE PRECISION NOT NULL DEFAULT 0,
  PRIMARY KEY (symbol, t)
);

CREATE TABLE IF NOT EXISTS series_meta (
  symbol TEXT PRIMARY KEY,
  updated_at BIGINT NOT NULL,
  last DOUBLE PRECISION,
  high52 DOUBLE PRECISION,
  meta_json TEXT
);

CREATE TABLE IF NOT EXISTS breadth_daily (
  universe TEXT NOT NULL,
  day TEXT NOT NULL,
  above20 DOUBLE PRECISION NOT NULL,
  above50 DOUBLE PRECISION NOT NULL,
  above200 DOUBLE PRECISION NOT NULL,
  rsi50 DOUBLE PRECISION NOT NULL,
  ad_net DOUBLE PRECISION NOT NULL,
  advancing INTEGER,
  declining INTEGER,
  near52w DOUBLE PRECISION,
  rsi70 DOUBLE PRECISION,
  rsi30 DOUBLE PRECISION,
  rs50 DOUBLE PRECISION,
  rvol15 DOUBLE PRECISION,
  PRIMARY KEY (universe, day)
);

CREATE TABLE IF NOT EXISTS market_snapshot (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  built_at BIGINT NOT NULL,
  as_of TEXT,
  loaded INTEGER NOT NULL,
  failed INTEGER NOT NULL,
  index_perf_json TEXT NOT NULL,
  stocks_perf_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS snapshot_job (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  status TEXT NOT NULL,
  started_at BIGINT,
  finished_at BIGINT,
  message TEXT,
  loaded INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS alert_rules (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  params_json TEXT NOT NULL,
  webhook_url TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS alert_events (
  id SERIAL PRIMARY KEY,
  rule_id INTEGER NOT NULL,
  ticker TEXT,
  message TEXT NOT NULL,
  payload_json TEXT,
  created_at BIGINT NOT NULL,
  delivered INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS fundamentals (
  ticker TEXT PRIMARY KEY,
  updated_at BIGINT NOT NULL,
  pe DOUBLE PRECISION,
  forward_pe DOUBLE PRECISION,
  dividend_yield DOUBLE PRECISION,
  market_cap DOUBLE PRECISION,
  eps DOUBLE PRECISION,
  raw_json TEXT
);

CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS live_quotes (
  ticker TEXT PRIMARY KEY,
  close DOUBLE PRECISION NOT NULL,
  change_p DOUBLE PRECISION,
  volume BIGINT,
  quote_ts BIGINT,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS pattern_scan_state (
  ticker TEXT NOT NULL,
  pattern_id TEXT NOT NULL,
  score DOUBLE PRECISION NOT NULL,
  confirmed INTEGER NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (ticker, pattern_id)
);

CREATE INDEX IF NOT EXISTS idx_bars_symbol_t ON bars (symbol, t);
CREATE INDEX IF NOT EXISTS idx_breadth_universe_day ON breadth_daily (universe, day);
CREATE INDEX IF NOT EXISTS idx_pattern_scan_score ON pattern_scan_state (pattern_id, score DESC);
