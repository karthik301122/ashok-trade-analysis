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
  is_admin INTEGER NOT NULL DEFAULT 0,
  display_name TEXT
);

CREATE TABLE IF NOT EXISTS registration_otps (
  email TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_prefs (
  username TEXT PRIMARY KEY,
  alert_email_opt_in INTEGER NOT NULL DEFAULT 0,
  alert_email_min_score INTEGER NOT NULL DEFAULT 80,
  pattern_alert_ids_json TEXT,
  pattern_combo_alerts_json TEXT,
  updated_at BIGINT NOT NULL
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

CREATE TABLE IF NOT EXISTS asx_filings (
  document_key TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  headline TEXT,
  kind TEXT,
  director TEXT,
  side TEXT,
  shares DOUBLE PRECISION,
  consideration_aud DOUBLE PRECISION,
  announced_at BIGINT NOT NULL,
  date_of_change TEXT,
  pdf_url TEXT,
  raw_json TEXT,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bars_symbol_t ON bars (symbol, t);
CREATE INDEX IF NOT EXISTS idx_breadth_universe_day ON breadth_daily (universe, day);
CREATE INDEX IF NOT EXISTS idx_pattern_scan_score ON pattern_scan_state (pattern_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_asx_filings_ticker_announced ON asx_filings (ticker, announced_at DESC);
CREATE INDEX IF NOT EXISTS idx_asx_filings_side_announced ON asx_filings (side, announced_at DESC);

CREATE TABLE IF NOT EXISTS pattern_hits_day (
  as_of TEXT PRIMARY KEY,
  built_at BIGINT NOT NULL,
  universe TEXT NOT NULL,
  hits_json TEXT NOT NULL,
  counts_json TEXT
);

CREATE TABLE IF NOT EXISTS user_patterns (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  prefs_json TEXT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_patterns_user ON user_patterns (username);

CREATE TABLE IF NOT EXISTS watchlists (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  name TEXT NOT NULL,
  tickers_json TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_watchlists_user ON watchlists (username);

CREATE TABLE IF NOT EXISTS share_links (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT
);

CREATE TABLE IF NOT EXISTS organisations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  seats INTEGER NOT NULL DEFAULT 0,
  branding_json TEXT,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  billing_status TEXT NOT NULL DEFAULT 'none',
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS org_members (
  org_id TEXT NOT NULL,
  username TEXT NOT NULL,
  role TEXT NOT NULL,
  cohort TEXT,
  joined_at BIGINT NOT NULL,
  PRIMARY KEY (org_id, username)
);

CREATE TABLE IF NOT EXISTS org_invites (
  token_hash TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  cohort TEXT,
  expires_at BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  activated_at BIGINT,
  activated_username TEXT,
  stripe_session_id TEXT,
  created_at BIGINT
);

CREATE TABLE IF NOT EXISTS user_billing (
  username TEXT PRIMARY KEY,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'none',
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS trainer_publications (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  cohort TEXT,
  publisher TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  note TEXT,
  payload_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trainer_pub_org ON trainer_publications (org_id, cohort);
