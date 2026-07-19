import { renderPageHtml } from "./rendering.mjs";
import { handleMcpHttpRequest } from "./mcp-http.mjs";
import { handleMediaUploadRequest } from "./media.mjs";
import { handleOAuthRequest } from "./oauth.mjs";
import {
  getAuthorizationServerMetadata,
  getProtectedResourceMetadata,
} from "./oauth-metadata.mjs";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
};

const TEXT_HEADERS = {
  "content-type": "text/plain; charset=utf-8",
  "cache-control": "no-store",
};

const XML_HEADERS = {
  "content-type": "application/xml; charset=utf-8",
  "cache-control": "no-store",
};

const HTML_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
};

const SLUG_PATTERN = /^[a-z0-9-]{2,64}$/;
const KEY_PATTERN = /^[a-z0-9_-]{1,80}$/;
const PUBLIC_HOST_PREFIXES = new Set(["api", "www", "cms", "admin", "mcp"]);
const DYNAMIC_PAGE_ROUTES = [
  "/",
  "/index.html",
  "/portfolio",
  "/portfolio.html",
  "/about",
  "/about.html",
  "/contact",
  "/contact.html",
];
const DYNAMIC_PAGE_SLUGS = ["home", "chi-sono", "portfolio", "contatti"];
const PAGE_ROUTE_ALIASES = new Map([
  ["about", "chi-sono"],
  ["contact", "contatti"],
]);
const CANONICAL_PAGE_PATHS = ["/", "/portfolio", "/about", "/contact"];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = getCorsHeaders(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      const response = await routeRequest(request, env, url);
      return withCors(response, corsHeaders);
    } catch (error) {
      console.error(error);
      return withCors(
        json({ error: "internal_error", message: "Unexpected API error." }, 500),
        corsHeaders,
      );
    }
  },
};

async function routeRequest(request, env, url) {
  const segments = url.pathname.split("/").filter(Boolean);

  if (request.method === "GET" && url.pathname === "/.well-known/oauth-protected-resource") {
    return json(getProtectedResourceMetadata(request));
  }

  if (
    request.method === "GET"
    && (
      url.pathname === "/.well-known/oauth-authorization-server"
      || url.pathname === "/.well-known/openid-configuration"
    )
  ) {
    return json(getAuthorizationServerMetadata(request));
  }

  if (segments[0] === "oauth") {
    return handleOAuthRequest(request, env, url, segments);
  }

  if (url.pathname === "/robots.txt" || url.pathname === "/sitemap.xml") {
    return handleSeoRoute(request, env, url);
  }

  if (!env.DB) {
    return json({ error: "missing_db", message: "D1 binding DB is not configured." }, 500);
  }

  if (segments.length === 0 && isServiceHost(request, env)) {
    return getServiceManifest();
  }

  if (segments[0] !== "api") {
    if (segments[0] === "mcp" && segments.length === 1) {
      return handleMcpHttpRequest(request, env);
    }

    if (segments[0] === "media") {
      return handleMediaUploadRequest(request, env, segments);
    }

    return handlePageRoute(request, env, url, segments);
  }

  if (segments[1] === "health" && request.method === "GET") {
    return json({ status: "ok", service: "lorenzozanna-edge" });
  }

  if (segments[1] === "public") {
    return handlePublicRoute(request, env, url, segments);
  }

  if (segments[1] === "private") {
    const auth = await requirePrivateAuth(request, env);
    if (!auth.ok) return auth.response;
    return handlePrivateRoute(request, env, segments, auth.actor);
  }

  return json({ error: "not_found", message: "API route not found." }, 404);
}

function handleSeoRoute(request, env, url) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return json({ error: "method_not_allowed", message: "Use GET or HEAD for SEO routes." }, 405);
  }

  const site = resolveSlugFromRequest(request, env, url);
  if (!site) {
    return json({ error: "unknown_site", message: "Unable to resolve site from host." }, 404);
  }

  const origin = getCanonicalOrigin(site, env);
  if (url.pathname === "/robots.txt") {
    return text(renderRobotsTxt(origin), 200, { head: request.method === "HEAD" });
  }

  return xml(renderSitemapXml(origin), 200, { head: request.method === "HEAD" });
}

async function handlePageRoute(request, env, url, segments) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return json({ error: "method_not_allowed", message: "Use GET or HEAD for public pages." }, 405);
  }

  const site = resolveSlugFromRequest(request, env, url);
  if (!site) {
    return json({ error: "unknown_site", message: "Unable to resolve site from host." }, 404);
  }

  const canonicalPath = getCanonicalRedirectPath(segments);
  if (canonicalPath) {
    return redirect(url, canonicalPath, 301);
  }

  const page = resolvePageSlug(segments);
  if (!page) {
    return json({ error: "not_found", message: "Route not found." }, 404);
  }

  try {
    return html(await renderPageHtml(env, { site, page }), 200, {
      head: request.method === "HEAD",
    });
  } catch (error) {
    if (isMissingDynamicSchemaError(error)) {
      return json(
        {
          error: "dynamic_schema_not_ready",
          message: "Dynamic page tables are not migrated yet.",
        },
        503,
      );
    }

    if (error.message?.includes("not found")) {
      return json({ error: "not_found", message: "Page not found." }, 404);
    }
    throw error;
  }
}

function getCanonicalRedirectPath(segments) {
  if (segments.length !== 1) return null;

  const segment = segments[0];
  if (segment === "index.html" || segment === "index.php") return "/";
  if (segment === "portfolio.html") return "/portfolio";
  if (segment === "about.html") return "/about";
  if (segment === "contact.html") return "/contact";
  return null;
}

function getCanonicalOrigin(site, env) {
  return `https://${site}.${getRootDomain(env)}`;
}

function renderRobotsTxt(origin) {
  return [
    "User-agent: *",
    "Allow: /",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");
}

function renderSitemapXml(origin) {
  const urls = CANONICAL_PAGE_PATHS
    .map((path) => `  <url><loc>${origin}${path}</loc></url>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

async function handlePublicRoute(request, env, url, segments) {
  if (request.method !== "GET") {
    return json({ error: "method_not_allowed", message: "Use GET for public routes." }, 405);
  }

  if (segments[2] === "site" || segments[2] === "content") {
    const slug = resolveSlugFromRequest(request, env, url);
    if (!slug) {
      return json({ error: "unknown_site", message: "Unable to resolve site from host." }, 404);
    }
    return getSiteResponse(env, slug, { publicOnly: true, contentOnly: segments[2] === "content" });
  }

  if (segments[2] === "sites" && segments[3]) {
    const slug = segments[3];
    const contentOnly = segments[4] === "content";
    if (!isValidSlug(slug)) return invalidSlugResponse();
    return getSiteResponse(env, slug, { publicOnly: true, contentOnly });
  }

  return json({ error: "not_found", message: "Public route not found." }, 404);
}

async function handlePrivateRoute(request, env, segments, actor) {
  if (segments[2] === "schema" && request.method === "GET") {
    return json({
      auth: "Authorization: Bearer <AI_API_TOKEN>",
      siteSlugPattern: SLUG_PATTERN.toString(),
      contentKeyPattern: KEY_PATTERN.toString(),
      endpoints: {
        listSites: "GET /api/private/sites",
        createSite: "POST /api/private/sites",
        getSite: "GET /api/private/sites/:slug",
        upsertContent: "PUT /api/private/sites/:slug/content/:collection/:key",
        publishContent: "POST /api/private/sites/:slug/publish",
        changes: "GET /api/private/sites/:slug/changes",
      },
      contentRules: [
        "data must be a JSON object",
        "HTML, scripts and arbitrary code should not be stored in content fields",
        "private writes are draft by default unless publish=true is sent",
      ],
    });
  }

  if (segments[2] !== "sites") {
    return json({ error: "not_found", message: "Private route not found." }, 404);
  }

  if (segments.length === 3 && request.method === "GET") {
    const sites = await env.DB.prepare(
      "SELECT slug, name, primary_host, status, created_at, updated_at FROM sites ORDER BY slug ASC",
    ).all();
    return json({ sites: sites.results ?? [] });
  }

  if (segments.length === 3 && request.method === "POST") {
    return createSite(request, env, actor);
  }

  const slug = segments[3];
  if (!isValidSlug(slug)) return invalidSlugResponse();

  if (segments.length === 4 && request.method === "GET") {
    return getSiteResponse(env, slug, { publicOnly: false });
  }

  if (segments[4] === "content" && segments.length === 7) {
    if (request.method !== "PUT" && request.method !== "PATCH") {
      return json({ error: "method_not_allowed", message: "Use PUT or PATCH for content writes." }, 405);
    }

    const collection = segments[5];
    const key = segments[6];
    if (!isValidKey(collection) || !isValidKey(key)) {
      return json({ error: "invalid_key", message: "Collection and key must be URL-safe identifiers." }, 400);
    }

    return upsertContent(request, env, slug, collection, key, actor);
  }

  if (segments[4] === "publish" && segments.length === 5 && request.method === "POST") {
    return publishContent(request, env, slug, actor);
  }

  if (segments[4] === "changes" && segments.length === 5 && request.method === "GET") {
    return getChanges(env, slug);
  }

  return json({ error: "not_found", message: "Private site route not found." }, 404);
}

async function createSite(request, env, actor) {
  const body = await readJson(request);
  if (!body.ok) return body.response;

  const slug = String(body.value.slug ?? "").trim().toLowerCase();
  const name = String(body.value.name ?? "").trim();
  const status = body.value.status === "published" ? "published" : "draft";
  const rootDomain = getRootDomain(env);
  const primaryHost = String(body.value.primaryHost ?? `${slug}.${rootDomain}`).trim().toLowerCase();

  if (!isValidSlug(slug)) return invalidSlugResponse();
  if (!name) return json({ error: "invalid_name", message: "Site name is required." }, 400);
  if (primaryHost !== rootDomain && !primaryHost.endsWith(`.${rootDomain}`)) {
    return json({ error: "invalid_host", message: `Host must belong to ${rootDomain}.` }, 400);
  }

  const existing = await getSite(env, slug);
  const siteId = existing?.id ?? crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO sites (id, slug, name, primary_host, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(slug) DO UPDATE SET
       name = excluded.name,
       primary_host = excluded.primary_host,
       status = excluded.status,
       updated_at = datetime('now')`,
  )
    .bind(siteId, slug, name, primaryHost, status)
    .run();

  await logChange(env, siteId, actor, existing ? "update_site" : "create_site", slug, existing, {
    slug,
    name,
    primaryHost,
    status,
  });

  return getSiteResponse(env, slug, { publicOnly: false }, existing ? 200 : 201);
}

async function upsertContent(request, env, slug, collection, key, actor) {
  const body = await readJson(request);
  if (!body.ok) return body.response;

  const site = await getSite(env, slug);
  if (!site) return json({ error: "site_not_found", message: `Site "${slug}" does not exist.` }, 404);

  const data = body.value.data;
  if (!isPlainObject(data)) {
    return json({ error: "invalid_data", message: "Body must include a JSON object in data." }, 400);
  }

  const requestedStatus = body.value.publish === true || body.value.status === "published"
    ? "published"
    : "draft";
  const existing = await getContentEntry(env, site.id, collection, key);
  const entryId = existing?.id ?? crypto.randomUUID();
  const serialized = JSON.stringify(data);

  await env.DB.prepare(
    `INSERT INTO content_entries (
       id, site_id, collection, item_key, data, status, created_at, updated_at, published_at
     )
     VALUES (
       ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'),
       CASE WHEN ? = 'published' THEN datetime('now') ELSE NULL END
     )
     ON CONFLICT(site_id, collection, item_key) DO UPDATE SET
       data = excluded.data,
       status = excluded.status,
       updated_at = datetime('now'),
       published_at = CASE
         WHEN excluded.status = 'published' THEN datetime('now')
         ELSE content_entries.published_at
       END`,
  )
    .bind(entryId, site.id, collection, key, serialized, requestedStatus, requestedStatus)
    .run();

  await logChange(
    env,
    site.id,
    actor,
    "upsert_content",
    `${collection}/${key}`,
    existing ? parseEntryData(existing) : null,
    { collection, key, data, status: requestedStatus },
  );

  return json({
    site: slug,
    collection,
    key,
    status: requestedStatus,
    data,
  });
}

async function publishContent(request, env, slug, actor) {
  const body = await readJson(request);
  if (!body.ok) return body.response;

  const site = await getSite(env, slug);
  if (!site) return json({ error: "site_not_found", message: `Site "${slug}" does not exist.` }, 404);

  const collection = body.value.collection ? String(body.value.collection) : null;
  const key = body.value.key ? String(body.value.key) : null;

  if ((collection && !isValidKey(collection)) || (key && !isValidKey(key))) {
    return json({ error: "invalid_key", message: "Collection and key must be URL-safe identifiers." }, 400);
  }

  if (collection && key) {
    await env.DB.prepare(
      `UPDATE content_entries
       SET status = 'published', published_at = datetime('now'), updated_at = datetime('now')
       WHERE site_id = ? AND collection = ? AND item_key = ?`,
    )
      .bind(site.id, collection, key)
      .run();

    await logChange(env, site.id, actor, "publish_content", `${collection}/${key}`, null, {
      collection,
      key,
      status: "published",
    });

    return json({ site: slug, collection, key, status: "published" });
  }

  if (collection && !key) {
    await env.DB.prepare(
      `UPDATE content_entries
       SET status = 'published', published_at = datetime('now'), updated_at = datetime('now')
       WHERE site_id = ? AND collection = ?`,
    )
      .bind(site.id, collection)
      .run();

    await logChange(env, site.id, actor, "publish_collection", collection, null, {
      collection,
      status: "published",
    });

    return json({ site: slug, collection, status: "published" });
  }

  await env.DB.prepare(
    `UPDATE content_entries
     SET status = 'published', published_at = datetime('now'), updated_at = datetime('now')
     WHERE site_id = ?`,
  )
    .bind(site.id)
    .run();

  await logChange(env, site.id, actor, "publish_site", slug, null, { status: "published" });
  return json({ site: slug, status: "published" });
}

async function getSiteResponse(env, slug, options, status = 200) {
  const site = await getSite(env, slug);

  if (!site || (options.publicOnly && site.status !== "published")) {
    return json({ error: "site_not_found", message: `Site "${slug}" is not published or does not exist.` }, 404);
  }

  const entries = await getContentEntries(env, site.id, options.publicOnly);
  const content = entriesToContent(entries);

  if (options.contentOnly) return json({ site: site.slug, content }, status);

  return json(
    {
      site: {
        slug: site.slug,
        name: site.name,
        primaryHost: site.primary_host,
        status: site.status,
        updatedAt: site.updated_at,
      },
      content,
    },
    status,
  );
}

async function getChanges(env, slug) {
  const site = await getSite(env, slug);
  if (!site) return json({ error: "site_not_found", message: `Site "${slug}" does not exist.` }, 404);

  const rows = await env.DB.prepare(
    `SELECT actor, action, target, before_json, after_json, created_at
     FROM change_log
     WHERE site_id = ?
     ORDER BY created_at DESC
     LIMIT 50`,
  )
    .bind(site.id)
    .all();

  const changes = (rows.results ?? []).map((row) => ({
    actor: row.actor,
    action: row.action,
    target: row.target,
    before: safeJson(row.before_json),
    after: safeJson(row.after_json),
    createdAt: row.created_at,
  }));

  return json({ site: slug, changes });
}

async function getSite(env, slug) {
  return env.DB.prepare(
    "SELECT id, slug, name, primary_host, status, created_at, updated_at FROM sites WHERE slug = ?",
  )
    .bind(slug)
    .first();
}

async function getContentEntry(env, siteId, collection, key) {
  return env.DB.prepare(
    `SELECT id, collection, item_key, data, status, updated_at, published_at
     FROM content_entries
     WHERE site_id = ? AND collection = ? AND item_key = ?`,
  )
    .bind(siteId, collection, key)
    .first();
}

async function getContentEntries(env, siteId, publicOnly) {
  const query = publicOnly
    ? `SELECT collection, item_key, data, status, updated_at, published_at
       FROM content_entries
       WHERE site_id = ? AND status = 'published'
       ORDER BY collection ASC, item_key ASC`
    : `SELECT collection, item_key, data, status, updated_at, published_at
       FROM content_entries
       WHERE site_id = ?
       ORDER BY collection ASC, item_key ASC`;

  const rows = await env.DB.prepare(query).bind(siteId).all();
  return rows.results ?? [];
}

async function logChange(env, siteId, actor, action, target, before, after) {
  await env.DB.prepare(
    `INSERT INTO change_log (
       id, site_id, actor, action, target, before_json, after_json, created_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  )
    .bind(
      crypto.randomUUID(),
      siteId,
      actor,
      action,
      target,
      before == null ? null : JSON.stringify(before),
      after == null ? null : JSON.stringify(after),
    )
    .run();
}

function entriesToContent(entries) {
  const content = {};

  for (const entry of entries) {
    if (!content[entry.collection]) content[entry.collection] = {};
    content[entry.collection][entry.item_key] = {
      ...parseEntryData(entry),
      _meta: {
        status: entry.status,
        updatedAt: entry.updated_at,
        publishedAt: entry.published_at,
      },
    };
  }

  return content;
}

function parseEntryData(entry) {
  return safeJson(entry.data) ?? {};
}

function resolveSlugFromRequest(request, env, url) {
  const explicit = url.searchParams.get("site");
  if (explicit && isValidSlug(explicit)) return explicit;

  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const rootDomain = getRootDomain(env);
  if (host === "localhost" || host === "127.0.0.1") return "ph";
  if (!host.endsWith(`.${rootDomain}`)) return null;

  const labels = host.slice(0, -rootDomain.length - 1).split(".");
  const firstLabel = labels[0];
  if (!firstLabel || PUBLIC_HOST_PREFIXES.has(firstLabel)) return null;

  return isValidSlug(firstLabel) ? firstLabel : null;
}

function isServiceHost(request, env) {
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const rootDomain = getRootDomain(env);
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (!host.endsWith(`.${rootDomain}`)) return false;

  const labels = host.slice(0, -rootDomain.length - 1).split(".");
  return PUBLIC_HOST_PREFIXES.has(labels[0]);
}

async function requirePrivateAuth(request, env) {
  const expectedToken = env.AI_API_TOKEN;
  if (!expectedToken) {
    return {
      ok: false,
      response: json({ error: "missing_token", message: "AI_API_TOKEN is not configured." }, 500),
    };
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";

  if (!timingSafeEqual(token, expectedToken)) {
    return {
      ok: false,
      response: json({ error: "unauthorized", message: "Invalid private API token." }, 401),
    };
  }

  return {
    ok: true,
    actor: request.headers.get("x-ai-actor") || "private-api",
  };
}

async function readJson(request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return {
      ok: false,
      response: json({ error: "invalid_content_type", message: "Use application/json." }, 415),
    };
  }

  try {
    return { ok: true, value: await request.json() };
  } catch {
    return {
      ok: false,
      response: json({ error: "invalid_json", message: "Request body is not valid JSON." }, 400),
    };
  }
}

function getRootDomain(env) {
  return String(env.ROOT_DOMAIN ?? "lorenzozanna.com").trim().toLowerCase();
}

function isValidSlug(value) {
  return SLUG_PATTERN.test(String(value ?? ""));
}

function isValidKey(value) {
  return KEY_PATTERN.test(String(value ?? ""));
}

function invalidSlugResponse() {
  return json({ error: "invalid_slug", message: "Slug must be lowercase, URL-safe and 2-64 characters." }, 400);
}

function isMissingDynamicSchemaError(error) {
  const message = String(error?.message ?? "");
  return message.includes("no such table: pages")
    || message.includes("no such table: page_sections")
    || message.includes("no such table: media_assets")
    || message.includes("no such table: media_usages")
    || message.includes("no such table: media_uploads");
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeJson(value) {
  if (value == null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function timingSafeEqual(actual, expected) {
  const encoder = new TextEncoder();
  const actualBytes = encoder.encode(actual);
  const expectedBytes = encoder.encode(expected);

  if (actualBytes.length !== expectedBytes.length) return false;

  let diff = 0;
  for (let index = 0; index < actualBytes.length; index += 1) {
    diff |= actualBytes[index] ^ expectedBytes[index];
  }

  return diff === 0;
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: JSON_HEADERS,
  });
}

function text(body, status = 200, options = {}) {
  return new Response(options.head ? null : body, {
    status,
    headers: TEXT_HEADERS,
  });
}

function xml(body, status = 200, options = {}) {
  return new Response(options.head ? null : body, {
    status,
    headers: XML_HEADERS,
  });
}

function html(markup, status = 200, options = {}) {
  return new Response(options.head ? null : markup, {
    status,
    headers: HTML_HEADERS,
  });
}

function redirect(url, pathname, status = 301) {
  const target = new URL(url.href);
  target.pathname = pathname;
  return new Response(null, {
    status,
    headers: {
      location: target.toString(),
      "cache-control": "no-store",
    },
  });
}

function resolvePageSlug(segments) {
  if (segments.length === 0) return "home";
  if (segments.length !== 1) return null;

  const segment = segments[0];
  if (!segment) return "home";
  if (segment === "index.html") return "home";
  const slug = segment.endsWith(".html") ? segment.slice(0, -".html".length) : segment;
  return PAGE_ROUTE_ALIASES.get(slug) ?? slug;
}

function getServiceManifest() {
  return json({
    name: "lorenzozanna-edge",
    status: "ok",
    routes: [
      "/api/health",
      "/api/public/site",
      "/api/private/schema",
      "/mcp",
      ...DYNAMIC_PAGE_ROUTES,
    ],
    capabilities: {
      publicApi: true,
      privateApi: true,
      remoteMcp: true,
      dynamicPages: DYNAMIC_PAGE_SLUGS,
    },
  });
}

function getCorsHeaders(request, env) {
  const origin = request.headers.get("origin");
  const configured = String(env.ALLOWED_ORIGINS ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  const allowedOrigin = configured.includes(origin) ? origin : configured.includes("*") ? "*" : origin || "*";

  return {
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-methods": "GET,HEAD,POST,PUT,PATCH,OPTIONS",
    "access-control-allow-headers": "authorization,content-type,x-ai-actor",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function withCors(response, corsHeaders) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
