CREATE TABLE IF NOT EXISTS media_uploads (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  asset_id TEXT NOT NULL UNIQUE,
  r2_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  upload_token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploaded', 'expired', 'cancelled')),
  expires_at TEXT NOT NULL,
  uploaded_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (asset_id) REFERENCES media_assets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_media_uploads_site_status
  ON media_uploads(site_id, status, expires_at);
