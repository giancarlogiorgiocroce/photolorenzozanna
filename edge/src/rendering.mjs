import { resolveSectionContract } from "./page-contracts.mjs";

const SLUG_PATTERN = /^[a-z0-9-]{1,80}$/;
const ASSET_VERSION = "20260714-lightbox-nav";

const GALLERY_LAYOUTS = {
  ritratti: ["wide", "tall", "standard", "standard"],
  strada: ["wide", "tall", "standard", "standard", "standard", "wide"],
  "natura-quieta": ["wide", "tall", "standard", "standard", "standard", "wide"],
  natura: ["wide", "tall", "standard", "standard", "standard", "wide"],
  "forme-e-ombre": ["standard", "wide", "standard", "standard"],
};

const PAGE_DEFAULTS = {
  home: {
    footer: { href: "contact.html", label: "Contatti" },
    hero: {
      eyebrow: "Fotografo a Firenze",
      image: {
        src: "assets/images/portfolio/ritratti/ritratto-neve.jpg",
        alt: "",
        width: 1068,
        height: 1600,
        decorative: true,
      },
      primaryCta: { label: "Guarda il portfolio", href: "portfolio.html" },
      secondaryCta: { label: "Contatti", href: "contact.html" },
    },
    selectedWork: {
      kicker: "Selezione",
      shots: [
        {
          caption: "Ritratti",
          src: "assets/images/portfolio/ritratti/ritratto-riflesso.jpg",
          alt: "Ritratto sovrapposto a riflessi di rami",
          width: 1600,
          height: 1071,
        },
        {
          caption: "Strada e forme",
          src: "assets/images/portfolio/strada/passante-cane.jpg",
          alt: "Passante con cane ripreso in movimento",
          width: 1600,
          height: 1200,
          variant: "wide",
        },
        {
          caption: "Natura",
          src: "assets/images/portfolio/natura/bosco-casentino.jpg",
          alt: "Bosco fitto attraversato da luce verde",
          width: 1600,
          height: 1600,
        },
      ],
    },
    splitSection: {
      kicker: "Selezione",
      title: "Poche immagini, ben scelte.",
      cta: { label: "Scopri l'approccio", href: "about.html" },
    },
    faq: {
      title: "Domande frequenti",
      intro: "Risposte pratiche per ritratti, lavori su richiesta, stampe e collaborazioni.",
    },
  },
  "chi-sono": {
    footer: { href: "portfolio.html", label: "Portfolio" },
    hero: {
      eyebrow: "Chi sono",
      image: {
        src: "assets/images/portfolio/ritratti/ritratto-riflesso.jpg",
        alt: "Ritratto sovrapposto a riflessi di rami",
        width: 1600,
        height: 1071,
      },
    },
    manifesto: {
      kicker: "Sguardo",
    },
    faq: {
      title: "Sul lavoro",
      intro: "Risposte pratiche su ritratti, lavori su richiesta e collaborazioni.",
    },
  },
  contatti: {
    footer: { href: "index.html", label: "Torna alla home" },
    hero: {
      eyebrow: "Contatti",
      image: {
        src: "assets/images/portfolio/forme/ombre-grata.jpg",
        alt: "",
        width: 1600,
        height: 1200,
        decorative: true,
      },
    },
    contactBand: {
      channels: [
        { label: "Email", value: "Da definire", href: null, enabled: true },
        { label: "Instagram", value: "Da definire", href: null, enabled: true },
        { label: "Telefono", value: "Da definire", href: null, enabled: true },
      ],
    },
    availability: {
      kicker: "Richieste",
    },
    faq: {
      title: "Prima di scrivere",
      intro: "Informazioni pratiche per mandare una richiesta chiara.",
    },
  },
  portfolio: {
    footer: { href: "contact.html", label: "Disponibilita e contatti" },
    hero: {
      eyebrow: "Portfolio",
    },
    faq: {
      title: "Sul portfolio",
      intro: "Informazioni pratiche su serie, richieste, stampe e collaborazioni.",
    },
  },
};

export async function renderPageHtml(env, input) {
  const siteSlug = requiredPattern(input?.site, "site", SLUG_PATTERN);
  const pageSlug = requiredPattern(input?.page, "page", SLUG_PATTERN);

  if (!env?.DB) {
    throw new Error("D1 binding DB is not configured.");
  }

  const site = await env.DB.prepare("SELECT id, slug, name, status FROM sites WHERE slug = ?")
    .bind(siteSlug)
    .first();

  if (!site || site.status !== "published") {
    throw new Error(`Site not found: ${siteSlug}`);
  }

  const page = await env.DB.prepare(
    `SELECT id, slug, title, status
     FROM pages
     WHERE site_id = ? AND slug = ? AND status = 'published'`,
  )
    .bind(site.id, pageSlug)
    .first();

  if (!page) {
    throw new Error(`Page not found: ${pageSlug}`);
  }

  const sectionsResult = await env.DB.prepare(
    `SELECT id, section_key, type, section_order, enabled, data
     FROM page_sections
     WHERE page_id = ? AND enabled = 1
     ORDER BY section_order ASC`,
  )
    .bind(page.id)
    .all();

  const context = getPageContext(page.slug, page.title);
  const sections = (sectionsResult.results ?? []).map((section) => normalizeSection(page.slug, section));
  const body = sections.map((section) => renderSection(section, context)).filter(Boolean).join("\n");

  return `<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
${indent(renderHeadMeta(context), 4)}
    <link rel="stylesheet" href="${assetUrl("assets/css/base.css")}" />
    <link rel="stylesheet" href="${assetUrl(`assets/css/${context.css}`)}" />
    <script src="${assetUrl("assets/js/main.js")}" defer></script>
    ${context.slug === "portfolio" ? `<script src="${assetUrl("assets/js/gallery.js")}" defer></script>` : ""}
  </head>
  <body>
    <a class="skip-link" href="#main">Vai al contenuto</a>
${indent(renderHeader(context), 4)}
    <main id="main">
${indent(body, 6)}
    </main>
${indent(renderFooter(context), 4)}
  </body>
</html>`;
}

function normalizeSection(pageSlug, section) {
  const contract = resolveSectionContract(pageSlug, section);
  return {
    id: section.id,
    sectionId: section.section_key,
    type: section.type,
    styleContract: contract.styleContract,
    order: Number(section.section_order),
    data: safeJson(section.data) ?? {},
  };
}

function renderSection(section, context) {
  if (section.styleContract === "home.hero") return renderHomeHero(section);
  if (section.styleContract === "home.selected_work") return renderHomeSelectedWork(section);
  if (section.styleContract === "home.split_section") return renderHomeSplitSection(section);
  if (section.styleContract === "about.hero") return renderAboutHero(section);
  if (section.styleContract === "about.manifesto") return renderAboutManifesto(section);
  if (section.styleContract === "about.values_grid") return renderAboutValuesGrid(section);
  if (section.styleContract === "contact.hero") return renderContactHero(section);
  if (section.styleContract === "contact.band") return renderContactBand(section);
  if (section.styleContract === "contact.availability") return renderContactAvailability(section);
  if (section.styleContract === "portfolio.page_hero") return renderPortfolioHero(section);
  if (section.styleContract === "portfolio.series_text") return renderPortfolioSeriesText(section);
  if (section.styleContract === "common.cta") return "";

  if (section.type === "hero") return renderHero(section, context);
  if (section.type === "text") return renderText(section);
  if (section.type === "gallery") return renderGallery(section);
  if (section.type === "faq") return renderFaq(section, context);
  if (section.type === "cta") return renderCta(section);
  return "";
}

function renderHomeHero(section) {
  const defaults = PAGE_DEFAULTS.home.hero;
  const image = section.data.image ?? defaults.image;
  const primaryCta = section.data.primaryCta ?? defaults.primaryCta;
  const secondaryCta = section.data.secondaryCta ?? defaults.secondaryCta;

  return `<section class="hero" data-section-id="${escapeAttribute(section.sectionId)}" data-section-type="hero" aria-labelledby="hero-title">
  <div class="hero__media" aria-hidden="true">
${indent(renderImage(image, { fetchPriority: "high" }), 4)}
  </div>
  <div class="hero__content reveal">
    <p class="eyebrow">${escapeHtml(section.data.eyebrow ?? defaults.eyebrow)}</p>
    <h1 id="hero-title">${escapeHtml(section.data.title ?? "")}</h1>
    <p class="hero__intro">${renderRichInline(section.data.intro ?? section.data.body)}</p>
    <div class="hero__actions">
      ${renderTextLink(primaryCta, "text-link text-link--accent")}
      ${renderTextLink(secondaryCta, "text-link")}
    </div>
  </div>
</section>`;
}

function renderHomeSelectedWork(section) {
  const defaults = PAGE_DEFAULTS.home.selectedWork;
  const shots = Array.isArray(section.data.shots) && section.data.shots.length ? section.data.shots : defaults.shots;
  const intro = plainText(section.data.intro ?? section.data.paragraphs);

  return `<section class="section section--intro" data-section-id="${escapeAttribute(section.sectionId)}" data-section-type="text" aria-labelledby="selected-title">
  <div class="section__header reveal">
    <p class="section-kicker">${escapeHtml(section.data.kicker ?? defaults.kicker)}</p>
    <h2 id="selected-title">${escapeHtml(section.data.title ?? "")}</h2>
    ${intro ? `<p>${renderRichInline(section.data.intro ?? section.data.paragraphs)}</p>` : ""}
  </div>
  <div class="selected-grid">
${indent(shots.map(renderSelectedShot).join("\n"), 4)}
  </div>
</section>`;
}

function renderSelectedShot(shot) {
  const className = shot?.variant === "wide" ? "selected-shot selected-shot--wide reveal" : "selected-shot reveal";
  return `<figure class="${className}">
${indent(renderImage(shot), 2)}
  <figcaption>${escapeHtml(shot?.caption ?? "")}</figcaption>
</figure>`;
}

function renderHomeSplitSection(section) {
  const defaults = PAGE_DEFAULTS.home.splitSection;
  const text = plainText(section.data.text ?? section.data.paragraphs);
  const cta = section.data.cta ?? defaults.cta;

  return `<section class="section split-section" data-section-id="${escapeAttribute(section.sectionId)}" data-section-type="text" aria-labelledby="landing-title">
  <div class="split-section__copy reveal">
    <p class="section-kicker">${escapeHtml(section.data.kicker ?? section.data.title ?? defaults.kicker)}</p>
    <h2 id="landing-title">${escapeHtml(section.data.heading ?? defaults.title)}</h2>
  </div>
  <div class="split-section__text reveal">
    ${text ? `<p>${renderRichInline(section.data.text ?? section.data.paragraphs)}</p>` : ""}
    ${renderTextLink(cta, "text-link text-link--accent")}
  </div>
</section>`;
}

function renderAboutHero(section) {
  const defaults = PAGE_DEFAULTS["chi-sono"].hero;
  const image = section.data.image ?? defaults.image;

  return `<section class="about-hero" data-section-id="${escapeAttribute(section.sectionId)}" data-section-type="hero" aria-labelledby="about-title">
  <div class="about-hero__image reveal">
${indent(renderImage(image, { fetchPriority: "high" }), 4)}
  </div>
  <div class="about-hero__copy reveal">
    <p class="eyebrow">${escapeHtml(section.data.eyebrow ?? defaults.eyebrow)}</p>
    <h1 id="about-title">${escapeHtml(section.data.title ?? "")}</h1>
${indent(renderParagraphs(section.data.intro ?? section.data.body), 4)}
  </div>
</section>`;
}

function renderAboutManifesto(section) {
  const defaults = PAGE_DEFAULTS["chi-sono"].manifesto;

  return `<section class="manifesto" data-section-id="${escapeAttribute(section.sectionId)}" data-section-type="text" aria-labelledby="approach-title">
  <div class="manifesto__line reveal">
    <p class="section-kicker">${escapeHtml(section.data.kicker ?? defaults.kicker)}</p>
    <h2 id="approach-title">${escapeHtml(section.data.title ?? "")}</h2>
  </div>
  <div class="manifesto__text reveal">
${indent(renderParagraphs(section.data.paragraphs), 4)}
  </div>
</section>`;
}

function renderAboutValuesGrid(section) {
  const items = normalizeCardItems(section.data.items, section.data.subsections);

  return `<section class="values-grid" data-section-id="${escapeAttribute(section.sectionId)}" data-section-type="text" aria-label="Principi fotografici">
${indent(items.map(renderValueCard).join("\n"), 2)}
</section>`;
}

function renderValueCard(item, index) {
  return `<article class="value reveal">
  <span>${escapeHtml(item.number ?? String(index + 1).padStart(2, "0"))}</span>
  <h2>${escapeHtml(item.title ?? "")}</h2>
  <p>${renderRichInline(item.text ?? "")}</p>
</article>`;
}

function renderContactHero(section) {
  const defaults = PAGE_DEFAULTS.contatti.hero;
  const image = section.data.image ?? defaults.image;

  return `<section class="contact-hero" data-section-id="${escapeAttribute(section.sectionId)}" data-section-type="hero" aria-labelledby="contact-title">
  <div class="contact-hero__copy reveal">
    <p class="eyebrow">${escapeHtml(section.data.eyebrow ?? defaults.eyebrow)}</p>
    <h1 id="contact-title">${escapeHtml(section.data.title ?? "")}</h1>
${indent(renderParagraphs(section.data.intro ?? section.data.body), 4)}
  </div>
  <div class="contact-hero__image reveal" aria-hidden="true">
${indent(renderImage(image, { fetchPriority: "high" }), 4)}
  </div>
</section>`;
}

function renderContactBand(section) {
  const channels = normalizeContactChannels(section.data.channels);
  return `<section class="contact-band" data-section-id="${escapeAttribute(section.sectionId)}" data-section-type="text" aria-label="Canali di contatto">
${indent(channels.map(renderContactChannel).join("\n"), 2)}
</section>`;
}

function renderContactChannel(channel) {
  const label = escapeHtml(channel.label);
  const value = escapeHtml(channel.value);
  const body = `<span>${label}</span>
  <strong>${value}</strong>`;

  if (channel.href) {
    return `<a class="contact-link reveal" href="${escapeAttribute(channel.href)}">
  ${body}
</a>`;
  }

  return `<div class="contact-link reveal">
  ${body}
</div>`;
}

function normalizeContactChannels(value) {
  const channels = Array.isArray(value) && value.length ? value : PAGE_DEFAULTS.contatti.contactBand.channels;
  return channels
    .map((channel) => ({
      label: String(channel?.label ?? "").trim(),
      value: String(channel?.value ?? "").trim(),
      href: channel?.href ? String(channel.href).trim() : null,
      enabled: channel?.enabled !== false,
    }))
    .filter((channel) => channel.enabled && (channel.label || channel.value));
}

function renderContactAvailability(section) {
  const defaults = PAGE_DEFAULTS.contatti.availability;
  const items = normalizeListItems(section.data.items, section.data.subsections);

  return `<section class="availability" data-section-id="${escapeAttribute(section.sectionId)}" data-section-type="text" aria-labelledby="availability-title">
  <div class="availability__text reveal">
    <p class="section-kicker">${escapeHtml(section.data.kicker ?? defaults.kicker)}</p>
    <h2 id="availability-title">${escapeHtml(section.data.title ?? "")}</h2>
  </div>
  <ul class="availability__list reveal">
${indent(items.map((item) => `<li>${escapeHtml(item)}</li>`).join("\n"), 4)}
  </ul>
</section>`;
}

function renderPortfolioHero(section) {
  const defaults = PAGE_DEFAULTS.portfolio.hero;

  return `<section class="page-hero" data-section-id="${escapeAttribute(section.sectionId)}" data-section-type="hero" aria-labelledby="page-title">
  <p class="eyebrow reveal">${escapeHtml(section.data.eyebrow ?? defaults.eyebrow)}</p>
  <h1 id="page-title" class="reveal">${escapeHtml(section.data.title ?? "")}</h1>
  <p class="page-hero__intro reveal">${renderRichInline(section.data.intro ?? section.data.body)}</p>
</section>`;
}

function renderPortfolioSeriesText(section) {
  const title = escapeHtml(section.data.title ?? "");
  const titleId = `${escapeAttribute(section.sectionId)}-title`;
  const paragraphs = renderParagraphs(section.data.paragraphs);
  const subsections = Array.isArray(section.data.subsections) ? section.data.subsections : [];
  const subsectionHtml = subsections.map(renderEditorialSubsection).filter(Boolean).join("\n");

  return `<section class="editorial-section" data-section-id="${escapeAttribute(section.sectionId)}" data-section-type="text" aria-labelledby="${titleId}">
  <div class="editorial-section__heading reveal">
    <p class="section-kicker">Percorsi</p>
    ${title ? `<h2 id="${titleId}">${title}</h2>` : ""}
  </div>
  <div class="editorial-section__copy reveal">
${indent([paragraphs, subsectionHtml].filter(Boolean).join("\n"), 4)}
  </div>
</section>`;
}

function renderEditorialSubsection(subsection) {
  const title = escapeHtml(subsection?.title ?? "");
  const paragraphs = renderParagraphs(subsection?.paragraphs);

  if (!title && !paragraphs) return "";

  return `<section class="editorial-section__item">
  ${title ? `<h3>${title}</h3>` : ""}
${indent(paragraphs, 2)}
</section>`;
}

function renderHero(section, context) {
  const title = escapeHtml(section.data.title ?? "");
  const intro = renderParagraphs(section.data.intro ?? section.data.body);
  const className = context.slug === "home" ? "hero" : "page-hero";

  return `<section class="${className}" data-section-id="${escapeAttribute(section.sectionId)}" data-section-type="hero" aria-labelledby="page-title">
  <h1 id="page-title">${title}</h1>
${indent(intro, 2)}
</section>`;
}

function renderText(section) {
  const title = escapeHtml(section.data.title ?? "");
  const paragraphs = renderParagraphs(section.data.paragraphs);
  const subsections = Array.isArray(section.data.subsections) ? section.data.subsections : [];
  const subsectionHtml = subsections.map(renderTextSubsection).filter(Boolean).join("\n");

  return `<section class="section" data-section-id="${escapeAttribute(section.sectionId)}" data-section-type="text">
  ${title ? `<h2>${title}</h2>` : ""}
${indent([paragraphs, subsectionHtml].filter(Boolean).join("\n"), 2)}
</section>`;
}

function renderTextSubsection(subsection) {
  const title = escapeHtml(subsection?.title ?? "");
  const paragraphs = renderParagraphs(subsection?.paragraphs);

  if (!title && !paragraphs) return "";

  return `${title ? `<h3>${title}</h3>` : ""}
${paragraphs}`;
}

function renderGallery(section) {
  const groups = Array.isArray(section.data.items) ? section.data.items : [];
  const groupHtml = groups.map((group, index) => renderGalleryGroup(section, group, index)).filter(Boolean).join("\n");
  return `${groupHtml}
${renderLightbox()}`.trim();
}

function renderGalleryGroup(section, group, index) {
  const title = escapeHtml(group?.title ?? "");
  const images = Array.isArray(group?.images) ? group.images : [];
  const imagesHtml = images
    .map((image, imageIndex) => renderGalleryImage(image, { group, imageIndex }))
    .filter(Boolean)
    .join("\n");

  if (!title || !imagesHtml) return "";

  const titleId = `${escapeAttribute(section.sectionId)}-${escapeAttribute(toHtmlIdSegment(group?.key ?? group?.title ?? index + 1))}-title`;
  const galleryClass = index % 2 === 1 ? "masonry-gallery masonry-gallery--wide" : "masonry-gallery";

  return `<section class="portfolio-section" data-section-id="${escapeAttribute(section.sectionId)}" data-section-type="gallery" aria-labelledby="${titleId}">
  <div class="portfolio-section__header reveal">
    <p class="section-kicker">${String(index + 1).padStart(2, "0")}</p>
    <h2 id="${titleId}">${title}</h2>
  </div>
  <div class="${galleryClass}" data-lightbox-gallery>
${indent(imagesHtml, 4)}
  </div>
</section>`;
}

function renderGalleryImage(image, context = {}) {
  const src = normalizeAssetPath(image?.src);
  if (!src) return "";

  const alt = escapeAttribute(image?.alt ?? "");
  const caption = escapeAttribute(image?.caption ?? "");
  const width = positiveInteger(image?.width);
  const height = positiveInteger(image?.height);
  const className = ["gallery-item", galleryImageModifier(image, { ...context, width, height }), "reveal"]
    .filter(Boolean)
    .join(" ");
  const sizeAttributes = [
    width ? `width="${width}"` : "",
    height ? `height="${height}"` : "",
  ].filter(Boolean).join(" ");

  return `<button class="${className}" type="button" data-full="${escapeAttribute(src)}" data-caption="${caption}">
  <img src="${escapeAttribute(src)}" alt="${alt}" ${sizeAttributes} loading="lazy" decoding="async" />
</button>`;
}

function renderLightbox() {
  return `<div class="lightbox" data-lightbox aria-hidden="true">
  <button class="lightbox__close" type="button" data-lightbox-close>
    <span class="sr-only">Chiudi immagine</span>
  </button>
  <button class="lightbox__nav lightbox__nav--prev" type="button" data-lightbox-prev hidden>
    <span class="sr-only">Immagine precedente</span>
  </button>
  <button class="lightbox__nav lightbox__nav--next" type="button" data-lightbox-next hidden>
    <span class="sr-only">Immagine successiva</span>
  </button>
  <figure class="lightbox__figure">
    <img data-lightbox-image src="" alt="" />
    <figcaption data-lightbox-caption></figcaption>
  </figure>
</div>`;
}

function renderFaq(section, context) {
  const defaults = PAGE_DEFAULTS[context.slug]?.faq ?? {};
  const rawTitle = section.data.title === "FAQ" ? defaults.title : section.data.title;
  const title = escapeHtml(rawTitle ?? defaults.title ?? "FAQ");
  const intro = plainText(section.data.intro ?? defaults.intro);
  const items = Array.isArray(section.data.items) ? section.data.items : [];

  const titleId = `${escapeAttribute(section.sectionId)}-title`;

  return `<section class="faq-section" data-section-id="${escapeAttribute(section.sectionId)}" data-section-type="faq" aria-labelledby="${titleId}">
  <div class="faq-section__header reveal">
    <p class="section-kicker">FAQ</p>
    <h2 id="${titleId}">${title}</h2>
    ${intro ? `<p>${escapeHtml(intro)}</p>` : ""}
  </div>
  <div class="faq-list reveal">
${indent(items.map(renderFaqItem).join("\n"), 4)}
  </div>
</section>`;
}

function renderFaqItem(item) {
  const answer = renderParagraphs(item.answer);
  return `<details class="faq-item">
  <summary>${escapeHtml(item.question ?? "")}</summary>
  <div class="faq-answer">
${indent(answer, 4)}
  </div>
</details>`;
}

function renderCta(section) {
  const text = escapeHtml(section.data.text ?? section.data.label ?? "");
  const href = section.data.href ? escapeAttribute(section.data.href) : "";

  return `<section class="section split-section" data-section-id="${escapeAttribute(section.sectionId)}" data-section-type="cta">
  ${href ? `<a href="${href}">${text}</a>` : `<p>${text}</p>`}
</section>`;
}

function renderHeader(context) {
  return `<header class="site-header" data-site-header>
  <a class="brand" href="index.html" aria-label="Lorenzo Zanna home">
    <span class="brand__name">Lorenzo Zanna</span>
    <span class="brand__meta">photography</span>
  </a>
  <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav">
    <span class="nav-toggle__line"></span>
    <span class="sr-only">Apri menu</span>
  </button>
  <nav class="site-nav" id="site-nav" aria-label="Navigazione principale">
    ${renderNavLink("portfolio", "portfolio.html", "Portfolio", context)}
    ${renderNavLink("chi-sono", "about.html", "Chi sono", context)}
    ${renderNavLink("contatti", "contact.html", "Contatti", context)}
  </nav>
</header>`;
}

function renderNavLink(slug, href, label, context) {
  const current = context.slug === slug ? ` aria-current="page"` : "";
  return `<a href="${href}"${current}>${label}</a>`;
}

function renderFooter(context) {
  const defaults = PAGE_DEFAULTS[context.slug]?.footer ?? PAGE_DEFAULTS.portfolio.footer;

  return `<footer class="site-footer">
  <p>&copy; 2026 Lorenzo Zanna</p>
  <a href="${escapeAttribute(defaults.href)}">${escapeHtml(defaults.label)}</a>
</footer>`;
}

function renderHeadMeta(context) {
  const description = context.description ? `    <meta name="description" content="${escapeAttribute(context.description)}" />\n` : "";
  const ogTitle = context.ogTitle ? `    <meta property="og:title" content="${escapeAttribute(context.ogTitle)}" />\n` : "";
  const ogDescription = context.ogDescription
    ? `    <meta property="og:description" content="${escapeAttribute(context.ogDescription)}" />\n`
    : "";
  const ogImage = context.ogImage ? `    <meta property="og:image" content="${escapeAttribute(context.ogImage)}" />\n` : "";

  return `${description}${ogTitle}${ogDescription}    <meta property="og:type" content="website" />
${ogImage}    <title>${escapeHtml(context.title)}</title>`;
}

function getPageContext(slug, title) {
  const pages = {
    home: {
      slug: "home",
      title: "Lorenzo Zanna Photography | Ritratti, natura e strada",
      description: "Ritratti, natura, strada, forme e ombre: una selezione di fotografie di Lorenzo Zanna, con lavori su richiesta e stampe disponibili su richiesta.",
      ogTitle: "Lorenzo Zanna Photography | Ritratti, natura e strada",
      ogDescription: "Ritratti, natura, strada, forme e ombre in una selezione fotografica sobria.",
      ogImage: "https://ph.lorenzozanna.com/assets/images/portfolio/strada/controluce-vetro.jpg",
      css: "home.css",
    },
    "chi-sono": {
      slug: "chi-sono",
      title: "Chi sono | Lorenzo Zanna Photography",
      description: "Lorenzo Zanna fotografa ritratti, natura, strada, forme e ombre con uno sguardo sobrio, attento alla luce e alla presenza.",
      css: "about.css",
    },
    portfolio: {
      slug: "portfolio",
      title: "Portfolio fotografico | Lorenzo Zanna Photography",
      description: "Ritratti, strada, natura, forme e ombre: una selezione fotografica di Lorenzo Zanna tra volti, paesaggio, luce e superfici.",
      css: "portfolio.css",
    },
    contatti: {
      slug: "contatti",
      title: "Contatti | Lorenzo Zanna Photography",
      description: "Scrivi a Lorenzo Zanna per ritratti, lavori fotografici per attività, collaborazioni o informazioni sulle stampe.",
      css: "contact.css",
    },
  };

  return pages[slug] ?? {
    slug,
    title,
    css: "home.css",
  };
}

function renderParagraphs(value) {
  if (isRichTextValue(value)) {
    return value.blocks.map(renderRichParagraph).join("\n");
  }

  const paragraphs = normalizeTextList(value);
  return paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("\n");
}

function plainText(value) {
  if (isRichTextValue(value)) {
    return value.blocks
      .map((block) => (Array.isArray(block.spans) ? block.spans.map((span) => span?.text ?? "").join("") : ""))
      .join(" ")
      .trim();
  }

  return normalizeTextList(value).join(" ");
}

function renderRichInline(value) {
  if (!isRichTextValue(value)) return escapeHtml(plainText(value));
  return value.blocks
    .map((block) => (Array.isArray(block.spans) ? block.spans.map(renderRichSpan).join("") : ""))
    .join(" ");
}

function renderRichParagraph(block) {
  const spans = Array.isArray(block.spans) ? block.spans.map(renderRichSpan).join("") : "";
  return spans ? `<p>${spans}</p>` : "";
}

function renderRichSpan(span) {
  let html = escapeHtml(span?.text ?? "");
  const marks = Array.isArray(span?.marks) ? span.marks : [];

  if (marks.includes("bold")) html = `<strong>${html}</strong>`;
  if (marks.includes("italic")) html = `<em>${html}</em>`;
  if (span?.link?.href) html = `<a href="${escapeAttribute(span.link.href)}">${html}</a>`;

  return html;
}

function isRichTextValue(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && value.format === "rich_text_v1";
}

function renderTextLink(link, className) {
  if (!link?.href || !link?.label) return "";
  return `<a class="${escapeAttribute(className)}" href="${escapeAttribute(link.href)}">${escapeHtml(link.label)}</a>`;
}

function renderImage(image, options = {}) {
  const src = normalizeAssetPath(image?.src ?? image?.image);
  if (!src) return "";

  const alt = image?.decorative ? "" : image?.alt ?? "";
  const width = positiveInteger(image?.width);
  const height = positiveInteger(image?.height);
  const sizeAttributes = [
    width ? `width="${width}"` : "",
    height ? `height="${height}"` : "",
  ].filter(Boolean).join(" ");
  const priorityAttribute = options.fetchPriority ? ` fetchpriority="${escapeAttribute(options.fetchPriority)}"` : "";

  return `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}" ${sizeAttributes}${priorityAttribute} decoding="async" />`;
}

function normalizeCardItems(items, subsections) {
  if (Array.isArray(items) && items.length) {
    return items.map((item, index) => ({
      number: item?.number ?? String(index + 1).padStart(2, "0"),
      title: item?.title ?? "",
      text: plainText(item?.text ?? item?.paragraphs),
    }));
  }

  if (Array.isArray(subsections)) {
    return subsections.map((item, index) => ({
      number: String(index + 1).padStart(2, "0"),
      title: item?.title ?? "",
      text: plainText(item?.text ?? item?.paragraphs),
    }));
  }

  return [];
}

function normalizeListItems(items, subsections) {
  if (Array.isArray(items) && items.length) {
    return items.map((item) => String(item ?? "").trim()).filter(Boolean);
  }

  if (Array.isArray(subsections)) {
    return subsections
      .map((item) => plainText(item?.paragraphs) || item?.title)
      .map((item) => String(item ?? "").trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeTextList(value) {
  if (isRichTextValue(value)) {
    return [plainText(value)].filter(Boolean);
  }

  if (Array.isArray(value)) {
    return value.map((item) => plainText(item) || String(item ?? "").trim()).filter(Boolean);
  }

  const normalized = String(value ?? "").trim();
  return normalized ? [normalized] : [];
}

function normalizeAssetPath(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  if (normalized.startsWith("/assets/")) return normalized.slice(1);
  if (normalized.startsWith("assets/")) return normalized;
  return "";
}

function positiveInteger(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) return null;
  return number;
}

function galleryImageModifier(image, context = {}) {
  const explicitVariant = normalizeGalleryVariant(image?.variant ?? image?.layout);
  if (explicitVariant) return explicitVariant === "standard" ? "" : `gallery-item--${explicitVariant}`;

  const groupKey = String(context.group?.key ?? "")
    .trim()
    .toLowerCase();
  const curatedVariant = GALLERY_LAYOUTS[groupKey]?.[context.imageIndex];
  if (curatedVariant) return curatedVariant === "standard" ? "" : `gallery-item--${curatedVariant}`;

  const width = context.width;
  const height = context.height;
  if (!width || !height) return "";
  if (height / width >= 1.25) return "gallery-item--tall";
  if (width / height >= 1.25) return "gallery-item--wide";
  return "";
}

function normalizeGalleryVariant(value) {
  if (value === "wide" || value === "tall" || value === "standard") return value;
  return "";
}

function assetUrl(path) {
  return `${escapeAttribute(path)}?v=${ASSET_VERSION}`;
}

function toHtmlIdSegment(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "section";
}

function requiredString(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Missing required value.");
  }
  return value.trim();
}

function requiredPattern(value, name, pattern) {
  const normalized = requiredString(value);
  if (!pattern.test(normalized)) {
    throw new Error(`Invalid ${name}.`);
  }
  return normalized;
}

function safeJson(value) {
  if (value == null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function indent(value, spaces) {
  if (!value) return "";
  const prefix = " ".repeat(spaces);
  return value
    .split("\n")
    .map((line) => (line ? `${prefix}${line}` : line))
    .join("\n");
}
