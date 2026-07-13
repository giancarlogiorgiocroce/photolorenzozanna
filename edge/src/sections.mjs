const SLUG_PATTERN = /^[a-z0-9-]{1,80}$/;
const SECTION_KEY_PATTERN = /^[a-z0-9_-]{1,80}$/;

export async function disableSection(env, input) {
  const siteSlug = requiredPattern(input?.site, "site", SLUG_PATTERN);
  const pageSlug = requiredPattern(input?.page, "page", SLUG_PATTERN);
  const sectionKey = requiredPattern(input?.sectionId, "sectionId", SECTION_KEY_PATTERN);
  const actor = requiredString(input?.actor || "mcp");

  if (!env?.DB) {
    throw new Error("D1 binding DB is not configured.");
  }

  const site = await env.DB.prepare("SELECT id, slug FROM sites WHERE slug = ?")
    .bind(siteSlug)
    .first();

  if (!site) {
    throw new Error(`Site not found: ${siteSlug}`);
  }

  const page = await env.DB.prepare("SELECT id, slug, title FROM pages WHERE site_id = ? AND slug = ?")
    .bind(site.id, pageSlug)
    .first();

  if (!page) {
    throw new Error(`Page not found: ${pageSlug}`);
  }

  const section = await env.DB.prepare(
    `SELECT id, section_key, type, section_order, enabled, data
     FROM page_sections
     WHERE page_id = ? AND section_key = ?`,
  )
    .bind(page.id, sectionKey)
    .first();

  if (!section) {
    throw new Error(`Section not found: ${pageSlug}/${sectionKey}`);
  }

  if (Number(section.enabled) === 0) {
    throw new Error(`Section already disabled: ${pageSlug}/${sectionKey}`);
  }

  const before = serializeSection(section);
  const after = {
    ...before,
    enabled: false,
  };
  const revisionId = crypto.randomUUID();

  await env.DB.prepare(
    `UPDATE page_sections
     SET enabled = 0, updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(section.id)
    .run();

  await env.DB.prepare(
    `INSERT INTO section_revisions (
       id, section_id, actor, action, before_json, after_json, created_at
     )
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
  )
    .bind(
      revisionId,
      section.id,
      actor,
      "disable_section",
      JSON.stringify(before),
      JSON.stringify(after),
    )
    .run();

  await env.DB.prepare(
    `INSERT INTO change_log (
       id, site_id, actor, action, target, before_json, after_json, created_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  )
    .bind(
      crypto.randomUUID(),
      site.id,
      actor,
      "disable_section",
      `pages/${page.slug}/sections/${section.section_key}`,
      JSON.stringify(before),
      JSON.stringify(after),
    )
    .run();

  return {
    site: site.slug,
    page: page.slug,
    sectionId: section.section_key,
    enabled: false,
    revisionId,
    published: true,
    previewUrl: page.slug === "home" ? "/" : `/${page.slug}`,
  };
}

function serializeSection(section) {
  return {
    id: section.id,
    sectionId: section.section_key,
    type: section.type,
    order: Number(section.section_order),
    enabled: Number(section.enabled) === 1,
    data: safeJson(section.data) ?? {},
  };
}

function requiredString(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Missing required value.");
  }
  return value.trim();
}

function requiredPattern(value, name, pattern) {
  const normalized = requiredString(value);
  if (!pattern.test(normalized)) {
    throw new Error(`Invalid ${name}.`);
  }
  return normalized;
}

function safeJson(value) {
  if (value == null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
