const SLUG_PATTERN = /^[a-z0-9-]{1,80}$/;
const SECTION_KEY_PATTERN = /^[a-z0-9_-]{1,80}$/;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export async function listChanges(env, input) {
  const siteSlug = requiredPattern(input?.site, "site", SLUG_PATTERN);
  const pageSlug = optionalPattern(input?.page, "page", SLUG_PATTERN);
  const sectionKey = optionalPattern(input?.sectionId, "sectionId", SECTION_KEY_PATTERN);
  const limit = normalizeLimit(input?.limit);

  if (sectionKey && !pageSlug) {
    throw new Error("page is required when filtering by sectionId.");
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

  const targetPrefix = buildTargetPrefix(pageSlug, sectionKey);
  const { query, params } = buildChangesQuery(site.id, targetPrefix, limit);
  const rows = await env.DB.prepare(query)
    .bind(...params)
    .all();

  return {
    site: site.slug,
    filters: {
      page: pageSlug ?? null,
      sectionId: sectionKey ?? null,
      limit,
    },
    changes: (rows.results ?? []).map(normalizeChangeRow),
  };
}

function buildChangesQuery(siteId, targetPrefix, limit) {
  const params = [siteId];
  let query = `SELECT id, actor, action, target, before_json, after_json, created_at
     FROM change_log
     WHERE site_id = ?`;

  if (targetPrefix) {
    query += " AND (target = ? OR target LIKE ?)";
    params.push(targetPrefix, `${targetPrefix}/%`);
  }

  query += " ORDER BY created_at DESC LIMIT ?";
  params.push(limit);

  return { query, params };
}

function normalizeChangeRow(row) {
  const target = parseTarget(row.target);

  return {
    id: row.id,
    actor: row.actor,
    action: row.action,
    target: row.target,
    page: target.page,
    sectionId: target.sectionId,
    path: target.path,
    before: safeJson(row.before_json),
    after: safeJson(row.after_json),
    createdAt: row.created_at,
  };
}

function buildTargetPrefix(pageSlug, sectionKey) {
  if (!pageSlug) return "";
  if (!sectionKey) return `pages/${pageSlug}`;
  return `pages/${pageSlug}/sections/${sectionKey}`;
}

function parseTarget(target) {
  const normalized = String(target ?? "");
  const sectionMatch = /^pages\/([^/]+)\/sections\/([^/]+)(?:\/(.+))?$/.exec(normalized);
  if (sectionMatch) {
    return {
      page: sectionMatch[1],
      sectionId: sectionMatch[2],
      path: sectionMatch[3] ?? null,
    };
  }

  const pageMatch = /^pages\/([^/]+)(?:\/(.+))?$/.exec(normalized);
  if (pageMatch) {
    return {
      page: pageMatch[1],
      sectionId: null,
      path: pageMatch[2] ?? null,
    };
  }

  return {
    page: null,
    sectionId: null,
    path: null,
  };
}

function normalizeLimit(value) {
  if (value == null) return DEFAULT_LIMIT;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("Invalid limit.");
  }

  return Math.min(limit, MAX_LIMIT);
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
