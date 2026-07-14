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

  assert.match(html, /<h1[^>]*>Portfolio fotografico<\/h1>/);
  assert.match(html, /<section[^>]*data-section-id="faq"/);
  assert.match(html, /class="faq-section"/);
  assert.match(html, /class="faq-item"/);
  assert.match(html, /Domande frequenti/);
  assert.match(html, /Come e organizzato il portfolio\?/);
});

test("renderPageHtml renders rich_text_v1 marks and links without raw HTML", async () => {
  const db = createRendererDb({
    richText: true,
  });
  const html = await renderPageHtml(
    { DB: db },
    {
      site: "ph",
      page: "portfolio",
    },
  );

  assert.match(html, /Risposta <strong>importante<\/strong> e <em>leggibile<\/em> <a href="\/portfolio.html">con link<\/a>/);
  assert.doesNotMatch(html, /<script>/);
});

test("renderPageHtml includes the existing site shell and page assets", async () => {
  const db = createRendererDb();
  const html = await renderPageHtml(
    { DB: db },
    {
      site: "ph",
      page: "portfolio",
    },
  );

  assert.match(html, /<link rel="stylesheet" href="assets\/css\/base\.css\?v=20260714-lightbox-nav" \/>/);
  assert.match(html, /<link rel="stylesheet" href="assets\/css\/portfolio\.css\?v=20260714-lightbox-nav" \/>/);
  assert.match(html, /<meta\s+name="description"\s+content="Ritratti, strada, natura, forme e ombre: una selezione fotografica di Lorenzo Zanna tra volti, paesaggio, luce e superfici\."\s+\/>/);
  assert.match(html, /<script src="assets\/js\/main\.js\?v=20260714-lightbox-nav" defer><\/script>/);
  assert.match(html, /<script src="assets\/js\/gallery\.js\?v=20260714-lightbox-nav" defer><\/script>/);
  assert.match(html, /class="site-header"/);
  assert.match(html, /<nav class="site-nav"/);
  assert.match(html, /href="portfolio\.html" aria-current="page"/);
  assert.match(html, /<footer class="site-footer">/);
});

test("renderPageHtml renders portfolio series text with its editorial contract", async () => {
  const db = createRendererDb({
    pageBlocksShape: true,
  });
  const html = await renderPageHtml(
    { DB: db },
    {
      site: "ph",
      page: "portfolio",
    },
  );

  assert.match(html, /<section class="editorial-section"[^>]*data-section-id="text_2"[^>]*data-section-type="text"/);
  assert.match(html, /class="editorial-section__heading reveal"/);
  assert.match(html, /class="editorial-section__copy reveal"/);
  assert.match(html, /class="editorial-section__item"/);
  assert.doesNotMatch(html, /<section class="section" data-section-id="text_2"/);
});

test("renderPageHtml renders portfolio gallery sections from legacy series data", async () => {
  const db = createRendererDb({
    gallery: true,
  });
  const html = await renderPageHtml(
    { DB: db },
    {
      site: "ph",
      page: "portfolio",
    },
  );

  assert.match(html, /<section class="portfolio-section"[^>]*data-section-id="gallery"/);
  assert.match(html, /<p class="section-kicker">01<\/p>/);
  assert.match(html, /<h2 id="gallery-ritratti-title">Ritratti<\/h2>/);
  assert.match(html, /class="masonry-gallery" data-lightbox-gallery/);
  assert.match(html, /class="gallery-item gallery-item--wide reveal"/);
  assert.match(html, /data-full="assets\/images\/portfolio\/ritratti\/ritratto-riflesso\.jpg"/);
  assert.match(html, /data-caption="Ritratti \/ riflesso"/);
  assert.match(html, /<img src="assets\/images\/portfolio\/ritratti\/ritratto-riflesso\.jpg" alt="Ritratto sovrapposto a riflessi di rami" width="1600" height="1071" loading="lazy" decoding="async" \/>/);
  assert.match(html, /<div class="lightbox" data-lightbox aria-hidden="true">/);
  assert.match(html, /data-lightbox-prev hidden/);
  assert.match(html, /data-lightbox-next hidden/);
  assert.match(html, /<figcaption data-lightbox-caption><\/figcaption>/);
});

test("renderPageHtml uses curated portfolio gallery layout patterns", async () => {
  const db = createRendererDb({
    gallery: true,
  });
  const html = await renderPageHtml(
    { DB: db },
    {
      site: "ph",
      page: "portfolio",
    },
  );

  const formsStart = html.indexOf('id="gallery-forme-e-ombre-title"');
  const faqStart = html.indexOf('data-section-id="faq"');
  const formsHtml = html.slice(formsStart, faqStart);

  assert.match(formsHtml, /class="gallery-item reveal"[^>]*data-full="assets\/images\/portfolio\/forme\/ombre-grata\.jpg"/);
  assert.match(formsHtml, /class="gallery-item gallery-item--wide reveal"[^>]*data-full="assets\/images\/portfolio\/forme\/parete-segni\.jpg"/);
  assert.match(formsHtml, /class="gallery-item reveal"[^>]*data-full="assets\/images\/portfolio\/forme\/taglio-luce-uno\.jpg"/);
  assert.match(formsHtml, /class="gallery-item reveal"[^>]*data-full="assets\/images\/portfolio\/forme\/taglio-luce-due\.jpg"/);
});

test("renderPageHtml renders the home page with the existing visual contract", async () => {
  const db = createRendererDb();
  const html = await renderPageHtml(
    { DB: db },
    {
      site: "ph",
      page: "home",
    },
  );

  assert.match(html, /<section class="hero"[^>]*data-section-id="hero"/);
  assert.match(html, /class="hero__media"/);
  assert.match(html, /assets\/images\/portfolio\/ritratti\/ritratto-neve\.jpg/);
  assert.match(html, /class="hero__content reveal"/);
  assert.match(html, /class="hero__intro"/);
  assert.match(html, /class="hero__actions"/);
  assert.match(html, /class="section section--intro"/);
  assert.match(html, /class="selected-grid"/);
  assert.match(html, /class="selected-shot selected-shot--wide reveal"/);
  assert.match(html, /class="split-section__copy reveal"/);
  assert.doesNotMatch(html, /data-section-id="cta"/);
});

test("renderPageHtml renders the about page with the existing visual contract", async () => {
  const db = createRendererDb();
  const html = await renderPageHtml(
    { DB: db },
    {
      site: "ph",
      page: "chi-sono",
    },
  );

  assert.match(html, /<section class="about-hero"[^>]*data-section-id="hero"/);
  assert.match(html, /class="about-hero__image reveal"/);
  assert.match(html, /assets\/images\/portfolio\/ritratti\/ritratto-riflesso\.jpg/);
  assert.match(html, /class="manifesto"[^>]*data-section-id="text_2"/);
  assert.match(html, /class="manifesto__line reveal"/);
  assert.match(html, /class="values-grid"[^>]*data-section-id="text_3"/);
  assert.match(html, /<article class="value reveal">/);
});

test("renderPageHtml renders the contact page with the existing visual contract", async () => {
  const db = createRendererDb();
  const html = await renderPageHtml(
    { DB: db },
    {
      site: "ph",
      page: "contatti",
    },
  );

  assert.match(html, /<section class="contact-hero"[^>]*data-section-id="hero"/);
  assert.match(html, /class="contact-hero__copy reveal"/);
  assert.match(html, /class="contact-hero__image reveal"/);
  assert.match(html, /assets\/images\/portfolio\/forme\/ombre-grata\.jpg/);
  assert.match(html, /<section class="contact-band" aria-label="Canali di contatto">/);
  assert.match(html, /class="contact-link reveal"/);
  assert.match(html, /class="availability"[^>]*data-section-id="text_2"/);
  assert.match(html, /class="availability__list reveal"/);
});

test("renderPageHtml renders the portfolio hero with the existing page hero contract", async () => {
  const db = createRendererDb();
  const html = await renderPageHtml(
    { DB: db },
    {
      site: "ph",
      page: "portfolio",
    },
  );

  assert.match(html, /<section class="page-hero"[^>]*data-section-id="hero"/);
  assert.match(html, /<p class="eyebrow reveal">Portfolio<\/p>/);
  assert.match(html, /<h1 id="page-title" class="reveal">Portfolio fotografico<\/h1>/);
  assert.match(html, /class="page-hero__intro reveal"/);
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

test("renderPageHtml renders page block arrays and subsections without comma-joining text", async () => {
  const db = createRendererDb({
    pageBlocksShape: true,
  });
  const html = await renderPageHtml(
    { DB: db },
    {
      site: "ph",
      page: "portfolio",
    },
  );

  assert.match(html, /<p class="page-hero__intro reveal">Prima riga hero\. Seconda riga hero\.<\/p>/);
  assert.doesNotMatch(html, /Prima riga hero\.,Seconda riga hero\./);
  assert.match(html, /<h3>Ritratti<\/h3>/);
  assert.match(html, /<p>Persone e postura\.<\/p>/);
  assert.doesNotMatch(html, /data-section-type="cta"/);
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
  const pageBlocksShape = options.pageBlocksShape === true;
  const gallery = options.gallery === true;
  const richText = options.richText === true;

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
        id: "page_home",
        site_id: "site_ph",
        slug: "home",
        title: "Lorenzo Zanna Photography",
        status: "published",
      },
      {
        id: "page_chi_sono",
        site_id: "site_ph",
        slug: "chi-sono",
        title: "Chi sono",
        status: "published",
      },
      {
        id: "page_portfolio",
        site_id: "site_ph",
        slug: "portfolio",
        title: "Portfolio fotografico",
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
      section("section_home_hero", "hero", "hero", 10, true, {
        title: "Lorenzo Zanna Photography",
        intro: [
          "Ritratti, natura, strada, forme e ombre.",
          "Firenze resta sullo sfondo: pietra, vetro, passi, ombra.",
        ],
      }, "page_home"),
      section("section_home_selected", "text_2", "text", 20, true, {
        title: "Ritratti, natura, strada",
        paragraphs: ["Volti, boschi, passanti, pareti e tagli di luce."],
      }, "page_home"),
      section("section_home_split", "text_3", "text", 30, true, {
        title: "Selezione",
        paragraphs: ["Il lavoro si muove tra osservazione personale e richieste su misura."],
      }, "page_home"),
      section("section_home_cta", "cta", "cta", 100, true, {
        text: "Guarda il portfolio oppure scrivi.",
      }, "page_home"),
      section("section_about_hero", "hero", "hero", 10, true, {
        title: "Chi è Lorenzo Zanna",
        intro: ["Sono Lorenzo Zanna.", "Lavoro a Firenze e dove il progetto porta."],
      }, "page_chi_sono"),
      section("section_about_manifesto", "text_2", "text", 20, true, {
        title: "Uno sguardo sobrio",
        paragraphs: ["Non cerco immagini rumorose."],
      }, "page_chi_sono"),
      section("section_about_values", "text_3", "text", 30, true, {
        title: "Fotografia personale e su richiesta",
        subsections: [
          { title: "Ritratti", paragraphs: ["Volti e presenze."] },
          { title: "Commerciale", paragraphs: ["Persone, spazi e dettagli."] },
          { title: "Stampe", paragraphs: ["Fotografie su carta."] },
        ],
      }, "page_chi_sono"),
      section("section_contact_hero", "hero", "hero", 10, true, {
        title: "Contatti",
        intro: ["Scrivi per un ritratto.", "Bastano poche informazioni chiare."],
      }, "page_contatti"),
      section("section_contact_availability", "text_2", "text", 20, true, {
        title: "Come inviare una richiesta utile",
        subsections: [
          { title: "Indica il tipo di progetto", paragraphs: ["Ritratto, lavoro, collaborazione o stampa."] },
          { title: "Spiega l'uso delle immagini", paragraphs: ["Profilo, sito, social o stampa."] },
        ],
      }, "page_contatti"),
      section("section_portfolio_hero", "hero", "hero", 10, true, {
        title: "Portfolio fotografico",
        intro: pageBlocksShape
          ? ["Prima riga hero.", "Seconda riga hero."]
          : "Ritratti, strada, natura, forme e ombre.",
      }),
      section("section_portfolio_series", "text_2", "text", 20, true, {
        title: "Serie",
        paragraphs: ["Ritratti, natura, strada e forme."],
        subsections: pageBlocksShape
          ? [
              {
                title: "Ritratti",
                paragraphs: ["Persone e postura."],
              },
            ]
          : [],
      }),
      ...(gallery
        ? [
            section("section_portfolio_gallery", "gallery", "gallery", 30, true, {
              title: "Portfolio fotografico",
              intro: "Serie principali.",
              items: [
                {
                  key: "ritratti",
                  title: "Ritratti",
                  images: [
                    {
                      caption: "Ritratti / riflesso",
                      alt: "Ritratto sovrapposto a riflessi di rami",
                      width: 1600,
                      height: 1071,
                      src: "/assets/images/portfolio/ritratti/ritratto-riflesso.jpg",
                    },
                  ],
                },
                {
                  key: "forme-e-ombre",
                  title: "Forme e ombre",
                  images: [
                    {
                      caption: "Forme e ombre / grata",
                      alt: "Ombre geometriche proiettate su una parete",
                      width: 1600,
                      height: 1200,
                      src: "/assets/images/portfolio/forme/ombre-grata.jpg",
                    },
                    {
                      caption: "Forme e ombre / segni",
                      alt: "Parete chiara con segni e linee ripetute",
                      width: 1600,
                      height: 1249,
                      src: "/assets/images/portfolio/forme/parete-segni.jpg",
                    },
                    {
                      caption: "Forme e ombre / taglio di luce",
                      alt: "Taglio di luce diagonale su superfici scure",
                      width: 1600,
                      height: 1200,
                      src: "/assets/images/portfolio/forme/taglio-luce-uno.jpg",
                    },
                    {
                      caption: "Forme e ombre / diagonale",
                      alt: "Griglia luminosa diagonale in bianco e nero",
                      width: 1600,
                      height: 1200,
                      src: "/assets/images/portfolio/forme/taglio-luce-due.jpg",
                    },
                  ],
                },
              ],
            }),
          ]
        : []),
      section("section_portfolio_faq", "faq", "faq", 90, faqEnabled, {
        title: "Domande frequenti",
        items: [
          {
            question: "Come e organizzato il portfolio?",
            answer: richText
              ? richTextValue([
                  [
                    { text: "Risposta ", marks: [] },
                    { text: "importante", marks: ["bold"] },
                    { text: " e ", marks: [] },
                    { text: "leggibile", marks: ["italic"] },
                    { text: " ", marks: [] },
                    { text: "con link", marks: [], link: { href: "/portfolio.html" } },
                  ],
                ])
              : "Per serie: ritratti, strada, natura, forme e ombre.",
          },
        ],
      }),
      ...(pageBlocksShape
        ? [
            section("section_portfolio_cta", "cta", "cta", 100, true, {
              text: "Scrivi per informazioni.",
            }),
          ]
        : []),
    ],
  });
}

function section(id, key, type, order, enabled, data, pageId = "page_portfolio") {
  return {
    id,
    page_id: pageId,
    section_key: key,
    type,
    section_order: order,
    enabled: enabled ? 1 : 0,
    data: JSON.stringify(data),
  };
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
