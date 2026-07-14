import assert from "node:assert/strict";
import test from "node:test";

import { rollbackChange } from "../src/rollback.mjs";

test("rollbackChange restores a section snapshot from a specific change", async () => {
  const db = createRollbackDb();

  const result = await rollbackChange(
    { DB: db },
    {
      site: "ph",
      changeId: "change_question",
      actor: "tdd-suite",
    },
  );

  assert.equal(result.site, "ph");
  assert.equal(result.page, "portfolio");
  assert.equal(result.sectionId, "faq");
  assert.equal(result.path, "items[0].question");
  assert.equal(result.rolledBackChangeId, "change_question");
  assert.match(result.revisionId, /.+/);

  const section = db.pageSections.find((item) => item.section_key === "faq");
  assert.equal(JSON.parse(section.data).items[0].question, "How?");

  assert.equal(db.sectionRevisions.length, 2);
  assert.equal(db.sectionRevisions.at(-1).actor, "tdd-suite");
  assert.equal(db.sectionRevisions.at(-1).action, "rollback_change");
  assert.equal(JSON.parse(db.sectionRevisions.at(-1).before_json).data.items[0].question, "Come?");
  assert.equal(JSON.parse(db.sectionRevisions.at(-1).after_json).data.items[0].question, "How?");

  assert.equal(db.changeLog.at(-1).action, "rollback_change");
  assert.equal(db.changeLog.at(-1).target, "pages/portfolio/sections/faq/items[0].question");
});

test("rollbackChange restores the latest change for a page section when no change id is provided", async () => {
  const db = createRollbackDb();

  const result = await rollbackChange(
    { DB: db },
    {
      site: "ph",
      page: "portfolio",
      sectionId: "faq",
      actor: "tdd-suite",
    },
  );

  assert.equal(result.rolledBackChangeId, "change_question");
  assert.equal(result.path, "items[0].question");
});

test("rollbackChange restores section visibility from a disable change", async () => {
  const db = createRollbackDb({
    currentEnabled: false,
  });

  const result = await rollbackChange(
    { DB: db },
    {
      site: "ph",
      changeId: "change_visibility",
      actor: "tdd-suite",
    },
  );

  assert.equal(result.rolledBackChangeId, "change_visibility");
  assert.equal(result.path, null);

  const section = db.pageSections.find((item) => item.section_key === "faq");
  assert.equal(section.enabled, 1);
});

test("rollbackChange restores a section snapshot from a specific revision", async () => {
  const db = createRollbackDb();

  const result = await rollbackChange(
    { DB: db },
    {
      site: "ph",
      revisionId: "revision_question",
      actor: "tdd-suite",
    },
  );

  assert.equal(result.rolledBackRevisionId, "revision_question");
  assert.equal(result.rolledBackChangeId, null);
  assert.equal(result.path, null);

  const section = db.pageSections.find((item) => item.section_key === "faq");
  assert.equal(JSON.parse(section.data).items[0].question, "How?");
});

test("rollbackChange rejects stale rollback when current section differs from the change after snapshot", async () => {
  const db = createRollbackDb({
    currentQuestion: "Later change",
  });

  await assert.rejects(
    () =>
      rollbackChange(
        { DB: db },
        {
          site: "ph",
          changeId: "change_question",
          actor: "tdd-suite",
        },
      ),
    /current section state differs from the change after snapshot/,
  );
});

function createRollbackDb(options = {}) {
  const before = sectionSnapshot({
    question: "How?",
  });
  const after = sectionSnapshot({
    question: "Come?",
  });
  const disabled = sectionSnapshot({
    enabled: false,
    question: options.currentQuestion ?? "Come?",
  });

  return new FakeRollbackD1Database({
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
      },
    ],
    pageSections: [
      {
        id: "section_portfolio_faq",
        page_id: "page_portfolio",
        section_key: "faq",
        type: "faq",
        section_order: 90,
        enabled: options.currentEnabled === false ? 0 : 1,
        data: JSON.stringify({
          title: "FAQ",
          items: [
            {
              question: options.currentQuestion ?? "Come?",
              answer: "Carefully.",
            },
          ],
        }),
      },
    ],
    changeLog: [
      {
        id: "change_visibility",
        site_id: "site_ph",
        actor: "lorenzo",
        action: "disable_section",
        target: "pages/portfolio/sections/faq",
        before_json: JSON.stringify(after),
        after_json: JSON.stringify(disabled),
        created_at: "2026-07-14 09:30:00",
      },
      {
        id: "change_title",
        site_id: "site_ph",
        actor: "lorenzo",
        action: "update_text",
        target: "pages/portfolio/sections/hero/title",
        before_json: JSON.stringify({}),
        after_json: JSON.stringify({}),
        created_at: "2026-07-14 10:00:00",
      },
      {
        id: "change_question",
        site_id: "site_ph",
        actor: "lorenzo",
        action: "update_text",
        target: "pages/portfolio/sections/faq/items[0].question",
        before_json: JSON.stringify(before),
        after_json: JSON.stringify(after),
        created_at: "2026-07-14 11:00:00",
      },
    ],
    sectionRevisions: [
      {
        id: "revision_question",
        section_id: "section_portfolio_faq",
        actor: "lorenzo",
        action: "update_text",
        before_json: JSON.stringify(before),
        after_json: JSON.stringify(after),
        created_at: "2026-07-14 11:00:00",
      },
    ],
  });
}

function sectionSnapshot(options = {}) {
  return {
    id: "section_portfolio_faq",
    sectionId: "faq",
    type: "faq",
    order: 90,
    enabled: options.enabled !== false,
    data: {
      title: "FAQ",
      items: [
        {
          question: options.question,
          answer: "Carefully.",
        },
      ],
    },
  };
}

class FakeRollbackD1Database {
  constructor(seed) {
    this.sites = [...seed.sites];
    this.pages = [...seed.pages];
    this.pageSections = [...seed.pageSections];
    this.changeLog = [...seed.changeLog];
    this.sectionRevisions = [...(seed.sectionRevisions ?? [])];
  }

  prepare(query) {
    return new FakeRollbackD1Statement(this, query);
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

    if (query.includes("FROM change_log") && query.includes("AND id = ?")) {
      return {
        results: this.changeLog.filter((entry) => entry.site_id === params[0] && entry.id === params[1]),
      };
    }

    if (query.includes("FROM change_log")) {
      const [siteId, target, targetChildren, limit] = params;
      return {
        results: this.changeLog
          .filter((entry) => entry.site_id === siteId)
          .filter((entry) => entry.target === target || entry.target.startsWith(targetChildren.slice(0, -1)))
          .sort((left, right) => right.created_at.localeCompare(left.created_at))
          .slice(0, limit),
      };
    }

    if (query.includes("FROM section_revisions")) {
      return {
        results: this.sectionRevisions
          .filter((revision) => revision.id === params[1])
          .map((revision) => {
            const section = this.pageSections.find((item) => item.id === revision.section_id);
            const page = this.pages.find((item) => item.id === section?.page_id && item.site_id === params[0]);
            if (!section || !page) return null;
            return {
              revision_id: revision.id,
              revision_action: revision.action,
              revision_before_json: revision.before_json,
              revision_after_json: revision.after_json,
              revision_created_at: revision.created_at,
              page_id: page.id,
              page_slug: page.slug,
              page_title: page.title,
              section_current_id: section.id,
              section_key: section.section_key,
              type: section.type,
              section_order: section.section_order,
              enabled: section.enabled,
              data: section.data,
            };
          })
          .filter(Boolean),
      };
    }

    throw new Error(`Unhandled fake D1 all/first query: ${query}`);
  }

  _run(query, params) {
    if (query.includes("UPDATE page_sections") && query.includes("section_order = ?")) {
      const [enabled, order, data, sectionId] = params;
      const section = this.pageSections.find((item) => item.id === sectionId);
      section.enabled = enabled;
      section.section_order = order;
      section.data = data;
      section.updated_at = "2026-07-14 12:00:00";
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
        created_at: "2026-07-14 12:00:00",
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
        created_at: "2026-07-14 12:00:00",
      });
      return { success: true };
    }

    throw new Error(`Unhandled fake D1 run query: ${query}`);
  }
}

class FakeRollbackD1Statement {
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

  run() {
    return Promise.resolve(this.db._run(this.query, this.params));
  }
}
