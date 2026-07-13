import assert from "node:assert/strict";
import test from "node:test";

import { disableSection } from "../src/sections.mjs";

test("disableSection hides a section, keeps its data, and records a revision plus change log", async () => {
  const db = createSectionDb();

  const result = await disableSection(
    { DB: db },
    {
      site: "ph",
      page: "portfolio",
      sectionId: "faq",
      actor: "tdd-suite",
    },
  );

  assert.equal(result.site, "ph");
  assert.equal(result.page, "portfolio");
  assert.equal(result.sectionId, "faq");
  assert.equal(result.enabled, false);
  assert.match(result.revisionId, /.+/);

  const section = db.pageSections.find((item) => item.section_key === "faq");
  assert.equal(section.enabled, 0);
  assert.deepEqual(JSON.parse(section.data), {
    title: "FAQ",
    items: [
      {
        question: "How?",
        answer: "Carefully.",
      },
    ],
  });

  assert.equal(db.sectionRevisions.length, 1);
  assert.equal(db.sectionRevisions[0].actor, "tdd-suite");
  assert.equal(db.sectionRevisions[0].action, "disable_section");
  assert.equal(JSON.parse(db.sectionRevisions[0].before_json).enabled, true);
  assert.equal(JSON.parse(db.sectionRevisions[0].after_json).enabled, false);

  assert.equal(db.changeLog.length, 1);
  assert.equal(db.changeLog[0].actor, "tdd-suite");
  assert.equal(db.changeLog[0].action, "disable_section");
  assert.equal(db.changeLog[0].target, "pages/portfolio/sections/faq");
});

test("disableSection rejects missing pages", async () => {
  const db = createSectionDb();

  await assert.rejects(
    () =>
      disableSection(
        { DB: db },
        {
          site: "ph",
          page: "missing",
          sectionId: "faq",
          actor: "tdd-suite",
        },
      ),
    /Page not found/,
  );
});

test("disableSection rejects missing sections", async () => {
  const db = createSectionDb();

  await assert.rejects(
    () =>
      disableSection(
        { DB: db },
        {
          site: "ph",
          page: "portfolio",
          sectionId: "missing",
          actor: "tdd-suite",
        },
      ),
    /Section not found/,
  );
});

function createSectionDb() {
  return new FakeSectionD1Database({
    sites: [
      {
        id: "site_ph",
        slug: "ph",
      },
    ],
    pages: [
      {
        id: "page_portfolio",
        site_id: "site_ph",
        slug: "portfolio",
        title: "Portfolio",
        status: "published",
      },
    ],
    pageSections: [
      {
        id: "section_portfolio_faq",
        page_id: "page_portfolio",
        section_key: "faq",
        type: "faq",
        section_order: 90,
        enabled: 1,
        data: JSON.stringify({
          title: "FAQ",
          items: [
            {
              question: "How?",
              answer: "Carefully.",
            },
          ],
        }),
      },
    ],
  });
}

class FakeSectionD1Database {
  constructor(seed) {
    this.sites = [...seed.sites];
    this.pages = [...seed.pages];
    this.pageSections = [...seed.pageSections];
    this.sectionRevisions = [];
    this.changeLog = [];
  }

  prepare(query) {
    return new FakeSectionD1Statement(this, query);
  }

  _first(query, params) {
    const results = this._all(query, params).results;
    return results[0] ?? null;
  }

  _all(query, params) {
    if (query.includes("FROM sites WHERE slug = ?")) {
      return { results: this.sites.filter((site) => site.slug === params[0]) };
    }

    if (query.includes("FROM pages WHERE site_id = ? AND slug = ?")) {
      return {
        results: this.pages.filter((page) => page.site_id === params[0] && page.slug === params[1]),
      };
    }

    if (query.includes("FROM page_sections") && query.includes("page_id = ?") && query.includes("section_key = ?")) {
      return {
        results: this.pageSections.filter(
          (section) => section.page_id === params[0] && section.section_key === params[1],
        ),
      };
    }

    throw new Error(`Unhandled fake D1 all/first query: ${query}`);
  }

  _run(query, params) {
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

    throw new Error(`Unhandled fake D1 run query: ${query}`);
  }
}

class FakeSectionD1Statement {
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
