INSERT OR IGNORE INTO page_sections (
  id,
  page_id,
  section_key,
  type,
  section_order,
  enabled,
  data,
  created_at,
  updated_at
)
SELECT
  'section_ph_portfolio_gallery',
  p.id,
  'gallery',
  'gallery',
  25,
  1,
  ce.data,
  datetime('now'),
  datetime('now')
FROM content_entries ce
JOIN sites s ON s.id = ce.site_id
JOIN pages p ON p.site_id = s.id AND p.slug = 'portfolio'
WHERE
  s.slug = 'ph'
  AND ce.collection = 'portfolio'
  AND ce.item_key = 'series'
  AND ce.status = 'published'
  AND json_extract(ce.data, '$.items') IS NOT NULL;
