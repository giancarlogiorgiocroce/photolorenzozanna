import { resolveEditableField } from "./page-contracts.mjs";

const SLUG_PATTERN = /^[a-z0-9-]{1,80}$/;
const SECTION_KEY_PATTERN = /^[a-z0-9_-]{1,80}$/;
const MAX_TEXT_SUBSECTIONS = 12;

export async function addTextSubsection(env, input) {
  const siteSlug = requiredPattern(input?.site, "site", SLUG_PATTERN);
  const pageSlug = requiredPattern(input?.page, "page", SLUG_PATTERN);
  const sectionKey = requiredPattern(input?.sectionId, "sectionId", SECTION_KEY_PATTERN);
  const actor = requiredString(input?.actor || "mcp", "actor");

  const { site, page, section } = await loadSection(env, siteSlug, pageSlug, sectionKey);
  ensureTextSubsectionsEditable(page.slug, section);

  const before = serializeSection(section);
  const data = cloneDataObject(before.data);
  const subsections = normalizeExistingSubsections(data.subsections);

  if (subsections.length >= MAX_TEXT_SUBSECTIONS) {
    throw new Error(`Text section cannot contain more than ${MAX_TEXT_SUBSECTIONS} subsections.`);
  }

  const item = normalizeTextSubsection(input);
  const index = normalizeInsertIndex(input?.index ?? input?.position, subsections.length);
  subsections.splice(index, 0, item);
  data.subsections = subsections;

  const revisionId = await persistTextSectionChange(env, {
    site,
    page,
    section,
    before,
    data,
    actor,
    action: "add_text_subsection",
    targetPath: `subsections[${index}]`,
  });

  return {
    site: site.slug,
    page: page.slug,
    sectionId: section.section_key,
    itemIndex: index,
    item,
    itemCount: subsections.length,
    revisionId,
    published: true,
    previewUrl: page.slug === "home" ? "/" : `/${page.slug}`,
  };
}

async function loadSection(env, siteSlug, pageSlug, sectionKey) {
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

  return { site, page, section };
}

function ensureTextSubsectionsEditable(pageSlug, section) {
  const titleField = resolveEditableField(pageSlug, section, "subsections[0].title");
  const paragraphsField = resolveEditableField(pageSlug, section, "subsections[0].paragraphs");

  if (!titleField || titleField.kind !== "plain_text" || !paragraphsField || paragraphsField.kind !== "rich_text") {
    throw new Error(`Section does not support text subsections: ${pageSlug}/${section.section_key}`);
  }
}

async function persistTextSectionChange(env, options) {
  const after = {
    ...options.before,
    data: options.data,
  };
  const revisionId = crypto.randomUUID();

  await env.DB.prepare(
    `UPDATE page_sections
     SET data = ?, updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(JSON.stringify(options.data), options.section.id)
    .run();

  await env.DB.prepare(
    `INSERT INTO section_revisions (
       id, section_id, actor, action, before_json, after_json, created_at
     )
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
  )
    .bind(
      revisionId,
      options.section.id,
      options.actor,
      options.action,
      JSON.stringify(options.before),
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
      options.site.id,
      options.actor,
      options.action,
      `pages/${options.page.slug}/sections/${options.section.section_key}/${options.targetPath}`,
      JSON.stringify(options.before),
      JSON.stringify(after),
    )
    .run();

  return revisionId;
}

function normalizeTextSubsection(input) {
  return {
    title: normalizePlainText(input?.title, "title", 90),
    paragraphs: normalizeParagraphs(input?.paragraphs ?? input?.text),
  };
}

function normalizeExistingSubsections(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new Error("Invalid text subsections.");
  }

  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Invalid text subsection.");
    }

    return {
      title: normalizePlainText(item.title, "title", 90),
      paragraphs: normalizeParagraphs(item.paragraphs),
    };
  });
}

function normalizeParagraphs(value) {
  const raw = typeof value === "string" ? [value] : value;
  if (!Array.isArray(raw)) {
    throw new Error("Missing paragraphs.");
  }

  const paragraphs = raw
    .filter((item) => item != null)
    .map((item, index) => normalizePlainText(item, `paragraphs[${index}]`, 900));

  if (paragraphs.length === 0) {
    throw new Error("Missing paragraphs.");
  }

  return paragraphs;
}

function normalizeInsertIndex(value, length) {
  if (value == null) return length;
  if (!Number.isInteger(value) || value < 0 || value > length) {
    throw new Error("Invalid text subsection index.");
  }
  return value;
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

function cloneDataObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid section data.");
  }

  return JSON.parse(JSON.stringify(value));
}

function normalizePlainText(value, name, maxLength) {
  if (typeof value !== "string") {
    throw new Error(`Missing ${name}.`);
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`Missing ${name}.`);
  }

  if (/<\/?[A-Za-z][^>]*>/.test(normalized)) {
    throw new Error("HTML is not allowed.");
  }

  if ([...normalized].length > maxLength) {
    throw new Error(`${name} exceeds max length ${maxLength}.`);
  }

  return normalized;
}

function requiredPattern(value, name, pattern) {
  const normalized = requiredString(value, name);
  if (!pattern.test(normalized)) {
    throw new Error(`Invalid ${name}.`);
  }
  return normalized;
}

function requiredString(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing ${name}.`);
  }
  return value.trim();
}

function safeJson(value) {
  if (value == null) return null;
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return null;
  }
}
