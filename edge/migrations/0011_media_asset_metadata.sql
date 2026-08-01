ALTER TABLE media_assets ADD COLUMN title TEXT;
ALTER TABLE media_assets ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE media_assets ADD COLUMN notes TEXT;

CREATE INDEX IF NOT EXISTS idx_media_assets_site_title
  ON media_assets(site_id, title COLLATE NOCASE);
