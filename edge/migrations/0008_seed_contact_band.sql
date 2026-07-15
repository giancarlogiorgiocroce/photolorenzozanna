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
  'section_ph_contatti_contact_band',
  p.id,
  'contact-band',
  'text',
  15,
  1,
  json_object(
    'type', 'contact-band',
    'channels', json_array(
      json_object('label', 'Email', 'value', 'Da definire', 'href', NULL),
      json_object('label', 'Instagram', 'value', 'Da definire', 'href', NULL),
      json_object('label', 'Telefono', 'value', 'Da definire', 'href', NULL)
    )
  ),
  datetime('now'),
  datetime('now')
FROM sites s
JOIN pages p ON p.site_id = s.id AND p.slug = 'contatti'
WHERE s.slug = 'ph';
