INSERT OR IGNORE INTO sites (
  id,
  slug,
  name,
  primary_host,
  status,
  created_at,
  updated_at
) VALUES (
  'site_ph',
  'ph',
  'Lorenzo Zanna Photography',
  'ph.lorenzozanna.com',
  'published',
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO content_entries (
  id,
  site_id,
  collection,
  item_key,
  data,
  status,
  created_at,
  updated_at,
  published_at
) VALUES (
  'entry_ph_home_hero',
  'site_ph',
  'home',
  'hero',
  '{"eyebrow":"Firenze / portraits / private events","title":"Lorenzo Zanna","intro":"Fotografie scure, calme, personali. Una selezione essenziale tra volti, dettagli urbani e momenti privati.","primaryCta":{"label":"Guarda il portfolio","href":"/portfolio"},"secondaryCta":{"label":"Contatti","href":"/contact"},"image":{"src":"https://picsum.photos/seed/lorenzo-hero/1600/2100","alt":""}}',
  'published',
  datetime('now'),
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO content_entries (
  id,
  site_id,
  collection,
  item_key,
  data,
  status,
  created_at,
  updated_at,
  published_at
) VALUES (
  'entry_ph_home_selected_work',
  'site_ph',
  'home',
  'selected_work',
  '{"kicker":"Selected work","title":"Una prima traccia visiva","intro":"Poche immagini, scelte per atmosfera.","shots":[{"caption":"Portrait study, 2026","image":"https://picsum.photos/seed/lz-selected-01/720/960"},{"caption":"Night fragments","image":"https://picsum.photos/seed/lz-selected-02/1200/780"},{"caption":"Urban quiet","image":"https://picsum.photos/seed/lz-selected-03/720/960"}]}',
  'published',
  datetime('now'),
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO content_entries (
  id,
  site_id,
  collection,
  item_key,
  data,
  status,
  created_at,
  updated_at,
  published_at
) VALUES (
  'entry_ph_about_hero',
  'site_ph',
  'about',
  'hero',
  '{"eyebrow":"About","title":"Fotografia come memoria breve.","body":"Lorenzo lavora tra ritratti, momenti privati e dettagli urbani. Cerca immagini semplici, dense, con un passo lento: fotografie che non alzano la voce.","image":{"src":"https://picsum.photos/seed/lz-about-main/1100/1400","alt":"Ritratto ambientato del fotografo"}}',
  'published',
  datetime('now'),
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO content_entries (
  id,
  site_id,
  collection,
  item_key,
  data,
  status,
  created_at,
  updated_at,
  published_at
) VALUES (
  'entry_ph_portfolio_series',
  'site_ph',
  'portfolio',
  'series',
  '{"title":"Serie selezionate","intro":"Una galleria editoriale, non un archivio completo.","items":[{"key":"portraits","title":"Portraits"},{"key":"street","title":"Street fragments"},{"key":"private-events","title":"Private events"}]}',
  'published',
  datetime('now'),
  datetime('now'),
  datetime('now')
);
