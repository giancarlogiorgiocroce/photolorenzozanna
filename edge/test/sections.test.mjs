import assert from "node:assert/strict";
import test from "node:test";

import { disableSection, enableSection, updateCta, updateRichText, updateText } from "../src/sections.mjs";

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

test("enableSection shows a disabled section and records a revision plus change log", async () => {
  const db = createSectionDb({
    enabled: false,
  });

  const result = await enableSection(
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
  assert.equal(result.enabled, true);
  assert.match(result.revisionId, /.+/);

  const section = db.pageSections.find((item) => item.section_key === "faq");
  assert.equal(section.enabled, 1);
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
  assert.equal(db.sectionRevisions[0].action, "enable_section");
  assert.equal(JSON.parse(db.sectionRevisions[0].before_json).enabled, false);
  assert.equal(JSON.parse(db.sectionRevisions[0].after_json).enabled, true);

  assert.equal(db.changeLog.length, 1);
  assert.equal(db.changeLog[0].actor, "tdd-suite");
  assert.equal(db.changeLog[0].action, "enable_section");
  assert.equal(db.changeLog[0].target, "pages/portfolio/sections/faq");
});

test("enableSection rejects sections that are already enabled", async () => {
  const db = createSectionDb();

  await assert.rejects(
    () =>
      enableSection(
        { DB: db },
        {
          site: "ph",
          page: "portfolio",
          sectionId: "faq",
          actor: "tdd-suite",
        },
      ),
    /Section already enabled/,
  );
});

test("updateText changes a contracted plain text field and records a revision plus change log", async () => {
  const db = createSectionDb();

  const result = await updateText(
    { DB: db },
    {
      site: "ph",
      page: "portfolio",
      sectionId: "faq",
      path: "items[0].question",
      value: "Come funziona?",
      actor: "tdd-suite",
    },
  );

  assert.equal(result.site, "ph");
  assert.equal(result.page, "portfolio");
  assert.equal(result.sectionId, "faq");
  assert.equal(result.path, "items[0].question");
  assert.equal(result.value, "Come funziona?");
  assert.match(result.revisionId, /.+/);

  const section = db.pageSections.find((item) => item.section_key === "faq");
  assert.deepEqual(JSON.parse(section.data), {
    title: "FAQ",
    items: [
      {
        question: "Come funziona?",
        answer: "Carefully.",
      },
    ],
  });

  assert.equal(db.sectionRevisions.length, 1);
  assert.equal(db.sectionRevisions[0].actor, "tdd-suite");
  assert.equal(db.sectionRevisions[0].action, "update_text");
  assert.equal(JSON.parse(db.sectionRevisions[0].before_json).data.items[0].question, "How?");
  assert.equal(JSON.parse(db.sectionRevisions[0].after_json).data.items[0].question, "Come funziona?");

  assert.equal(db.changeLog.length, 1);
  assert.equal(db.changeLog[0].actor, "tdd-suite");
  assert.equal(db.changeLog[0].action, "update_text");
  assert.equal(db.changeLog[0].target, "pages/portfolio/sections/faq/items[0].question");
});

test("updateText rejects arbitrary HTML", async () => {
  const db = createSectionDb();

  await assert.rejects(
    () =>
      updateText(
        { DB: db },
        {
          site: "ph",
          page: "portfolio",
          sectionId: "faq",
          path: "title",
          value: "<strong>FAQ</strong>",
          actor: "tdd-suite",
        },
      ),
    /HTML is not allowed/,
  );
});

test("updateText rejects values longer than the field contract", async () => {
  const db = createSectionDb();

  await assert.rejects(
    () =>
      updateText(
        { DB: db },
        {
          site: "ph",
          page: "portfolio",
          sectionId: "faq",
          path: "title",
          value: "x".repeat(91),
          actor: "tdd-suite",
        },
      ),
    /exceeds max length/,
  );
});

test("updateText rejects fields outside the section contract", async () => {
  const db = createSectionDb();

  await assert.rejects(
    () =>
      updateText(
        { DB: db },
        {
          site: "ph",
          page: "portfolio",
          sectionId: "faq",
          path: "items[0].href",
          value: "/portfolio.html",
          actor: "tdd-suite",
        },
      ),
    /Field is not editable/,
  );
});

test("updateCta changes a contracted link field and records a revision plus change log", async () => {
  const db = createSectionDb();

  const result = await updateCta(
    { DB: db },
    {
      site: "ph",
      page: "portfolio",
      sectionId: "cta",
      path: "primaryCta",
      label: "Scrivi",
      href: "/contact.html",
      actor: "tdd-suite",
    },
  );

  assert.equal(result.site, "ph");
  assert.equal(result.page, "portfolio");
  assert.equal(result.sectionId, "cta");
  assert.equal(result.path, "primaryCta");
  assert.deepEqual(result.value, {
    label: "Scrivi",
    href: "/contact.html",
  });

  const section = db.pageSections.find((item) => item.section_key === "cta");
  assert.deepEqual(JSON.parse(section.data).primaryCta, {
    label: "Scrivi",
    href: "/contact.html",
  });
  assert.equal(db.sectionRevisions[0].action, "update_cta");
  assert.equal(db.changeLog[0].action, "update_cta");
  assert.equal(db.changeLog[0].target, "pages/portfolio/sections/cta/primaryCta");
});

test("updateCta rejects unsafe hrefs and HTML labels", async () => {
  const db = createSectionDb();

  await assert.rejects(
    () =>
      updateCta(
        { DB: db },
        {
          site: "ph",
          page: "portfolio",
          sectionId: "cta",
          path: "primaryCta",
          label: "Scrivi",
          href: "javascript:alert(1)",
          actor: "tdd-suite",
        },
      ),
    /Invalid href/,
  );

  await assert.rejects(
    () =>
      updateCta(
        { DB: db },
        {
          site: "ph",
          page: "portfolio",
          sectionId: "cta",
          path: "primaryCta",
          label: "<strong>Scrivi</strong>",
          href: "/contact.html",
          actor: "tdd-suite",
        },
      ),
    /HTML is not allowed/,
  );
});

test("updateRichText changes a contracted rich text field and records a revision plus change log", async () => {
  const db = createSectionDb();
  const richText = richTextValue([
    [
      { text: "Risposta ", marks: [] },
      { text: "importante", marks: ["bold"] },
      { text: " e ", marks: [] },
      { text: "leggibile", marks: ["italic"] },
      { text: " con link", marks: [], link: { href: "/portfolio.html" } },
    ],
  ]);

  const result = await updateRichText(
    { DB: db },
    {
      site: "ph",
      page: "portfolio",
      sectionId: "faq",
      path: "items[0].answer",
      value: richText,
      actor: "tdd-suite",
    },
  );

  assert.equal(result.site, "ph");
  assert.equal(result.path, "items[0].answer");
  assert.equal(result.value.format, "rich_text_v1");

  const section = db.pageSections.find((item) => item.section_key === "faq");
  assert.deepEqual(JSON.parse(section.data).items[0].answer, richText);
  assert.equal(db.sectionRevisions[0].action, "update_rich_text");
  assert.equal(db.changeLog[0].action, "update_rich_text");
  assert.equal(db.changeLog[0].target, "pages/portfolio/sections/faq/items[0].answer");
});

test("updateRichText can remove a link by replacing the rich text value", async () => {
  const db = createSectionDb();
  const linked = richTextValue([[{ text: "Vai al portfolio", marks: [], link: { href: "/portfolio.html" } }]]);
  const unlinked = richTextValue([[{ text: "Vai al portfolio", marks: [] }]]);

  await updateRichText(
    { DB: db },
    {
      site: "ph",
      page: "portfolio",
      sectionId: "faq",
      path: "items[0].answer",
      value: linked,
      actor: "tdd-suite",
    },
  );

  await updateRichText(
    { DB: db },
    {
      site: "ph",
      page: "portfolio",
      sectionId: "faq",
      path: "items[0].answer",
      value: unlinked,
      actor: "tdd-suite",
    },
  );

  const section = db.pageSections.find((item) => item.section_key === "faq");
  assert.deepEqual(JSON.parse(section.data).items[0].answer, unlinked);
  assert.equal(db.sectionRevisions.length, 2);
  assert.equal(db.changeLog.length, 2);
});

test("updateRichText rejects unsupported marks and unsafe links", async () => {
  const db = createSectionDb();

  await assert.rejects(
    () =>
      updateRichText(
        { DB: db },
        {
          site: "ph",
          page: "portfolio",
          sectionId: "faq",
          path: "items[0].answer",
          value: richTextValue([[{ text: "Nope", marks: ["underline"] }]]),
          actor: "tdd-suite",
        },
      ),
    /Unsupported rich text mark/,
  );

  await assert.rejects(
    () =>
      updateRichText(
        { DB: db },
        {
          site: "ph",
          page: "portfolio",
          sectionId: "faq",
          path: "items[0].answer",
          value: richTextValue([[{ text: "Nope", marks: [], link: { href: "data:text/html,boom" } }]]),
          actor: "tdd-suite",
        },
      ),
    /Invalid href/,
  );
});

function createSectionDb(options = {}) {
  const enabled = options.enabled !== false;

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
        enabled: enabled ? 1 : 0,
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
      {
        id: "section_portfolio_cta",
        page_id: "page_portfolio",
        section_key: "cta",
        type: "cta",
        section_order: 100,
        enabled: 1,
        data: JSON.stringify({
          type: "cta",
          text: "Scrivi per informazioni.",
        }),
      },
    ],
  });
}

function richTextValue(blocks) {
  return {
    format: "rich_text_v1",
    blocks: blocks.map((spans) => ({
      type: "paragraph",
      spans,
    })),
  };
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
      if (query.includes("data = ?")) {
        const [data, sectionId] = params;
        const section = this.pageSections.find((item) => item.id === sectionId);
        section.data = data;
        section.updated_at = "2026-07-13 00:00:01";
        return { success: true };
      }

      const [sectionId] = params;
      const section = this.pageSections.find((item) => item.id === sectionId);
      section.enabled = query.includes("enabled = 1") ? 1 : 0;
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
