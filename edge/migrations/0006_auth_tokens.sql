CREATE TABLE IF NOT EXISTS auth_tokens (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  actor TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'publisher', 'viewer')),
  scopes TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  expires_at TEXT,
  last_used_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash
  ON auth_tokens(token_hash);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_site_status
  ON auth_tokens(site_id, status);
