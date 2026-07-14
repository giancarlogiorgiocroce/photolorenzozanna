import { getSectionPreset } from "./section-presets.mjs";

const SLUG_PATTERN = /^[a-z0-9-]{1,80}$/;
const SECTION_KEY_PATTERN = /^[a-z0-9_-]{1,80}$/;
const MAX_FAQ_ITEMS = 12;

export async function addSectionFromPreset(env, input) {
  const presetId = requiredString(input?.presetId ?? input?.preset, "presetId");
  const preset = getSectionPreset(presetId);

  if (!preset) {
    throw new Error(`Unknown section preset: ${presetId}`);
  }

  if (preset.id === "faq") {
    return addFaqSection(env, input);
  }

  throw new Error(`Section preset is not addable yet: ${presetId}`);
}

export async function addFaqSection(env, input) {
  const siteSlug = requiredPattern(input?.site, "site", SLUG_PATTERN);
  const pageSlug = requiredPattern(input?.page, "page", SLUG_PATTERN);
  const sectionKey = requiredPattern(input?.sectionId ?? "faq", "sectionId", SECTION_KEY_PATTERN);
  const actor = requiredString(input?.actor || "mcp", "actor");

  if (sectionKey !== "faq") {
    throw new Error("add_faq_section can only create or enable sectionId faq.");
  }

  const { site, page } = await loadPage(env, siteSlug, pageSlug);
  const sections = await listPageSections(env, page.id);
  const existing = sections.find((section) => section.section_key === sectionKey);

  if (existing) {
    if (Number(existing.enabled) === 1) {
      const data = safeJson(existing.data) ?? {};
      return sectionResult(site, page, existing, {
        created: false,
        alreadyExists: true,
        itemCount: countFaqItems(data),
      });
    }

    const before = serializeSection(existing);
    const after = { ...before, enabled: true };
    const revisionId = await persistVisibilityChange(env, {
      site,
      page,
      section: existing,
      before,
      after,
      actor,
      action: "add_faq_section",
    });

    return sectionResult(site, page, { ...existing, enabled: 1 }, {
      created: false,
      revisionId,
      itemCount: countFaqItems(before.data),
    });
  }

  const data = normalizeFaqSectionData(input);
  const order = faqOrderFor(sections);
  const section = {
    id: `section_${site.slug}_${page.slug}_${sectionKey}`.replace(/[^A-Za-z0-9_-]/g, "_"),
    page_id: page.id,
    section_key: sectionKey,
    type: "faq",
    section_order: order,
    enabled: 1,
    data: JSON.stringify(data),
  };
  const after = serializeSection(section);
  const revisionId = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO page_sections (
       id, page_id, section_key, type, section_order, enabled, data, created_at, updated_at
     )
     VALUES (?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))`,
  )
    .bind(section.id, page.id, sectionKey, "faq", order, JSON.stringify(data))
    .run();

  await env.DB.prepare(
    `INSERT INTO section_revisions (
       id, section_id, actor, action, before_json, after_json, created_at
     )
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
  )
    .bind(revisionId, section.id, actor, "add_faq_section", null, JSON.stringify(after))
    .run();

  await logSectionChange(env, {
    site,
    page,
    sectionKey,
    actor,
    action: "add_faq_section",
    before: null,
    after,
  });

  return sectionResult(site, page, section, {
    created: true,
    revisionId,
    itemCount: data.items.length,
  });
}

export async function addFaqItem(env, input) {
  const actor = requiredString(input?.actor || "mcp", "actor");
  const { site, page, section } = await loadFaqSection(env, input);
  const before = serializeSection(section);
  const data = cloneDataObject(before.data);
  const items = normalizeFaqItemsArray(data.items);

  if (items.length >= MAX_FAQ_ITEMS) {
    throw new Error(`FAQ cannot contain more than ${MAX_FAQ_ITEMS} items.`);
  }

  const item = normalizeFaqItem(input);
  const index = normalizeInsertIndex(input?.index ?? input?.position, items.length);
  items.splice(index, 0, item);
  data.items = items;

  const revisionId = await persistFaqDataChange(env, {
    site,
    page,
    section,
    before,
    data,
    actor,
    action: "add_faq_item",
    targetPath: `items[${index}]`,
  });

  return {
    site: site.slug,
    page: page.slug,
    sectionId: section.section_key,
    itemIndex: index,
    item,
    itemCount: items.length,
    revisionId,
    published: true,
    previewUrl: previewUrl(page.slug),
  };
}

export async function updateFaqItem(env, input) {
  const actor = requiredString(input?.actor || "mcp", "actor");
  const { site, page, section } = await loadFaqSection(env, input);
  const before = serializeSection(section);
  const data = cloneDataObject(before.data);
  const items = normalizeFaqItemsArray(data.items);
  const index = normalizeExistingIndex(input?.index, items.length);

  if (input?.question == null && input?.answer == null) {
    throw new Error("update_faq_item requires question or answer.");
  }

  const item = { ...items[index] };
  if (input.question != null) item.question = normalizePlainText(input.question, "question", 160);
  if (input.answer != null) item.answer = normalizeFaqAnswer(input.answer);
  items[index] = item;
  data.items = items;

  const revisionId = await persistFaqDataChange(env, {
    site,
    page,
    section,
    before,
    data,
    actor,
    action: "update_faq_item",
    targetPath: `items[${index}]`,
  });

  return {
    site: site.slug,
    page: page.slug,
    sectionId: section.section_key,
    itemIndex: index,
    item,
    revisionId,
    published: true,
    previewUrl: previewUrl(page.slug),
  };
}

export async function removeFaqItem(env, input) {
  const actor = requiredString(input?.actor || "mcp", "actor");
  const { site, page, section } = await loadFaqSection(env, input);
  const before = serializeSection(section);
  const data = cloneDataObject(before.data);
  const items = normalizeFaqItemsArray(data.items);
  const index = normalizeExistingIndex(input?.index, items.length);
  const [removed] = items.splice(index, 1);
  data.items = items;

  const revisionId = await persistFaqDataChange(env, {
    site,
    page,
    section,
    before,
    data,
    actor,
    action: "remove_faq_item",
    targetPath: `items[${index}]`,
  });

  return {
    site: site.slug,
    page: page.slug,
    sectionId: section.section_key,
    itemIndex: index,
    removed,
    itemCount: items.length,
    revisionId,
    published: true,
    previewUrl: previewUrl(page.slug),
  };
}

export async function reorderFaqItems(env, input) {
  const actor = requiredString(input?.actor || "mcp", "actor");
  const { site, page, section } = await loadFaqSection(env, input);
  const before = serializeSection(section);
  const data = cloneDataObject(before.data);
  const items = normalizeFaqItemsArray(data.items);
  const order = normalizeOrder(input?.order, items.length);
  data.items = order.map((index) => items[index]);

  const revisionId = await persistFaqDataChange(env, {
    site,
    page,
    section,
    before,
    data,
    actor,
    action: "reorder_faq_items",
    targetPath: "items",
  });

  return {
    site: site.slug,
    page: page.slug,
    sectionId: section.section_key,
    order,
    itemCount: data.items.length,
    revisionId,
    published: true,
    previewUrl: previewUrl(page.slug),
  };
}

async function loadFaqSection(env, input) {
  const siteSlug = requiredPattern(input?.site, "site", SLUG_PATTERN);
  const pageSlug = requiredPattern(input?.page, "page", SLUG_PATTERN);
  const sectionKey = requiredPattern(input?.sectionId ?? "faq", "sectionId", SECTION_KEY_PATTERN);
  const { site, page } = await loadPage(env, siteSlug, pageSlug);
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

  if (section.type !== "faq") {
    throw new Error(`Section is not a FAQ: ${pageSlug}/${sectionKey}`);
  }

  return { site, page, section };
}

async function loadPage(env, siteSlug, pageSlug) {
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

  return { site, page };
}

async function listPageSections(env, pageId) {
  const rows = await env.DB.prepare(
    `SELECT id, section_key, type, section_order, enabled, data
     FROM page_sections
     WHERE page_id = ?
     ORDER BY section_order ASC`,
  )
    .bind(pageId)
    .all();

  return rows.results ?? [];
}

async function persistVisibilityChange(env, options) {
  const revisionId = crypto.randomUUID();

  await env.DB.prepare(
    `UPDATE page_sections
     SET enabled = 1, updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(options.section.id)
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
      JSON.stringify(options.after),
    )
    .run();

  await logSectionChange(env, {
    site: options.site,
    page: options.page,
    sectionKey: options.section.section_key,
    actor: options.actor,
    action: options.action,
    before: options.before,
    after: options.after,
  });

  return revisionId;
}

async function persistFaqDataChange(env, options) {
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

  await logSectionChange(env, {
    site: options.site,
    page: options.page,
    sectionKey: options.section.section_key,
    actor: options.actor,
    action: options.action,
    before: options.before,
    after,
    targetPath: options.targetPath,
  });

  return revisionId;
}

async function logSectionChange(env, options) {
  const target = `pages/${options.page.slug}/sections/${options.sectionKey}`
    + (options.targetPath ? `/${options.targetPath}` : "");

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
      target,
      options.before == null ? null : JSON.stringify(options.before),
      options.after == null ? null : JSON.stringify(options.after),
    )
    .run();
}

function normalizeFaqSectionData(input) {
  const data = {
    type: "faq",
    title: normalizePlainText(input?.title ?? "Domande frequenti", "title", 90),
    items: normalizeFaqItems(input?.items ?? []),
  };

  if (input?.intro != null) {
    data.intro = normalizePlainText(input.intro, "intro", 260);
  }

  return data;
}

function normalizeFaqItems(items) {
  if (!Array.isArray(items)) {
    throw new Error("FAQ items must be an array.");
  }

  if (items.length > MAX_FAQ_ITEMS) {
    throw new Error(`FAQ cannot contain more than ${MAX_FAQ_ITEMS} items.`);
  }

  return items.map((item) => normalizeFaqItem(item));
}

function normalizeFaqItem(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("FAQ item must be an object.");
  }

  return {
    question: normalizePlainText(input.question, "question", 160),
    answer: normalizeFaqAnswer(input.answer),
  };
}

function normalizeFaqAnswer(value) {
  if (typeof value === "string") {
    return normalizePlainText(value, "answer", 700);
  }

  return normalizeRichTextValue(value, { maxLength: 700 });
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
      if (!text || /<\/?[A-Za-z][^>]*>/.test(text)) {
        throw new Error("HTML is not allowed.");
      }

      plainLength += [...text].length;
      const normalized = {
        text,
        marks: normalizeMarks(span.marks),
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

function normalizeHref(value) {
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

function normalizeFaqItemsArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeFaqItem(item));
}

function normalizeInsertIndex(value, length) {
  if (value == null) return length;
  if (!Number.isInteger(value) || value < 0 || value > length) {
    throw new Error("Invalid FAQ item index.");
  }
  return value;
}

function normalizeExistingIndex(value, length) {
  if (!Number.isInteger(value) || value < 0 || value >= length) {
    throw new Error("Invalid FAQ item index.");
  }
  return value;
}

function normalizeOrder(value, length) {
  if (!Array.isArray(value) || value.length !== length) {
    throw new Error("FAQ order must include every item index exactly once.");
  }

  const seen = new Set();
  for (const item of value) {
    if (!Number.isInteger(item) || item < 0 || item >= length || seen.has(item)) {
      throw new Error("FAQ order must include every item index exactly once.");
    }
    seen.add(item);
  }

  return [...value];
}

function faqOrderFor(sections) {
  const cta = sections.find((section) => section.section_key === "cta");
  if (cta) return Number(cta.section_order) - 10;
  const maxOrder = sections.reduce((max, section) => Math.max(max, Number(section.section_order)), 0);
  return maxOrder + 10;
}

function sectionResult(site, page, section, extra = {}) {
  return {
    site: site.slug,
    page: page.slug,
    sectionId: section.section_key,
    type: section.type,
    enabled: Number(section.enabled) === 1,
    published: true,
    previewUrl: previewUrl(page.slug),
    ...extra,
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

function countFaqItems(data) {
  return Array.isArray(data?.items) ? data.items.length : 0;
}

function requiredString(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing ${name}.`);
  }
  return value.trim();
}

function requiredPattern(value, name, pattern) {
  const normalized = requiredString(value, name);
  if (!pattern.test(normalized)) {
    throw new Error(`Invalid ${name}.`);
  }
  return normalized;
}

function cloneDataObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid section data.");
  }

  return JSON.parse(JSON.stringify(value));
}

function previewUrl(pageSlug) {
  return pageSlug === "home" ? "/" : `/${pageSlug}`;
}

function safeJson(value) {
  if (value == null) return null;
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return null;
  }
}
