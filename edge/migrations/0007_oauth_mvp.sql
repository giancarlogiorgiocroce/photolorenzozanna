CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'publisher', 'viewer')),
  scopes TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL CHECK (code_challenge_method = 'S256'),
  resource TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_oauth_authorization_codes_hash
  ON oauth_authorization_codes(code_hash);

CREATE INDEX IF NOT EXISTS idx_oauth_authorization_codes_expiry
  ON oauth_authorization_codes(expires_at, used_at);

CREATE TABLE IF NOT EXISTS oauth_access_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'publisher', 'viewer')),
  scopes TEXT NOT NULL,
  resource TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  expires_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_oauth_access_tokens_hash
  ON oauth_access_tokens(token_hash);

CREATE INDEX IF NOT EXISTS idx_oauth_access_tokens_site_status
  ON oauth_access_tokens(site_id, status);
