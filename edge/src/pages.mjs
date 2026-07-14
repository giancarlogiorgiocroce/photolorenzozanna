import { resolveSectionContract } from "./page-contracts.mjs";

const SLUG_PATTERN = /^[a-z0-9-]{1,80}$/;

export async function getPage(env, input) {
  const siteSlug = requiredPattern(input?.site, "site", SLUG_PATTERN);
  const pageSlug = requiredPattern(input?.page, "page", SLUG_PATTERN);

  if (!env?.DB) {
    throw new Error("D1 binding DB is not configured.");
  }

  const site = await env.DB.prepare("SELECT id, slug FROM sites WHERE slug = ?")
    .bind(siteSlug)
    .first();

  if (!site) {
    throw new Error(`Site not found: ${siteSlug}`);
  }

  const page = await env.DB.prepare(
    `SELECT id, slug, title, status
     FROM pages
     WHERE site_id = ? AND slug = ?`,
  )
    .bind(site.id, pageSlug)
    .first();

  if (!page) {
    throw new Error(`Page not found: ${pageSlug}`);
  }

  const sectionsResult = await env.DB.prepare(
    `SELECT id, section_key, type, section_order, enabled, data
     FROM page_sections
     WHERE page_id = ?
     ORDER BY section_order ASC`,
  )
    .bind(page.id)
    .all();

  return {
    site: site.slug,
    page: page.slug,
    title: page.title,
    status: page.status,
    sections: (sectionsResult.results ?? []).map((section) => serializeSection(page.slug, section)),
  };
}

function serializeSection(pageSlug, section) {
  const contract = resolveSectionContract(pageSlug, section);
  return {
    id: section.id,
    sectionId: section.section_key,
    type: section.type,
    styleContract: contract.styleContract,
    order: Number(section.section_order),
    enabled: Number(section.enabled) === 1,
    editableFields: contract.editableFields,
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
