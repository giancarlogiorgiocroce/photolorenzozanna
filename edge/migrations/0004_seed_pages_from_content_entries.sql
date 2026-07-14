INSERT OR IGNORE INTO pages (
  id,
  site_id,
  slug,
  title,
  status,
  created_at,
  updated_at
)
SELECT
  'page_' || s.slug || '_' || ce.item_key,
  s.id,
  ce.item_key,
  COALESCE(
    json_extract(ce.data, '$.title'),
    json_extract(ce.data, '$.h1'),
    ce.item_key
  ),
  ce.status,
  datetime('now'),
  datetime('now')
FROM content_entries ce
JOIN sites s ON s.id = ce.site_id
WHERE
  s.slug = 'ph'
  AND ce.collection = 'pages'
  AND ce.item_key IN ('home', 'chi-sono', 'portfolio', 'contatti')
  AND ce.status = 'published';

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
  'section_' || s.slug || '_' || ce.item_key || '_' ||
    CASE
      WHEN json_extract(block.value, '$.type') IN ('hero', 'faq', 'cta', 'gallery') THEN json_extract(block.value, '$.type')
      ELSE json_extract(block.value, '$.type') || '_' || CAST(CAST(block.key AS INTEGER) + 1 AS TEXT)
    END,
  p.id,
  CASE
    WHEN json_extract(block.value, '$.type') IN ('hero', 'faq', 'cta', 'gallery') THEN json_extract(block.value, '$.type')
    ELSE json_extract(block.value, '$.type') || '_' || CAST(CAST(block.key AS INTEGER) + 1 AS TEXT)
  END,
  json_extract(block.value, '$.type'),
  (CAST(block.key AS INTEGER) + 1) * 10,
  1,
  block.value,
  datetime('now'),
  datetime('now')
FROM content_entries ce
JOIN sites s ON s.id = ce.site_id
JOIN pages p ON p.site_id = s.id AND p.slug = ce.item_key
JOIN json_each(ce.data, '$.blocks') AS block
WHERE
  s.slug = 'ph'
  AND ce.collection = 'pages'
  AND ce.item_key IN ('home', 'chi-sono', 'portfolio', 'contatti')
  AND ce.status = 'published'
  AND json_type(ce.data, '$.blocks') = 'array'
  AND json_extract(block.value, '$.type') IN ('hero', 'text', 'faq', 'cta', 'gallery');
