const SLUG_PATTERN = /^[a-z0-9-]{1,80}$/;
const SECTION_KEY_PATTERN = /^[a-z0-9_-]{1,80}$/;
const ID_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;

export async function rollbackChange(env, input) {
  const siteSlug = requiredPattern(input?.site, "site", SLUG_PATTERN);
  const changeId = optionalPattern(input?.changeId, "changeId", ID_PATTERN);
  const sourceRevisionId = optionalPattern(input?.revisionId, "revisionId", ID_PATTERN);
  const pageSlug = optionalPattern(input?.page, "page", SLUG_PATTERN);
  const sectionKey = optionalPattern(input?.sectionId, "sectionId", SECTION_KEY_PATTERN);
  const actor = requiredString(input?.actor || "mcp");

  if (changeId && sourceRevisionId) {
    throw new Error("Use either changeId or revisionId, not both.");
  }

  if (sectionKey && !pageSlug) {
    throw new Error("page is required when filtering by sectionId.");
  }

  if (!changeId && !sourceRevisionId && !pageSlug) {
    throw new Error("changeId, revisionId, or page is required for rollback_change.");
  }

  if (!env?.DB) {
    throw new Error("D1 binding DB is not configured.");
  }

  const site = await env.DB.prepare("SELECT id, slug FROM sites WHERE slug = ?")
    .bind(siteSlug)
    .first();

  if (!site) {
    throw new Error(`Site not found: ${siteSlug}`);
  }

  const rollbackSource = sourceRevisionId
    ? await loadRevisionById(env, site.id, sourceRevisionId)
    : await loadRollbackChange(env, site.id, { changeId, pageSlug, sectionKey });

  if (!rollbackSource) {
    throw new Error(sourceRevisionId ? "Revision not found." : "Change not found.");
  }

  const current = serializeSection(rollbackSource.section);
  const rollbackSnapshot = normalizeSectionSnapshot(safeJson(rollbackSource.beforeJson), rollbackSource.section);
  const expectedCurrent = normalizeSectionSnapshot(safeJson(rollbackSource.afterJson), rollbackSource.section);

  if (!snapshotsEqual(current, expectedCurrent)) {
    throw new Error("Cannot safely rollback: current section state differs from the change after snapshot.");
  }

  const revisionId = crypto.randomUUID();
  await env.DB.prepare(
    `UPDATE page_sections
     SET enabled = ?, section_order = ?, data = ?, updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(
      rollbackSnapshot.enabled ? 1 : 0,
      rollbackSnapshot.order,
      JSON.stringify(rollbackSnapshot.data),
      rollbackSource.section.id,
    )
    .run();

  await env.DB.prepare(
    `INSERT INTO section_revisions (
       id, section_id, actor, action, before_json, after_json, created_at
     )
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
  )
    .bind(
      revisionId,
      rollbackSource.section.id,
      actor,
      "rollback_change",
      JSON.stringify(current),
      JSON.stringify(rollbackSnapshot),
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
      "rollback_change",
      rollbackSource.target,
      JSON.stringify(current),
      JSON.stringify(rollbackSnapshot),
    )
    .run();

  return {
    site: site.slug,
    page: rollbackSource.page.slug,
    sectionId: rollbackSource.section.section_key,
    path: rollbackSource.path,
    rolledBackChangeId: rollbackSource.changeId,
    rolledBackRevisionId: rollbackSource.sourceRevisionId,
    rolledBackAction: rollbackSource.action,
    revisionId,
    published: true,
    previewUrl: rollbackSource.page.slug === "home" ? "/" : `/${rollbackSource.page.slug}`,
  };
}

async function loadRollbackChange(env, siteId, options) {
  const change = options.changeId
    ? await loadChangeById(env, siteId, options.changeId)
    : await loadLatestChange(env, siteId, options.pageSlug, options.sectionKey);

  if (!change) return null;

  const target = parseSectionTarget(change.target);
  const { page, section } = await loadSection(env, { id: siteId }, target.page, target.sectionId);

  return {
    page,
    section,
    target: change.target,
    path: target.path,
    changeId: change.id,
    sourceRevisionId: null,
    action: change.action,
    beforeJson: change.before_json,
    afterJson: change.after_json,
  };
}

async function loadChangeById(env, siteId, changeId) {
  return env.DB.prepare(
    `SELECT id, actor, action, target, before_json, after_json, created_at
     FROM change_log
     WHERE site_id = ? AND id = ?
     LIMIT 1`,
  )
    .bind(siteId, changeId)
    .first();
}

async function loadLatestChange(env, siteId, pageSlug, sectionKey) {
  const targetPrefix = sectionKey ? `pages/${pageSlug}/sections/${sectionKey}` : `pages/${pageSlug}`;
  const rows = await env.DB.prepare(
    `SELECT id, actor, action, target, before_json, after_json, created_at
     FROM change_log
     WHERE site_id = ? AND (target = ? OR target LIKE ?)
     ORDER BY created_at DESC
     LIMIT ?`,
  )
    .bind(siteId, targetPrefix, `${targetPrefix}/%`, 1)
    .all();

  return rows.results?.[0] ?? null;
}

async function loadRevisionById(env, siteId, revisionId) {
  const row = await env.DB.prepare(
    `SELECT
       r.id AS revision_id,
       r.action AS revision_action,
       r.before_json AS revision_before_json,
       r.after_json AS revision_after_json,
       r.created_at AS revision_created_at,
       p.id AS page_id,
       p.slug AS page_slug,
       p.title AS page_title,
       s.id AS section_current_id,
       s.section_key,
       s.type,
       s.section_order,
       s.enabled,
       s.data
     FROM section_revisions r
     JOIN page_sections s ON s.id = r.section_id
     JOIN pages p ON p.id = s.page_id
     WHERE p.site_id = ? AND r.id = ?
     LIMIT 1`,
  )
    .bind(siteId, revisionId)
    .first();

  if (!row) return null;

  const page = {
    id: row.page_id,
    slug: row.page_slug,
    title: row.page_title,
  };
  const section = {
    id: row.section_current_id,
    section_key: row.section_key,
    type: row.type,
    section_order: row.section_order,
    enabled: row.enabled,
    data: row.data,
  };

  return {
    page,
    section,
    target: `pages/${page.slug}/sections/${section.section_key}`,
    path: null,
    changeId: null,
    sourceRevisionId: row.revision_id,
    action: row.revision_action,
    beforeJson: row.revision_before_json,
    afterJson: row.revision_after_json,
  };
}

async function loadSection(env, site, pageSlug, sectionKey) {
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

  return { page, section };
}

function parseSectionTarget(target) {
  const match = /^pages\/([^/]+)\/sections\/([^/]+)(?:\/(.+))?$/.exec(String(target ?? ""));
  if (!match) {
    throw new Error("Cannot rollback non-section change.");
  }

  return {
    page: match[1],
    sectionId: match[2],
    path: match[3] ?? null,
  };
}

function normalizeSectionSnapshot(value, section) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid section snapshot.");
  }

  if (value.id !== section.id || value.sectionId !== section.section_key) {
    throw new Error("Section snapshot does not match current section.");
  }

  if (!value.data || typeof value.data !== "object" || Array.isArray(value.data)) {
    throw new Error("Invalid section snapshot data.");
  }

  return {
    id: value.id,
    sectionId: value.sectionId,
    type: value.type ?? section.type,
    order: positiveInteger(value.order),
    enabled: Boolean(value.enabled),
    data: JSON.parse(JSON.stringify(value.data)),
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

function snapshotsEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function positiveInteger(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error("Invalid section snapshot order.");
  }
  return number;
}

function requiredPattern(value, name, pattern) {
  const normalized = requiredString(value);
  if (!pattern.test(normalized)) {
    throw new Error(`Invalid ${name}.`);
  }
  return normalized;
}

function optionalPattern(value, name, pattern) {
  if (value == null || value === "") return null;
  return requiredPattern(value, name, pattern);
}

function requiredString(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Missing required value.");
  }
  return value.trim();
}

function safeJson(value) {
  if (value == null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
