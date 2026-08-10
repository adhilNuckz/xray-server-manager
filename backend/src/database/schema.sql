-- Xray Panel metadata database.
-- NOTE: This database NEVER stores the authoritative Xray configuration.
-- The authoritative Xray config always remains /usr/local/etc/xray/config.json.
-- This DB only stores panel-level metadata that is projected into that file.

CREATE TABLE IF NOT EXISTS clients (
  id            TEXT PRIMARY KEY,        -- UUID, matches the VLESS client id
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,    -- matches the "email" field in Xray config
  flow          TEXT NOT NULL DEFAULT 'xtls-rprx-vision',
  notes         TEXT DEFAULT '',
  sni           TEXT NOT NULL DEFAULT '', -- preferred Reality SNI / data-pack domain for VLESS links
  enabled       INTEGER NOT NULL DEFAULT 1, -- 1 = enabled, 0 = disabled
  expires_at    TEXT,                    -- ISO date, nullable = never expires
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  imported      INTEGER NOT NULL DEFAULT 0 -- 1 if discovered from an existing config, not created via panel
);

CREATE TABLE IF NOT EXISTS traffic_snapshots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ts            TEXT NOT NULL,
  scope         TEXT NOT NULL,           -- 'system' | 'client'
  ref           TEXT,                    -- client email when scope='client', else NULL
  uplink        INTEGER NOT NULL DEFAULT 0,   -- cumulative bytes at time of snapshot
  downlink      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_traffic_ts ON traffic_snapshots (ts);
CREATE INDEX IF NOT EXISTS idx_traffic_scope_ref ON traffic_snapshots (scope, ref);

CREATE TABLE IF NOT EXISTS connection_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ts            TEXT NOT NULL,
  email         TEXT,
  source_ip     TEXT,
  destination   TEXT,
  state         TEXT
);

CREATE INDEX IF NOT EXISTS idx_conn_ts ON connection_events (ts);
CREATE INDEX IF NOT EXISTS idx_conn_email ON connection_events (email);

CREATE TABLE IF NOT EXISTS settings (
  key           TEXT PRIMARY KEY,
  value         TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ts            TEXT NOT NULL,
  actor         TEXT NOT NULL,
  action        TEXT NOT NULL,
  details       TEXT,
  ip            TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_logs (ts);

CREATE TABLE IF NOT EXISTS sessions (
  sid           TEXT PRIMARY KEY,
  sess          TEXT NOT NULL,
  expires_at    INTEGER NOT NULL
);
