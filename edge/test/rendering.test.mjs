import assert from "node:assert/strict";
import test from "node:test";

import { renderPageHtml } from "../src/rendering.mjs";

test("renderPageHtml renders enabled FAQ sections", async () => {
  const db = createRendererDb();
  const html = await renderPageHtml(
    { DB: db },
    {
      site: "ph",
      page: "portfolio",
    },
  );

  assert.match(html, /<h1>Portfolio fotografico<\/h1>/);
  assert.match(html, /<section[^>]*data-section-id="faq"/);
  assert.match(html, /Domande frequenti/);
  assert.match(html, /Come e organizzato il portfolio\?/);
});

test("renderPageHtml skips disabled sections without deleting their data", async () => {
  const db = createRendererDb({
    faqEnabled: false,
  });
  const html = await renderPageHtml(
    { DB: db },
    {
      site: "ph",
      page: "portfolio",
    },
  );

  assert.doesNotMatch(html, /data-section-id="faq"/);
  assert.doesNotMatch(html, /Domande frequenti/);

  const faq = db.pageSections.find((section) => section.section_key === "faq");
  assert.equal(JSON.parse(faq.data).title, "Domande frequenti");
});

test("renderPageHtml respects section order", async () => {
  const db = createRendererDb();
  const html = await renderPageHtml(
    { DB: db },
    {
      site: "ph",
      page: "portfolio",
    },
  );

  assert.ok(html.indexOf("Portfolio fotografico") < html.indexOf("Serie"));
  assert.ok(html.indexOf("Serie") < html.indexOf("Domande frequenti"));
});

test("renderPageHtml rejects missing pages", async () => {
  const db = createRendererDb();

  await assert.rejects(
    () =>
      renderPageHtml(
        { DB: db },
        {
          site: "ph",
          page: "missing",
        },
      ),
    /Page not found/,
  );
});

function createRendererDb(options = {}) {
  const faqEnabled = options.faqEnabled !== false;

  return new FakeRendererD1Database({
    sites: [
      {
        id: "site_ph",
        slug: "ph",
        name: "Lorenzo Zanna Photography",
        status: "published",
      },
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
      section("section_portfolio_hero", "hero", "hero", 10, true, {
        title: "Portfolio fotografico",
        intro: "Ritratti, strada, natura, forme e ombre.",
      }),
      section("section_portfolio_series", "series", "text", 20, true, {
        title: "Serie",
        paragraphs: ["Ritratti, natura, strada e forme."],
      }),
      section("section_portfolio_faq", "faq", "faq", 90, faqEnabled, {
        title: "Domande frequenti",
        items: [
          {
            question: "Come e organizzato il portfolio?",
            answer: "Per serie: ritratti, strada, natura, forme e ombre.",
          },
        ],
      }),
    ],
  });
}

function section(id, key, type, order, enabled, data) {
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

class FakeRendererD1Database {
  constructor(seed) {
    this.sites = [...seed.sites];
    this.pages = [...seed.pages];
    this.pageSections = [...seed.pageSections];
  }

  prepare(query) {
    return new FakeRendererD1Statement(this, query);
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

    if (query.includes("FROM page_sections") && query.includes("page_id = ?")) {
      return {
        results: this.pageSections
          .filter((section) => section.page_id === params[0] && section.enabled === 1)
          .sort((left, right) => left.section_order - right.section_order),
      };
    }

    throw new Error(`Unhandled fake D1 all/first query: ${query}`);
  }
}

class FakeRendererD1Statement {
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
}
