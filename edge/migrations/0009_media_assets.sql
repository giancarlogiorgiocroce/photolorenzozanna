CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  r2_key TEXT,
  public_url TEXT NOT NULL,
  alt TEXT NOT NULL DEFAULT '',
  caption TEXT,
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('draft', 'ready', 'archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_media_assets_site_status
  ON media_assets(site_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS media_usages (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  section_id TEXT NOT NULL,
  path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (page_id, section_id, path),
  FOREIGN KEY (asset_id) REFERENCES media_assets(id) ON DELETE RESTRICT,
  FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
  FOREIGN KEY (section_id) REFERENCES page_sections(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_media_usages_asset
  ON media_usages(asset_id);
