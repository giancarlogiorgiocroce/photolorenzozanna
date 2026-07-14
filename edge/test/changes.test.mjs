import assert from "node:assert/strict";
import test from "node:test";

import { listChanges } from "../src/changes.mjs";

test("listChanges returns newest changes filtered by page and section", async () => {
  const db = createChangesDb();

  const result = await listChanges(
    { DB: db },
    {
      site: "ph",
      page: "portfolio",
      sectionId: "faq",
      limit: 10,
    },
  );

  assert.equal(result.site, "ph");
  assert.deepEqual(result.filters, {
    page: "portfolio",
    sectionId: "faq",
    limit: 10,
  });
  assert.deepEqual(
    result.changes.map((change) => change.id),
    ["change_faq_question", "change_faq_visibility"],
  );

  assert.equal(result.changes[0].actor, "lorenzo");
  assert.equal(result.changes[0].action, "update_text");
  assert.equal(result.changes[0].target, "pages/portfolio/sections/faq/items[0].question");
  assert.equal(result.changes[0].page, "portfolio");
  assert.equal(result.changes[0].sectionId, "faq");
  assert.equal(result.changes[0].path, "items[0].question");
  assert.equal(result.changes[0].before.data.items[0].question, "How?");
  assert.equal(result.changes[0].after.data.items[0].question, "Come?");

  assert.equal(result.changes[1].action, "disable_section");
  assert.equal(result.changes[1].path, null);
});

test("listChanges requires a page when filtering by section", async () => {
  const db = createChangesDb();

  await assert.rejects(
    () =>
      listChanges(
        { DB: db },
        {
          site: "ph",
          sectionId: "faq",
        },
      ),
    /page is required when filtering by sectionId/,
  );
});

function createChangesDb() {
  return new FakeChangesD1Database({
    sites: [
      {
        id: "site_ph",
        slug: "ph",
      },
    ],
    changeLog: [
      changeLogEntry({
        id: "change_home",
        action: "update_text",
        target: "pages/home/sections/hero/title",
        createdAt: "2026-07-14 09:00:00",
      }),
      changeLogEntry({
        id: "change_faq_visibility",
        action: "disable_section",
        target: "pages/portfolio/sections/faq",
        createdAt: "2026-07-14 10:00:00",
      }),
      changeLogEntry({
        id: "change_hero",
        action: "update_text",
        target: "pages/portfolio/sections/hero/title",
        createdAt: "2026-07-14 11:00:00",
      }),
      changeLogEntry({
        id: "change_faq_question",
        action: "update_text",
        target: "pages/portfolio/sections/faq/items[0].question",
        before: {
          data: {
            items: [{ question: "How?" }],
          },
        },
        after: {
          data: {
            items: [{ question: "Come?" }],
          },
        },
        createdAt: "2026-07-14 12:00:00",
      }),
    ],
  });
}

function changeLogEntry(options) {
  return {
    id: options.id,
    site_id: "site_ph",
    actor: options.actor ?? "lorenzo",
    action: options.action,
    target: options.target,
    before_json: JSON.stringify(options.before ?? { enabled: true }),
    after_json: JSON.stringify(options.after ?? { enabled: false }),
    created_at: options.createdAt,
  };
}

class FakeChangesD1Database {
  constructor(seed) {
    this.sites = [...seed.sites];
    this.changeLog = [...seed.changeLog];
  }

  prepare(query) {
    return new FakeChangesD1Statement(this, query);
  }

  _first(query, params) {
    const results = this._all(query, params).results;
    return results[0] ?? null;
  }

  _all(query, params) {
    if (query.includes("FROM sites WHERE slug = ?")) {
      return { results: this.sites.filter((site) => site.slug === params[0]) };
    }

    if (query.includes("FROM change_log")) {
      const [siteId, target, targetChildren, limit] = params;
      return {
        results: this.changeLog
          .filter((entry) => entry.site_id === siteId)
          .filter((entry) => !target || entry.target === target || entry.target.startsWith(targetChildren.slice(0, -1)))
          .sort((left, right) => right.created_at.localeCompare(left.created_at))
          .slice(0, limit),
      };
    }

    throw new Error(`Unhandled fake D1 query: ${query}`);
  }
}

class FakeChangesD1Statement {
  constructor(db, query) {
    this.db = db;
    this.query = query;
    this.params = [];
  }

  bind(...params) {
    this.params = params;
    return this;
  }

  first() {
    return Promise.resolve(this.db._first(this.query, this.params));
  }

  all() {
    return Promise.resolve(this.db._all(this.query, this.params));
  }
}
