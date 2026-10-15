-- Apply to a dedicated Cloudflare D1 database before enabling any block stage.
-- Airtable remains the content system of record.
CREATE TABLE IF NOT EXISTS studio_title_registry (
  profile_id TEXT NOT NULL,
  title_key TEXT NOT NULL,
  title_display TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  owner_kind TEXT NOT NULL CHECK (owner_kind IN ('reservation','idea','content')),
  stage TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (profile_id,title_key)
);
CREATE TABLE IF NOT EXISTS studio_title_guard_audit (
  audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  title_key TEXT NOT NULL,
  stage TEXT NOT NULL,
  source TEXT NOT NULL,
  mode TEXT NOT NULL,
  outcome TEXT NOT NULL,
  winning_record_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_title_guard_audit_at ON studio_title_guard_audit(occurred_at);
