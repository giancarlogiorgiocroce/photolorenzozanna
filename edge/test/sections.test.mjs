import assert from "node:assert/strict";
import test from "node:test";

import {
  addFaqItem,
  addFaqSection,
  addSectionFromPreset,
  removeFaqItem,
  reorderFaqItems,
  updateFaqItem,
} from "../src/faq-sections.mjs";
import {
  disableSection,
  enableSection,
  updateContactChannel,
  updateCta,
  updateRichText,
  updateText,
} from "../src/sections.mjs";

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

test("addFaqSection creates a safe FAQ preset before the CTA and records history", async () => {
  const db = createSectionDb({ includeFaq: false });

  const result = await addFaqSection(
    { DB: db },
    {
      site: "ph",
      page: "portfolio",
      title: "Domande frequenti",
      items: [
        {
          question: "Posso richiedere una stampa?",
          answer: "Si, indicando fotografia e formato.",
        },
      ],
      actor: "tdd-suite",
    },
  );

  assert.equal(result.site, "ph");
  assert.equal(result.page, "portfolio");
  assert.equal(result.sectionId, "faq");
  assert.equal(result.created, true);
  assert.equal(result.enabled, true);
  assert.equal(result.itemCount, 1);

  const faqSections = db.pageSections.filter((item) => item.section_key === "faq");
  assert.equal(faqSections.length, 1);
  assert.equal(faqSections[0].type, "faq");
  assert.equal(faqSections[0].section_order, 90);
  assert.deepEqual(JSON.parse(faqSections[0].data), {
    type: "faq",
    title: "Domande frequenti",
    items: [
      {
        question: "Posso richiedere una stampa?",
        answer: "Si, indicando fotografia e formato.",
      },
    ],
  });

  assert.equal(db.sectionRevisions.length, 1);
  assert.equal(db.sectionRevisions[0].action, "add_faq_section");
  assert.equal(db.sectionRevisions[0].before_json, null);
  assert.equal(JSON.parse(db.sectionRevisions[0].after_json).sectionId, "faq");

  assert.equal(db.changeLog.length, 1);
  assert.equal(db.changeLog[0].action, "add_faq_section");
  assert.equal(db.changeLog[0].target, "pages/portfolio/sections/faq");
});

test("addFaqSection re-enables an existing disabled FAQ without duplicating it", async () => {
  const db = createSectionDb({ enabled: false });

  const result = await addFaqSection(
    { DB: db },
    {
      site: "ph",
      page: "portfolio",
      title: "Nuovo titolo ignorato",
      actor: "tdd-suite",
    },
  );

  assert.equal(result.created, false);
  assert.equal(result.enabled, true);
  assert.equal(result.itemCount, 1);
  assert.equal(db.pageSections.filter((item) => item.section_key === "faq").length, 1);
  assert.equal(db.pageSections.find((item) => item.section_key === "faq").enabled, 1);
  assert.equal(JSON.parse(db.pageSections.find((item) => item.section_key === "faq").data).title, "FAQ");
  assert.equal(db.changeLog[0].action, "add_faq_section");
});

test("addFaqSection can create an empty FAQ section for later item editing", async () => {
  const db = createSectionDb({ includeFaq: false });

  const result = await addFaqSection(
    { DB: db },
    {
      site: "ph",
      page: "portfolio",
      actor: "tdd-suite",
    },
  );

  const faq = db.pageSections.find((item) => item.section_key === "faq");

  assert.equal(result.itemCount, 0);
  assert.deepEqual(JSON.parse(faq.data).items, []);
});

test("addSectionFromPreset rejects arbitrary and not-yet-addable section presets", async () => {
  await assert.rejects(
    () =>
      addSectionFromPreset(
        { DB: createSectionDb() },
        {
          site: "ph",
          page: "portfolio",
          presetId: "script",
          actor: "tdd-suite",
        },
      ),
    /Unknown section preset/,
  );

  await assert.rejects(
    () =>
      addSectionFromPreset(
        { DB: createSectionDb() },
        {
          site: "ph",
          page: "portfolio",
          presetId: "gallery",
          actor: "tdd-suite",
        },
      ),
    /not addable yet/,
  );
});

test("FAQ item tools add, update, reorder and remove controlled items", async () => {
  const db = createSectionDb();

  const added = await addFaqItem(
    { DB: db },
    {
      site: "ph",
      page: "portfolio",
      sectionId: "faq",
      question: "Quanto dura una sessione?",
      answer: "Dipende dal lavoro, di solito almeno un'ora.",
      actor: "tdd-suite",
    },
  );

  assert.equal(added.itemIndex, 1);
  assert.equal(added.item.question, "Quanto dura una sessione?");

  const updated = await updateFaqItem(
    { DB: db },
    {
      site: "ph",
      page: "portfolio",
      sectionId: "faq",
      index: 1,
      question: "Quanto dura il servizio?",
      actor: "tdd-suite",
    },
  );

  assert.equal(updated.itemIndex, 1);
  assert.equal(updated.item.question, "Quanto dura il servizio?");
  assert.equal(updated.item.answer, "Dipende dal lavoro, di solito almeno un'ora.");

  const reordered = await reorderFaqItems(
    { DB: db },
    {
      site: "ph",
      page: "portfolio",
      sectionId: "faq",
      order: [1, 0],
      actor: "tdd-suite",
    },
  );

  assert.deepEqual(reordered.order, [1, 0]);
  assert.equal(JSON.parse(db.pageSections.find((item) => item.section_key === "faq").data).items[0].question, "Quanto dura il servizio?");

  const removed = await removeFaqItem(
    { DB: db },
    {
      site: "ph",
      page: "portfolio",
      sectionId: "faq",
      index: 0,
      actor: "tdd-suite",
    },
  );

  assert.equal(removed.removed.question, "Quanto dura il servizio?");
  assert.deepEqual(
    JSON.parse(db.pageSections.find((item) => item.section_key === "faq").data).items.map((item) => item.question),
    ["How?"],
  );
  assert.deepEqual(
    db.changeLog.map((entry) => entry.action),
    ["add_faq_item", "update_faq_item", "reorder_faq_items", "remove_faq_item"],
  );
});

test("FAQ item tools reject HTML in questions and answers", async () => {
  const db = createSectionDb();

  await assert.rejects(
    () =>
      addFaqItem(
        { DB: db },
        {
          site: "ph",
          page: "portfolio",
          sectionId: "faq",
          question: "Posso usare <strong>HTML</strong>?",
          answer: "No.",
          actor: "tdd-suite",
        },
      ),
    /HTML is not allowed/,
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

test("updateText changes a contact band channel value through its contract", async () => {
  const db = createSectionDb();

  const result = await updateText(
    { DB: db },
    {
      site: "ph",
      page: "contatti",
      sectionId: "contact-band",
      path: "channels[0].value",
      value: "ciao@example.com",
      actor: "tdd-suite",
    },
  );

  assert.equal(result.page, "contatti");
  assert.equal(result.sectionId, "contact-band");
  assert.equal(result.path, "channels[0].value");
  assert.equal(result.value, "ciao@example.com");

  const section = db.pageSections.find((item) => item.section_key === "contact-band");
  assert.equal(JSON.parse(section.data).channels[0].value, "ciao@example.com");
  assert.equal(db.sectionRevisions[0].action, "update_text");
  assert.equal(db.changeLog[0].target, "pages/contatti/sections/contact-band/channels[0].value");
});

test("updateCta changes a nullable contact band channel href through its contract", async () => {
  const db = createSectionDb();

  const result = await updateCta(
    { DB: db },
    {
      site: "ph",
      page: "contatti",
      sectionId: "contact-band",
      path: "channels[0].href",
      href: "mailto:ciao@example.com",
      actor: "tdd-suite",
    },
  );

  assert.equal(result.page, "contatti");
  assert.equal(result.sectionId, "contact-band");
  assert.equal(result.path, "channels[0].href");
  assert.equal(result.value, "mailto:ciao@example.com");

  const section = db.pageSections.find((item) => item.section_key === "contact-band");
  assert.equal(JSON.parse(section.data).channels[0].href, "mailto:ciao@example.com");
  assert.equal(db.sectionRevisions[0].action, "update_cta");
  assert.equal(db.changeLog[0].target, "pages/contatti/sections/contact-band/channels[0].href");
});

test("updateContactChannel edits contact channels by semantic name and can hide them", async () => {
  const db = createSectionDb();

  const email = await updateContactChannel(
    { DB: db },
    {
      site: "ph",
      page: "contatti",
      channel: "email",
      value: "zannafotografia@icloud.com",
      actor: "tdd-suite",
    },
  );

  assert.equal(email.sectionId, "contact-band");
  assert.equal(email.channelIndex, 0);
  assert.deepEqual(email.channel, {
    label: "Email",
    value: "zannafotografia@icloud.com",
    href: "mailto:zannafotografia@icloud.com",
    enabled: true,
  });

  const instagram = await updateContactChannel(
    { DB: db },
    {
      site: "ph",
      page: "contatti",
      channel: "instagram",
      enabled: false,
      actor: "tdd-suite",
    },
  );

  const data = JSON.parse(db.pageSections.find((item) => item.section_key === "contact-band").data);
  assert.equal(instagram.channelIndex, 1);
  assert.equal(data.channels[0].value, "zannafotografia@icloud.com");
  assert.equal(data.channels[0].href, "mailto:zannafotografia@icloud.com");
  assert.equal(data.channels[1].enabled, false);
  assert.deepEqual(db.sectionRevisions.map((entry) => entry.action), ["update_contact_channel", "update_contact_channel"]);
  assert.deepEqual(
    db.changeLog.map((entry) => entry.target),
    [
      "pages/contatti/sections/contact-band/channels[0]",
      "pages/contatti/sections/contact-band/channels[1]",
    ],
  );
});

test("updateContactChannel rejects unknown channels and unsafe hrefs", async () => {
  const db = createSectionDb();

  await assert.rejects(
    () =>
      updateContactChannel(
        { DB: db },
        {
          site: "ph",
          page: "contatti",
          channel: "fax",
          enabled: false,
          actor: "tdd-suite",
        },
      ),
    /Contact channel not found/,
  );

  await assert.rejects(
    () =>
      updateContactChannel(
        { DB: db },
        {
          site: "ph",
          page: "contatti",
          channel: "email",
          href: "javascript:alert(1)",
          actor: "tdd-suite",
        },
      ),
    /Invalid href/,
  );
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
  const includeFaq = options.includeFaq !== false;

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
      {
        id: "page_contatti",
        site_id: "site_ph",
        slug: "contatti",
        title: "Contatti",
        status: "published",
      },
    ],
    pageSections: [
      ...(includeFaq ? [{
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
      }] : []),
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
      {
        id: "section_contatti_contact_band",
        page_id: "page_contatti",
        section_key: "contact-band",
        type: "text",
        section_order: 15,
        enabled: 1,
        data: JSON.stringify({
          type: "contact-band",
          channels: [
            { label: "Email", value: "Da definire", href: null },
            { label: "Instagram", value: "Da definire", href: null },
            { label: "Telefono", value: "Da definire", href: null },
          ],
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

    if (query.includes("FROM page_sections") && query.includes("page_id = ?")) {
      return {
        results: this.pageSections
          .filter((section) => section.page_id === params[0])
          .sort((left, right) => left.section_order - right.section_order),
      };
    }

    throw new Error(`Unhandled fake D1 all/first query: ${query}`);
  }

  _run(query, params) {
    if (query.includes("INSERT INTO page_sections")) {
      const [id, pageId, sectionKey, type, order, data] = params;
      this.pageSections.push({
        id,
        page_id: pageId,
        section_key: sectionKey,
        type,
        section_order: order,
        enabled: 1,
        data,
        created_at: "2026-07-13 00:00:01",
        updated_at: "2026-07-13 00:00:01",
      });
      return { success: true };
    }

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
