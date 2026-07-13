import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.mjs";

const API_TOKEN = "test-token";

test("GET /api/health returns the current service status", async () => {
  const response = await fetchWorker("/api/health");
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload, {
    status: "ok",
    service: "lorenzozanna-edge",
  });
});

test("GET /api/public/sites/ph/content returns only published content", async () => {
  const db = createSeededDb();
  const response = await fetchWorker("/api/public/sites/ph/content", { db });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.site, "ph");
  assert.equal(payload.content.home.hero.title, "Visible hero");
  assert.equal(payload.content.portfolio.faq.title, "Published FAQ");
  assert.equal(payload.content.pages, undefined);
});

test("GET /portfolio renders dynamic HTML from enabled page sections", async () => {
  const db = createSeededDb();
  const response = await fetchWorker("/portfolio", {
    db,
    host: "ph.lorenzozanna.com",
  });
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.match(html, /<h1>Portfolio fotografico<\/h1>/);
  assert.match(html, /data-section-id="faq"/);
  assert.match(html, /Domande frequenti/);
});

test("GET /portfolio.html uses the same dynamic page renderer", async () => {
  const db = createSeededDb();
  const response = await fetchWorker("/portfolio.html", {
    db,
    host: "ph.lorenzozanna.com",
  });
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /<h1>Portfolio fotografico<\/h1>/);
});

test("POST /mcp rejects unauthenticated JSON-RPC requests", async () => {
  const response = await fetchWorker("/mcp", {
    host: "mcp.lorenzozanna.com",
    method: "POST",
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    },
  });
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload.error, "unauthorized");
});

test("POST /mcp initialize returns MCP server metadata", async () => {
  const response = await fetchWorker("/mcp", {
    host: "mcp.lorenzozanna.com",
    method: "POST",
    privateAuth: true,
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: {
          name: "tdd-client",
          version: "0.1.0",
        },
      },
    },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.result.protocolVersion, "2025-06-18");
  assert.equal(payload.result.serverInfo.name, "lorenzozanna-content");
  assert.equal(payload.result.capabilities.tools.listChanged, false);
});

test("POST /mcp tools/list exposes disable_section", async () => {
  const response = await fetchWorker("/mcp", {
    host: "mcp.lorenzozanna.com",
    method: "POST",
    privateAuth: true,
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    },
  });
  const payload = await response.json();
  const toolNames = payload.result.tools.map((tool) => tool.name);

  assert.equal(response.status, 200);
  assert.equal(payload.jsonrpc, "2.0");
  assert.deepEqual(toolNames, ["disable_section"]);
});

test("POST /mcp tools/call disable_section updates D1 and the dynamic portfolio HTML", async () => {
  const db = createSeededDb();
  const beforeResponse = await fetchWorker("/portfolio", {
    db,
    host: "ph.lorenzozanna.com",
  });
  const beforeHtml = await beforeResponse.text();
  assert.match(beforeHtml, /data-section-id="faq"/);

  const mcpResponse = await fetchWorker("/mcp", {
    db,
    host: "mcp.lorenzozanna.com",
    method: "POST",
    privateAuth: true,
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "disable_section",
        arguments: {
          site: "ph",
          page: "portfolio",
          sectionId: "faq",
        },
      },
    },
  });
  const mcpPayload = await mcpResponse.json();

  assert.equal(mcpResponse.status, 200);
  assert.equal(mcpPayload.result.structuredContent.enabled, false);
  assert.equal(mcpPayload.result.structuredContent.sectionId, "faq");

  const afterResponse = await fetchWorker("/portfolio", {
    db,
    host: "ph.lorenzozanna.com",
  });
  const afterHtml = await afterResponse.text();
  assert.doesNotMatch(afterHtml, /data-section-id="faq"/);
  assert.doesNotMatch(afterHtml, /Domande frequenti/);
});

test("private routes reject requests without a valid bearer token", async () => {
  const response = await fetchWorker("/api/private/sites/ph");
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload.error, "unauthorized");
});

test("private upsert stores draft content by default and writes a change log entry", async () => {
  const db = createSeededDb();
  const response = await fetchWorker("/api/private/sites/ph/content/home/notice", {
    db,
    method: "PUT",
    privateAuth: true,
    body: {
      data: {
        title: "Draft notice",
      },
    },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.status, "draft");
  assert.equal(payload.data.title, "Draft notice");

  const publicResponse = await fetchWorker("/api/public/sites/ph/content", { db });
  const publicPayload = await publicResponse.json();
  assert.equal(publicPayload.content.home.notice, undefined);

  const changesResponse = await fetchWorker("/api/private/sites/ph/changes", {
    db,
    privateAuth: true,
  });
  const changesPayload = await changesResponse.json();
  assert.equal(changesPayload.changes[0].actor, "tdd-suite");
  assert.equal(changesPayload.changes[0].action, "upsert_content");
  assert.equal(changesPayload.changes[0].target, "home/notice");
});

test("private upsert can publish content immediately", async () => {
  const db = createSeededDb();
  const response = await fetchWorker("/api/private/sites/ph/content/home/banner", {
    db,
    method: "PUT",
    privateAuth: true,
    body: {
      data: {
        title: "Published banner",
      },
      publish: true,
    },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.status, "published");

  const publicResponse = await fetchWorker("/api/public/sites/ph/content", { db });
  const publicPayload = await publicResponse.json();
  assert.equal(publicPayload.content.home.banner.title, "Published banner");
});

async function fetchWorker(pathname, options = {}) {
  const headers = new Headers(options.headers);
  const host = options.host ?? "api.lorenzozanna.com";
  headers.set("host", host);

  if (options.privateAuth) {
    headers.set("authorization", `Bearer ${API_TOKEN}`);
    headers.set("x-ai-actor", "tdd-suite");
  }

  const init = {
    method: options.method || "GET",
    headers,
  };

  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(options.body);
  }

  return worker.fetch(new Request(`https://${host}${pathname}`, init), {
    DB: options.db ?? createSeededDb(),
    AI_API_TOKEN: API_TOKEN,
    ROOT_DOMAIN: "lorenzozanna.com",
  });
}

function createSeededDb() {
  return new FakeD1Database({
    sites: [
      {
        id: "site_ph",
        slug: "ph",
        name: "Lorenzo Zanna Photography",
        primary_host: "ph.lorenzozanna.com",
        status: "published",
        created_at: "2026-07-13 00:00:00",
        updated_at: "2026-07-13 00:00:00",
      },
    ],
    contentEntries: [
      contentEntry("entry_home_hero", "home", "hero", { title: "Visible hero" }, "published"),
      contentEntry("entry_portfolio_faq", "portfolio", "faq", { title: "Published FAQ" }, "published"),
      contentEntry("entry_pages_piano_seo", "pages", "piano-seo", { title: "Piano SEO" }, "draft"),
    ],
    pages: [
      {
        id: "page_portfolio",
        site_id: "site_ph",
        slug: "portfolio",
        title: "Portfolio fotografico",
        status: "published",
      },
    ],
    pageSections: [
      pageSection("section_portfolio_hero", "hero", "hero", 10, true, {
        title: "Portfolio fotografico",
        intro: "Ritratti, strada, natura, forme e ombre.",
      }),
      pageSection("section_portfolio_faq", "faq", "faq", 90, true, {
        title: "Domande frequenti",
        items: [
          {
            question: "Come e organizzato il portfolio?",
            answer: "Per serie.",
          },
        ],
      }),
    ],
  });
}

function contentEntry(id, collection, itemKey, data, status) {
  return {
    id,
    site_id: "site_ph",
    collection,
    item_key: itemKey,
    data: JSON.stringify(data),
    status,
    created_at: "2026-07-13 00:00:00",
    updated_at: "2026-07-13 00:00:00",
    published_at: status === "published" ? "2026-07-13 00:00:00" : null,
  };
}

function pageSection(id, key, type, order, enabled, data) {
  return {
    id,
    page_id: "page_portfolio",
    section_key: key,
    type,
    section_order: order,
    enabled: enabled ? 1 : 0,
    data: JSON.stringify(data),
  };
}

class FakeD1Database {
  constructor(seed) {
    this.sites = [...seed.sites];
    this.contentEntries = [...seed.contentEntries];
    this.pages = [...seed.pages];
    this.pageSections = [...seed.pageSections];
    this.sectionRevisions = [];
    this.changeLog = [];
  }

  prepare(query) {
    return new FakeD1Statement(this, query);
  }

  _first(query, params) {
    const results = this._all(query, params).results;
    return results[0] ?? null;
  }

  _all(query, params) {
    if (query.includes("FROM sites WHERE slug = ?")) {
      return { results: this.sites.filter((site) => site.slug === params[0]) };
    }

    if (query.includes("FROM pages") && query.includes("site_id = ?") && query.includes("slug = ?")) {
      return {
        results: this.pages.filter(
          (page) => page.site_id === params[0] && page.slug === params[1] && page.status === "published",
        ),
      };
    }

    if (query.includes("FROM page_sections") && query.includes("page_id = ?") && query.includes("section_key = ?")) {
      return {
        results: this.pageSections.filter(
          (section) => section.page_id === params[0] && section.section_key === params[1],
        ),
      };
    }

    if (query.includes("FROM page_sections") && query.includes("page_id = ?")) {
      return {
        results: this.pageSections
          .filter((section) => section.page_id === params[0] && section.enabled === 1)
          .sort((left, right) => left.section_order - right.section_order),
      };
    }

    if (query.includes("FROM sites ORDER BY slug ASC")) {
      return { results: [...this.sites].sort((left, right) => left.slug.localeCompare(right.slug)) };
    }

    if (query.includes("FROM content_entries") && query.includes("collection = ? AND item_key = ?")) {
      const [siteId, collection, key] = params;
      return {
        results: this.contentEntries.filter(
          (entry) => entry.site_id === siteId && entry.collection === collection && entry.item_key === key,
        ),
      };
    }

    if (query.includes("FROM content_entries") && query.includes("status = 'published'")) {
      return {
        results: this.contentEntries
          .filter((entry) => entry.site_id === params[0] && entry.status === "published")
          .sort(compareContentEntries),
      };
    }

    if (query.includes("FROM content_entries") && query.includes("WHERE site_id = ?")) {
      return {
        results: this.contentEntries
          .filter((entry) => entry.site_id === params[0])
          .sort(compareContentEntries),
      };
    }

    if (query.includes("FROM change_log")) {
      return {
        results: this.changeLog
          .filter((entry) => entry.site_id === params[0])
          .toReversed()
          .slice(0, 50),
      };
    }

    throw new Error(`Unhandled fake D1 all/first query: ${query}`);
  }

  _run(query, params) {
    if (query.includes("INSERT INTO content_entries")) {
      const [id, siteId, collection, key, data, status] = params;
      const existing = this.contentEntries.find(
        (entry) => entry.site_id === siteId && entry.collection === collection && entry.item_key === key,
      );

      if (existing) {
        existing.data = data;
        existing.status = status;
        existing.updated_at = "2026-07-13 00:00:01";
        if (status === "published") existing.published_at = "2026-07-13 00:00:01";
      } else {
        this.contentEntries.push({
          id,
          site_id: siteId,
          collection,
          item_key: key,
          data,
          status,
          created_at: "2026-07-13 00:00:01",
          updated_at: "2026-07-13 00:00:01",
          published_at: status === "published" ? "2026-07-13 00:00:01" : null,
        });
      }

      return { success: true };
    }

    if (query.includes("INSERT INTO change_log")) {
      const [id, siteId, actor, action, target, beforeJson, afterJson] = params;
      this.changeLog.push({
        id,
        site_id: siteId,
        actor,
        action,
        target,
        before_json: beforeJson,
        after_json: afterJson,
        created_at: "2026-07-13 00:00:01",
      });
      return { success: true };
    }

    if (query.includes("UPDATE page_sections")) {
      const [sectionId] = params;
      const section = this.pageSections.find((item) => item.id === sectionId);
      section.enabled = 0;
      section.updated_at = "2026-07-13 00:00:01";
      return { success: true };
    }

    if (query.includes("INSERT INTO section_revisions")) {
      const [id, sectionId, actor, action, beforeJson, afterJson] = params;
      this.sectionRevisions.push({
        id,
        section_id: sectionId,
        actor,
        action,
        before_json: beforeJson,
        after_json: afterJson,
        created_at: "2026-07-13 00:00:01",
      });
      return { success: true };
    }

    throw new Error(`Unhandled fake D1 run query: ${query}`);
  }
}

class FakeD1Statement {
  constructor(db, query) {
    this.db = db;
    this.query = query;
    this.params = [];
  }

  bind(...params) {
    this.params = params;
    return this;
  }

  all() {
    return Promise.resolve(this.db._all(this.query, this.params));
  }

  first() {
    return Promise.resolve(this.db._first(this.query, this.params));
  }

  run() {
    return Promise.resolve(this.db._run(this.query, this.params));
  }
}

function compareContentEntries(left, right) {
  const collection = left.collection.localeCompare(right.collection);
  if (collection !== 0) return collection;
  return left.item_key.localeCompare(right.item_key);
}
