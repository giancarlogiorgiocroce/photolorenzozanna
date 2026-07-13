import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = {
  name: "lorenzozanna-content",
  title: "Lorenzo Zanna Content API",
  version: "0.1.0",
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, "..");
const API_BASE = process.env.LORENZO_API_BASE || "https://api.lorenzozanna.com";
const DEFAULT_SITE = process.env.LORENZO_SITE || "ph";
const DEFAULT_ACTOR = process.env.LORENZO_MCP_ACTOR || "mcp-lorenzozanna";
const LIVE_PAGE_KEYS = new Set(["home", "chi-sono", "portfolio", "contatti"]);
const INTERNAL_DOC_KEYS = new Set(["piano-seo"]);

const TOOLS = [
  {
    name: "get_public_content",
    title: "Get Public Content",
    description: "Read published content for a Lorenzo Zanna site from the public API.",
    inputSchema: {
      type: "object",
      properties: {
        site: { type: "string", description: "Site slug, usually ph.", default: DEFAULT_SITE },
      },
    },
  },
  {
    name: "upsert_content",
    title: "Upsert Content",
    description: "Create or update one structured content entry through the private API.",
    inputSchema: {
      type: "object",
      properties: {
        site: { type: "string", default: DEFAULT_SITE },
        collection: { type: "string", description: "Collection name, e.g. home, pages, portfolio." },
        key: { type: "string", description: "Content key inside the collection." },
        data: { type: "object", description: "Structured JSON content to store." },
        publish: { type: "boolean", default: true },
      },
      required: ["collection", "key", "data"],
    },
  },
  {
    name: "list_changes",
    title: "List Changes",
    description: "Read recent private change log entries for a site.",
    inputSchema: {
      type: "object",
      properties: {
        site: { type: "string", default: DEFAULT_SITE },
        limit: { type: "number", default: 20 },
      },
    },
  },
  {
    name: "sync_content_markdown",
    title: "Sync Content Markdown",
    description: "Parse content.md and write current pages to D1. Extra pages are saved as draft, and Piano SEO is saved as an internal document.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", default: "content.md", description: "Markdown file path inside the workspace." },
        site: { type: "string", default: DEFAULT_SITE },
        publish: { type: "boolean", default: true },
        updateVisibleContent: {
          type: "boolean",
          default: true,
          description: "Also update home/about/portfolio/contact API entries used by the current static site model.",
        },
      },
    },
  },
];

const state = {
  initialized: false,
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  process.stdin.setEncoding("utf8");
  let buffer = "";

  for await (const chunk of process.stdin) {
    buffer += chunk;
    while (buffer.includes("\n")) {
      const index = buffer.indexOf("\n");
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      await handleLine(line);
    }
  }
}

async function handleLine(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch (error) {
    sendError(null, -32700, "Parse error", { message: error.message });
    return;
  }

  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    sendError(message?.id ?? null, -32600, "Invalid Request");
    return;
  }

  if (message.id === undefined) {
    await handleNotification(message);
    return;
  }

  try {
    const result = await handleRequest(message.method, message.params ?? {});
    send({ jsonrpc: "2.0", id: message.id, result });
  } catch (error) {
    sendError(message.id, error.code ?? -32000, error.message || "Server error", error.data);
  }
}

async function handleNotification(message) {
  if (message.method === "notifications/initialized") {
    state.initialized = true;
  }
}

async function handleRequest(method, params) {
  if (method === "initialize") {
    state.initialized = false;
    return {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {
        tools: {
          listChanged: false,
        },
      },
      serverInfo: SERVER_INFO,
      instructions:
        "Use tools to read and update Lorenzo Zanna site content through the private API. Do not store scripts or arbitrary HTML in content fields.",
    };
  }

  if (method === "ping") return {};

  if (method === "tools/list") {
    return { tools: TOOLS };
  }

  if (method === "tools/call") {
    return callTool(params);
  }

  throw mcpError(-32601, `Method not found: ${method}`);
}

async function callTool(params) {
  const name = params?.name;
  const args = params?.arguments ?? {};
  let result;

  if (name === "get_public_content") {
    const site = args.site || DEFAULT_SITE;
    result = await apiJson(`/api/public/sites/${encodeURIComponent(site)}/content`);
  } else if (name === "upsert_content") {
    result = await upsertContent({
      site: args.site || DEFAULT_SITE,
      collection: requiredString(args.collection, "collection"),
      key: requiredString(args.key, "key"),
      data: requiredObject(args.data, "data"),
      publish: args.publish !== false,
    });
  } else if (name === "list_changes") {
    const site = args.site || DEFAULT_SITE;
    const limit = Number.isFinite(args.limit) ? args.limit : 20;
    const changes = await apiJson(`/api/private/sites/${encodeURIComponent(site)}/changes`, {
      private: true,
    });
    result = {
      site,
      changes: (changes.changes ?? []).slice(0, limit),
    };
  } else if (name === "sync_content_markdown") {
    result = await syncContentMarkdown(args);
  } else {
    throw mcpError(-32602, `Unknown tool: ${name}`);
  }

  return toolResult(result);
}

async function syncContentMarkdown(args) {
  const site = args.site || DEFAULT_SITE;
  const publish = args.publish !== false;
  const updateVisibleContent = args.updateVisibleContent !== false;
  const markdownPath = resolveWorkspacePath(args.path || "content.md");
  const markdown = await fs.readFile(markdownPath, "utf8");
  const parsedEntries = parseContentMarkdown(markdown);
  const pages = parsedEntries.filter((entry) => !INTERNAL_DOC_KEYS.has(entry.key));
  const internalDocs = parsedEntries.filter((entry) => INTERNAL_DOC_KEYS.has(entry.key));

  if (parsedEntries.length === 0) {
    throw mcpError(-32602, "No top-level pages found in markdown file.");
  }

  const writtenPages = [];
  const draftPages = [];
  for (const page of pages) {
    const isLive = LIVE_PAGE_KEYS.has(page.key);
    await upsertContent({
      site,
      collection: "pages",
      key: page.key,
      data: page,
      publish: publish && isLive,
    });
    const summary = { key: page.key, slug: page.slug, title: page.title };
    if (isLive) writtenPages.push(summary);
    else draftPages.push(summary);
  }

  const writtenInternalDocs = [];
  for (const doc of internalDocs) {
    await upsertContent({
      site,
      collection: "internal",
      key: doc.key,
      data: doc,
      publish: false,
    });
    await upsertContent({
      site,
      collection: "pages",
      key: doc.key,
      data: {
        deprecated: true,
        reason: "Internal planning document, not a public website page.",
        movedTo: `internal/${doc.key}`,
        title: doc.title,
      },
      publish: false,
    });
    writtenInternalDocs.push({ key: doc.key, title: doc.title, collection: "internal" });
  }

  const visibleWrites = updateVisibleContent
    ? await updateVisibleEntriesFromPages(site, pages, publish)
    : [];

  return {
    site,
    source: path.relative(WORKSPACE_ROOT, markdownPath),
    livePageCount: writtenPages.length,
    draftPageCount: draftPages.length,
    internalDocCount: writtenInternalDocs.length,
    livePages: writtenPages,
    draftPages,
    internalDocs: writtenInternalDocs,
    visibleWrites,
  };
}

async function updateVisibleEntriesFromPages(site, pages, publish) {
  const byTitle = new Map(
    pages
      .filter((page) => LIVE_PAGE_KEYS.has(page.key))
      .map((page) => [page.title.toLowerCase(), page]),
  );
  const current = await apiJson(`/api/public/sites/${encodeURIComponent(site)}/content`);
  const content = current.content ?? {};
  const writes = [];

  const home = byTitle.get("home");
  if (home) {
    const data = {
      eyebrow: "Fotografo a Firenze",
      title: home.h1 || "Lorenzo Zanna Photography",
      intro: firstParagraph(home.intro) || "",
      primaryCta: { label: "Guarda il portfolio fotografico", href: "/portfolio.html" },
      secondaryCta: { label: "Contatti", href: "/contact.html" },
      image: content.home?.hero?.image ?? {
        src: "/assets/images/portfolio/ritratti/ritratto-neve.jpg",
        alt: "Ritratto verticale in bianco e nero sulla neve",
        width: 1068,
        height: 1600,
      },
      seo: home.meta,
    };
    await upsertContent({ site, collection: "home", key: "hero", data, publish });
    writes.push("home/hero");
  }

  const about = byTitle.get("chi sono");
  if (about) {
    const data = {
      eyebrow: "Chi sono",
      title: about.h1 || "Chi sono",
      body: joinParagraphs(about.intro, 2),
      image: content.about?.hero?.image ?? {
        src: "/assets/images/portfolio/ritratti/ritratto-riflesso.jpg",
        alt: "Ritratto sovrapposto a riflessi di rami",
        width: 1600,
        height: 1071,
      },
      seo: about.meta,
    };
    await upsertContent({ site, collection: "about", key: "hero", data, publish });
    writes.push("about/hero");
  }

  const portfolio = byTitle.get("portfolio");
  if (portfolio) {
    const data = {
      ...(content.portfolio?.series ?? {}),
      title: portfolio.h1 || "Portfolio fotografico",
      intro: firstParagraph(portfolio.intro) || "",
      seo: portfolio.meta,
    };
    await upsertContent({ site, collection: "portfolio", key: "series", data, publish });
    writes.push("portfolio/series");
  }

  const contact = byTitle.get("contatti");
  if (contact) {
    const data = {
      ...(content.contact?.details ?? {}),
      title: contact.h1 || "Contatti",
      intro: firstParagraph(contact.intro) || "",
      seo: contact.meta,
    };
    await upsertContent({ site, collection: "contact", key: "details", data, publish });
    writes.push("contact/details");
  }

  const faqTargets = [
    { page: home, collection: "home", key: "faq", title: "Domande frequenti" },
    { page: about, collection: "about", key: "faq", title: "Sul lavoro" },
    { page: portfolio, collection: "portfolio", key: "faq", title: "Sul portfolio" },
    { page: contact, collection: "contact", key: "faq", title: "Prima di scrivere" },
  ];

  for (const target of faqTargets) {
    if (!target.page?.faq?.length) continue;
    await upsertContent({
      site,
      collection: target.collection,
      key: target.key,
      data: {
        title: target.title,
        items: target.page.faq,
        sourcePage: target.page.key,
      },
      publish,
    });
    writes.push(`${target.collection}/${target.key}`);
  }

  return writes;
}

async function upsertContent({ site, collection, key, data, publish }) {
  return apiJson(
    `/api/private/sites/${encodeURIComponent(site)}/content/${encodeURIComponent(collection)}/${encodeURIComponent(key)}`,
    {
      method: "PUT",
      private: true,
      body: { data, publish },
    },
  );
}

async function apiJson(pathname, options = {}) {
  const headers = {
    accept: "application/json",
  };

  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  if (options.private) {
    headers.authorization = `Bearer ${await getApiToken()}`;
    headers["x-ai-actor"] = DEFAULT_ACTOR;
  }

  const response = await fetch(`${API_BASE}${pathname}`, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  const payload = text ? safeJson(text) : null;

  if (!response.ok) {
    throw mcpError(-32000, `API request failed with ${response.status}`, payload ?? text);
  }

  return payload;
}

let cachedToken;
async function getApiToken() {
  if (cachedToken) return cachedToken;
  if (process.env.AI_API_TOKEN) {
    cachedToken = process.env.AI_API_TOKEN;
    return cachedToken;
  }

  const envPath = path.join(WORKSPACE_ROOT, "edge", ".dev.vars");
  const raw = await fs.readFile(envPath, "utf8");
  const tokenLine = raw.split(/\r?\n/).find((line) => line.startsWith("AI_API_TOKEN="));
  const token = tokenLine?.slice("AI_API_TOKEN=".length).trim();
  if (!token) throw mcpError(-32000, "Missing AI_API_TOKEN in environment or edge/.dev.vars");
  cachedToken = token;
  return cachedToken;
}

function parseContentMarkdown(markdown) {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const matches = [...normalized.matchAll(/^# (.+)$/gm)];

  return matches.map((match, index) => {
    const title = match[1].trim();
    const start = match.index + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : normalized.length;
    const body = normalized.slice(start, end).trim();
    const slug = readMeta(body, "Slug consigliato") || `/${slugify(title)}`;
    const key = slugToKey(slug, title);
    const meta = {
      title: readMeta(body, "Meta title"),
      description: readMeta(body, "Meta description"),
      keywordPrimary: readMeta(body, "Keyword primaria"),
      keywordSecondary: splitCsv(readMeta(body, "Keyword secondarie")),
      searchIntent: readMeta(body, "Intento di ricerca"),
      entities: splitCsv(readMeta(body, "Entity principali")),
      schemaOrg: parseSchema(readMeta(body, "Schema.org consigliato")),
      internalLinks: readMeta(body, "Internal linking suggerito"),
      anchors: splitCsv(readMeta(body, "Anchor text suggerite")),
    };
    const h1 = firstParagraph(readSection(body, "H1"));
    const intro = paragraphs(readSection(body, "Introduzione"));
    const sections = parseSections(body);
    const cta = firstParagraph(readSection(body, "CTA"));
    const faq = parseFaq(readSection(body, "FAQ"));

    return {
      key,
      title,
      slug,
      meta,
      h1,
      intro,
      sections,
      cta,
      faq,
      blocks: buildBlocks({ h1, intro, sections, cta, faq }),
      rawMarkdown: body,
    };
  });
}

function buildBlocks(page) {
  const blocks = [];

  if (page.h1 || page.intro.length) {
    blocks.push({
      type: "hero",
      title: page.h1,
      intro: page.intro,
    });
  }

  for (const section of page.sections) {
    blocks.push({
      type: "text",
      title: section.title,
      paragraphs: section.paragraphs,
      subsections: section.subsections,
    });
  }

  if (page.faq.length) {
    blocks.push({
      type: "faq",
      title: "FAQ",
      items: page.faq,
    });
  }

  if (page.cta) {
    blocks.push({
      type: "cta",
      text: page.cta,
    });
  }

  return blocks;
}

function parseSections(body) {
  const excluded = new Set(["h1", "introduzione", "cta", "faq"]);
  const sections = splitSections(body)
    .filter((section) => !excluded.has(section.title.toLowerCase()))
    .map((section) => ({
      title: section.title,
      paragraphs: paragraphs(removeH3Blocks(section.content)),
      subsections: parseH3(section.content),
    }));

  return sections.filter((section) => section.paragraphs.length || section.subsections.length);
}

function splitSections(body) {
  const matches = [...body.matchAll(/^## (.+)$/gm)];
  return matches.map((match, index) => {
    const start = match.index + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : body.length;
    return {
      title: match[1].trim(),
      content: body.slice(start, end).trim(),
    };
  });
}

function readSection(body, title) {
  const section = splitSections(body).find((item) => item.title.toLowerCase() === title.toLowerCase());
  return section?.content ?? "";
}

function parseH3(content) {
  const matches = [...content.matchAll(/^### (.+)$/gm)];
  return matches.map((match, index) => {
    const start = match.index + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : content.length;
    return {
      title: match[1].trim(),
      paragraphs: paragraphs(content.slice(start, end)),
    };
  });
}

function removeH3Blocks(content) {
  const firstH3 = content.search(/^### /m);
  return firstH3 === -1 ? content : content.slice(0, firstH3);
}

function parseFaq(content) {
  return parseH3(content).map((item) => ({
    question: item.title,
    answer: item.paragraphs.join("\n\n"),
  }));
}

function readMeta(body, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = body.match(new RegExp(`^\\*\\*${escaped}:\\*\\*\\s*(.+)$`, "mi"));
  const value = match?.[1]?.trim();
  if (!value) return null;
  return value.replace(/^`(.+)`$/, "$1").trim();
}

function splitCsv(value) {
  if (!value) return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseSchema(value) {
  if (!value) return [];
  return [...value.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

function paragraphs(value) {
  return value
    .split(/\n{2,}/)
    .map((item) => item.replace(/\n/g, " ").trim())
    .filter(Boolean);
}

function firstParagraph(value) {
  if (Array.isArray(value)) return value[0] ?? "";
  return paragraphs(String(value ?? ""))[0] ?? "";
}

function joinParagraphs(value, limit) {
  return (Array.isArray(value) ? value : paragraphs(String(value ?? ""))).slice(0, limit).join("\n\n");
}

function slugToKey(slug, fallbackTitle) {
  const clean = slug.replace(/^\/+|\/+$/g, "");
  if (!clean) return "home";
  return slugify(clean.replace(/\//g, "-")) || slugify(fallbackTitle);
}

function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveWorkspacePath(inputPath) {
  const resolved = path.resolve(WORKSPACE_ROOT, inputPath);
  if (!resolved.startsWith(`${WORKSPACE_ROOT}${path.sep}`) && resolved !== WORKSPACE_ROOT) {
    throw mcpError(-32602, `Path is outside workspace: ${inputPath}`);
  }
  return resolved;
}

function requiredString(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw mcpError(-32602, `Missing or invalid ${name}`);
  }
  return value.trim();
}

function requiredObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw mcpError(-32602, `Missing or invalid ${name}`);
  }
  return value;
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toolResult(result) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
    structuredContent: result,
    isError: false,
  };
}

function mcpError(code, message, data) {
  const error = new Error(message);
  error.code = code;
  error.data = data;
  return error;
}

function send(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function sendError(id, code, message, data) {
  send({
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  });
}
