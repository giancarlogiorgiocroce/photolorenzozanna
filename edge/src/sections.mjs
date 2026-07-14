import { resolveEditableField } from "./page-contracts.mjs";

const SLUG_PATTERN = /^[a-z0-9-]{1,80}$/;
const SECTION_KEY_PATTERN = /^[a-z0-9_-]{1,80}$/;
const TEXT_PATH_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(?:\[(?:0|[1-9]\d*)\])?(?:\.[A-Za-z][A-Za-z0-9_]*(?:\[(?:0|[1-9]\d*)\])?)*$/;

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

export async function enableSection(env, input) {
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

  if (Number(section.enabled) === 1) {
    throw new Error(`Section already enabled: ${pageSlug}/${sectionKey}`);
  }

  const before = serializeSection(section);
  const after = {
    ...before,
    enabled: true,
  };
  const revisionId = crypto.randomUUID();

  await env.DB.prepare(
    `UPDATE page_sections
     SET enabled = 1, updated_at = datetime('now')
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
      "enable_section",
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
      "enable_section",
      `pages/${page.slug}/sections/${section.section_key}`,
      JSON.stringify(before),
      JSON.stringify(after),
    )
    .run();

  return {
    site: site.slug,
    page: page.slug,
    sectionId: section.section_key,
    enabled: true,
    revisionId,
    published: true,
    previewUrl: page.slug === "home" ? "/" : `/${page.slug}`,
  };
}

export async function updateText(env, input) {
  const siteSlug = requiredPattern(input?.site, "site", SLUG_PATTERN);
  const pageSlug = requiredPattern(input?.page, "page", SLUG_PATTERN);
  const sectionKey = requiredPattern(input?.sectionId, "sectionId", SECTION_KEY_PATTERN);
  const fieldPath = requiredPattern(input?.path, "path", TEXT_PATH_PATTERN);
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

  const field = resolveEditableField(page.slug, section, fieldPath);
  if (!field || !canUpdateWithPlainText(field)) {
    throw new Error(`Field is not editable with update_text: ${fieldPath}`);
  }

  const value = normalizeTextValue(input?.value, field);
  const before = serializeSection(section);
  const data = cloneJsonObject(before.data);
  setTextAtPath(data, fieldPath, value);
  const after = {
    ...before,
    data,
  };
  const revisionId = crypto.randomUUID();

  await env.DB.prepare(
    `UPDATE page_sections
     SET data = ?, updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(JSON.stringify(data), section.id)
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
      "update_text",
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
      "update_text",
      `pages/${page.slug}/sections/${section.section_key}/${fieldPath}`,
      JSON.stringify(before),
      JSON.stringify(after),
    )
    .run();

  return {
    site: site.slug,
    page: page.slug,
    sectionId: section.section_key,
    path: fieldPath,
    value,
    revisionId,
    published: true,
    previewUrl: page.slug === "home" ? "/" : `/${page.slug}`,
  };
}

export async function updateCta(env, input) {
  const siteSlug = requiredPattern(input?.site, "site", SLUG_PATTERN);
  const pageSlug = requiredPattern(input?.page, "page", SLUG_PATTERN);
  const sectionKey = requiredPattern(input?.sectionId, "sectionId", SECTION_KEY_PATTERN);
  const fieldPath = requiredPattern(input?.path, "path", TEXT_PATH_PATTERN);
  const actor = requiredString(input?.actor || "mcp");

  const { site, page, section } = await loadSection(env, siteSlug, pageSlug, sectionKey);
  const field = resolveEditableField(page.slug, section, fieldPath);
  if (!field || field.kind !== "link") {
    throw new Error(`Field is not editable with update_cta: ${fieldPath}`);
  }

  const value = normalizeCtaValue(input, field);
  const before = serializeSection(section);
  const data = cloneJsonObject(before.data);
  setValueAtPath(data, fieldPath, value);

  const revisionId = await persistSectionDataChange(env, {
    site,
    page,
    section,
    before,
    data,
    actor,
    action: "update_cta",
    targetPath: fieldPath,
  });

  return {
    site: site.slug,
    page: page.slug,
    sectionId: section.section_key,
    path: fieldPath,
    value,
    revisionId,
    published: true,
    previewUrl: page.slug === "home" ? "/" : `/${page.slug}`,
  };
}

export async function updateRichText(env, input) {
  const siteSlug = requiredPattern(input?.site, "site", SLUG_PATTERN);
  const pageSlug = requiredPattern(input?.page, "page", SLUG_PATTERN);
  const sectionKey = requiredPattern(input?.sectionId, "sectionId", SECTION_KEY_PATTERN);
  const fieldPath = requiredPattern(input?.path, "path", TEXT_PATH_PATTERN);
  const actor = requiredString(input?.actor || "mcp");

  const { site, page, section } = await loadSection(env, siteSlug, pageSlug, sectionKey);
  const field = resolveEditableField(page.slug, section, fieldPath);
  if (!field || field.kind !== "rich_text" || field.richTextTool !== "update_rich_text") {
    throw new Error(`Field is not editable with update_rich_text: ${fieldPath}`);
  }

  const value = normalizeRichTextValue(input?.value, field);
  const before = serializeSection(section);
  const data = cloneJsonObject(before.data);
  setValueAtPath(data, fieldPath, value);

  const revisionId = await persistSectionDataChange(env, {
    site,
    page,
    section,
    before,
    data,
    actor,
    action: "update_rich_text",
    targetPath: fieldPath,
  });

  return {
    site: site.slug,
    page: page.slug,
    sectionId: section.section_key,
    path: fieldPath,
    value,
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

async function persistSectionDataChange(env, options) {
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

function canUpdateWithPlainText(field) {
  if (field.kind === "plain_text" || field.kind === "text_list") return true;
  return field.kind === "rich_text" && field.plainTextTool === "update_text";
}

function normalizeTextValue(value, field) {
  if (typeof value !== "string") {
    throw new Error("Missing text value.");
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new Error("Missing text value.");
  }

  if (/<\/?[A-Za-z][^>]*>/.test(normalized)) {
    throw new Error("HTML is not allowed in update_text.");
  }

  if (field.maxLength && [...normalized].length > field.maxLength) {
    throw new Error(`Text value exceeds max length ${field.maxLength}.`);
  }

  return normalized;
}

function normalizeCtaValue(input, field) {
  const href = normalizeHref(input?.href, { nullable: field.nullable === true });
  if (field.path.endsWith(".href")) return href;

  return {
    label: normalizeTextValue(input?.label, { maxLength: 80 }),
    href,
  };
}

function normalizeRichTextValue(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.format !== "rich_text_v1") {
    throw new Error("Invalid rich_text_v1 value.");
  }

  if (!Array.isArray(value.blocks) || value.blocks.length === 0) {
    throw new Error("rich_text_v1 requires at least one block.");
  }

  let plainLength = 0;
  const blocks = value.blocks.map((block) => {
    if (!block || typeof block !== "object" || block.type !== "paragraph" || !Array.isArray(block.spans)) {
      throw new Error("rich_text_v1 supports paragraph blocks only.");
    }

    if (block.spans.length === 0) {
      throw new Error("rich_text_v1 paragraph requires spans.");
    }

    const spans = block.spans.map((span) => {
      if (!span || typeof span !== "object" || typeof span.text !== "string") {
        throw new Error("Invalid rich text span.");
      }

      const text = span.text;
      if (!text) {
        throw new Error("Invalid rich text span.");
      }

      if (/<\/?[A-Za-z][^>]*>/.test(text)) {
        throw new Error("HTML is not allowed in rich text.");
      }

      plainLength += [...text].length;
      const marks = normalizeMarks(span.marks);
      const normalized = {
        text,
        marks,
      };

      if (span.link != null) {
        normalized.link = {
          href: normalizeHref(span.link?.href),
        };
      }

      return normalized;
    });

    return {
      type: "paragraph",
      spans,
    };
  });

  if (plainLength === 0) {
    throw new Error("rich_text_v1 requires text.");
  }

  if (field.maxLength && plainLength > field.maxLength) {
    throw new Error(`Rich text exceeds max length ${field.maxLength}.`);
  }

  return {
    format: "rich_text_v1",
    blocks,
  };
}

function normalizeMarks(value) {
  const marks = Array.isArray(value) ? value : [];
  const normalized = [];

  for (const mark of marks) {
    if (mark !== "bold" && mark !== "italic") {
      throw new Error(`Unsupported rich text mark: ${mark}`);
    }

    if (!normalized.includes(mark)) normalized.push(mark);
  }

  return normalized;
}

function normalizeHref(value, options = {}) {
  if (value == null && options.nullable) return null;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Invalid href.");
  }

  const href = value.trim();
  if (/<\/?[A-Za-z][^>]*>/.test(href) || href.includes("..")) {
    throw new Error("Invalid href.");
  }

  if (/^\/(?!\/)[A-Za-z0-9._~!$&'()*+,;=:@/%?#-]*$/.test(href)) return href;
  if (/^https:\/\/[^\s<>"']+$/i.test(href)) return href;
  if (/^mailto:[^\s<>"']+@[^\s<>"']+$/i.test(href)) return href;
  if (/^tel:\+?[0-9 ().-]{3,30}$/i.test(href)) return href;
  if (/^(index|portfolio|about|contact)\.html$/.test(href)) return href;

  throw new Error("Invalid href.");
}

function cloneJsonObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid section data.");
  }

  return JSON.parse(JSON.stringify(value));
}

function setTextAtPath(data, path, value) {
  setValueAtPath(data, path, value);
}

function setValueAtPath(data, path, value) {
  const segments = parsePath(path);
  let current = data;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const isLast = index === segments.length - 1;

    if (isLast) {
      setSegmentValue(current, segment, value, path);
      return;
    }

    current = readSegmentValue(current, segment, path);
  }
}

function parsePath(path) {
  return path.split(".").map((part) => {
    const match = /^([A-Za-z][A-Za-z0-9_]*)(?:\[((?:0|[1-9]\d*))\])?$/.exec(part);
    if (!match || isDangerousKey(match[1])) {
      throw new Error(`Invalid path: ${path}`);
    }

    return {
      key: match[1],
      index: match[2] === undefined ? null : Number(match[2]),
    };
  });
}

function readSegmentValue(current, segment, path) {
  if (!isObjectRecord(current)) {
    throw new Error(`Path does not exist: ${path}`);
  }

  const next = current[segment.key];
  if (segment.index === null) {
    if (!isObjectRecord(next)) throw new Error(`Path does not exist: ${path}`);
    return next;
  }

  if (!Array.isArray(next) || segment.index >= next.length || !isObjectRecord(next[segment.index])) {
    throw new Error(`Path does not exist: ${path}`);
  }

  return next[segment.index];
}

function setSegmentValue(current, segment, value, path) {
  if (!isObjectRecord(current)) {
    throw new Error(`Path does not exist: ${path}`);
  }

  if (segment.index === null) {
    current[segment.key] = value;
    return;
  }

  const array = current[segment.key];
  if (!Array.isArray(array) || segment.index >= array.length) {
    throw new Error(`Path does not exist: ${path}`);
  }

  array[segment.index] = value;
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isDangerousKey(value) {
  return value === "__proto__" || value === "constructor" || value === "prototype";
}

function safeJson(value) {
  if (value == null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
