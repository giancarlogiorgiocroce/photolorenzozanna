const SLUG_PATTERN = /^[a-z0-9-]{1,80}$/;

export async function renderPageHtml(env, input) {
  const siteSlug = requiredPattern(input?.site, "site", SLUG_PATTERN);
  const pageSlug = requiredPattern(input?.page, "page", SLUG_PATTERN);

  if (!env?.DB) {
    throw new Error("D1 binding DB is not configured.");
  }

  const site = await env.DB.prepare("SELECT id, slug, name, status FROM sites WHERE slug = ?")
    .bind(siteSlug)
    .first();

  if (!site || site.status !== "published") {
    throw new Error(`Site not found: ${siteSlug}`);
  }

  const page = await env.DB.prepare(
    `SELECT id, slug, title, status
     FROM pages
     WHERE site_id = ? AND slug = ? AND status = 'published'`,
  )
    .bind(site.id, pageSlug)
    .first();

  if (!page) {
    throw new Error(`Page not found: ${pageSlug}`);
  }

  const sectionsResult = await env.DB.prepare(
    `SELECT id, section_key, type, section_order, enabled, data
     FROM page_sections
     WHERE page_id = ? AND enabled = 1
     ORDER BY section_order ASC`,
  )
    .bind(page.id)
    .all();

  const sections = (sectionsResult.results ?? []).map(normalizeSection);
  const title = escapeHtml(page.title);
  const body = sections.map(renderSection).join("\n");

  return `<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
  </head>
  <body>
    <main>
${indent(body, 6)}
    </main>
  </body>
</html>`;
}

function normalizeSection(section) {
  return {
    id: section.id,
    sectionId: section.section_key,
    type: section.type,
    order: Number(section.section_order),
    data: safeJson(section.data) ?? {},
  };
}

function renderSection(section) {
  if (section.type === "hero") return renderHero(section);
  if (section.type === "text") return renderText(section);
  if (section.type === "faq") return renderFaq(section);
  return "";
}

function renderHero(section) {
  const title = escapeHtml(section.data.title ?? "");
  const intro = escapeHtml(section.data.intro ?? "");

  return `<section data-section-id="${escapeAttribute(section.sectionId)}" data-section-type="hero">
  <h1>${title}</h1>
  ${intro ? `<p>${intro}</p>` : ""}
</section>`;
}

function renderText(section) {
  const title = escapeHtml(section.data.title ?? "");
  const paragraphs = Array.isArray(section.data.paragraphs) ? section.data.paragraphs : [];

  return `<section data-section-id="${escapeAttribute(section.sectionId)}" data-section-type="text">
  ${title ? `<h2>${title}</h2>` : ""}
${indent(paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("\n"), 2)}
</section>`;
}

function renderFaq(section) {
  const title = escapeHtml(section.data.title ?? "FAQ");
  const items = Array.isArray(section.data.items) ? section.data.items : [];

  return `<section data-section-id="${escapeAttribute(section.sectionId)}" data-section-type="faq">
  <h2>${title}</h2>
${indent(items.map(renderFaqItem).join("\n"), 2)}
</section>`;
}

function renderFaqItem(item) {
  return `<details>
  <summary>${escapeHtml(item.question ?? "")}</summary>
  <p>${escapeHtml(item.answer ?? "")}</p>
</details>`;
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function indent(value, spaces) {
  if (!value) return "";
  const prefix = " ".repeat(spaces);
  return value
    .split("\n")
    .map((line) => (line ? `${prefix}${line}` : line))
    .join("\n");
}
