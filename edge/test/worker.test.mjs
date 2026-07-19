import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker from "../src/index.mjs";

const API_TOKEN = "test-token";
const USER_TOKEN = "lz_test_user_token";
const OAUTH_CLIENT_ID = "chatgpt-lorenzo-dev";
const OAUTH_PASSWORD = "test-lorenzo-password";
const OAUTH_REDIRECT_URI = "https://chatgpt.com/connector/oauth/test-callback";
const OAUTH_RESOURCE = "https://api.lorenzozanna.com/mcp";

test("GET /api/health returns the current service status", async () => {
  const response = await fetchWorker("/api/health");
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload, {
    status: "ok",
    service: "lorenzozanna-edge",
  });
});

test("GET / advertises the deployable MCP and dynamic page surface", async () => {
  const response = await fetchWorker("/");
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.name, "lorenzozanna-edge");
  assert.equal(payload.status, "ok");
  assert.ok(payload.routes.includes("/mcp"));
  assert.ok(payload.routes.includes("/"));
  assert.ok(payload.routes.includes("/index.html"));
  assert.ok(payload.routes.includes("/portfolio"));
  assert.ok(payload.routes.includes("/portfolio.html"));
  assert.ok(payload.routes.includes("/about"));
  assert.ok(payload.routes.includes("/about.html"));
  assert.ok(payload.routes.includes("/contact"));
  assert.ok(payload.routes.includes("/contact.html"));
  assert.deepEqual(payload.capabilities, {
    publicApi: true,
    privateApi: true,
    remoteMcp: true,
    dynamicPages: ["home", "chi-sono", "portfolio", "contatti"],
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
  assert.match(html, /<h1[^>]*>Portfolio fotografico<\/h1>/);
  assert.match(html, /data-section-id="faq"/);
  assert.match(html, /Domande frequenti/);
});

test("HEAD /portfolio returns dynamic HTML headers without a response body", async () => {
  const db = createSeededDb();
  const response = await fetchWorker("/portfolio", {
    db,
    host: "ph.lorenzozanna.com",
    method: "HEAD",
  });
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.equal(body, "");
});

test("GET / on a public site host renders the dynamic home page, not the API manifest", async () => {
  const db = createSeededDb();
  const response = await fetchWorker("/", {
    db,
    host: "ph.lorenzozanna.com",
  });
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  assert.match(html, /<h1[^>]*>Lorenzo Zanna Photography<\/h1>/);
  assert.doesNotMatch(html, /"lorenzozanna-edge"/);
});

test("public pages do not set cookies or use persistent browser storage", async () => {
  for (const pathname of ["/", "/portfolio", "/about", "/contact"]) {
    const db = createSeededDb();
    const response = await fetchWorker(pathname, {
      db,
      host: "ph.lorenzozanna.com",
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.has("set-cookie"), false);
  }

  const mainJs = await readFile(new URL("../../assets/js/main.js", import.meta.url), "utf8");
  assert.doesNotMatch(mainJs, /document\.cookie|localStorage|sessionStorage|indexedDB|sendBeacon|gtag|analytics/i);
});

test("GET /index.html and /index.php redirect to the canonical home", async () => {
  for (const pathname of ["/index.html", "/index.php"]) {
    const db = createSeededDb();
    const response = await fetchWorker(pathname, {
      db,
      host: "ph.lorenzozanna.com",
    });

    assert.equal(response.status, 301);
    assert.equal(response.headers.get("location"), "https://ph.lorenzozanna.com/");
  }
});

test("GET legacy .html page aliases redirect to canonical page URLs", async () => {
  for (const [pathname, location] of [
    ["/portfolio.html", "https://ph.lorenzozanna.com/portfolio"],
    ["/about.html", "https://ph.lorenzozanna.com/about"],
    ["/contact.html", "https://ph.lorenzozanna.com/contact"],
  ]) {
    const db = createSeededDb();
    const response = await fetchWorker(pathname, {
      db,
      host: "ph.lorenzozanna.com",
    });

    assert.equal(response.status, 301);
    assert.equal(response.headers.get("location"), location);
  }
});

test("GET /sitemap.xml lists canonical public page URLs", async () => {
  const db = createSeededDb();
  const response = await fetchWorker("/sitemap.xml", {
    db,
    host: "ph.lorenzozanna.com",
  });
  const xml = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/xml/);
  assert.match(xml, /<loc>https:\/\/ph\.lorenzozanna\.com\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/ph\.lorenzozanna\.com\/portfolio<\/loc>/);
  assert.match(xml, /<loc>https:\/\/ph\.lorenzozanna\.com\/about<\/loc>/);
  assert.match(xml, /<loc>https:\/\/ph\.lorenzozanna\.com\/contact<\/loc>/);
  assert.doesNotMatch(xml, /index\.html|index\.php/);
});

test("GET /robots.txt allows indexing and points to the sitemap", async () => {
  const db = createSeededDb();
  const response = await fetchWorker("/robots.txt", {
    db,
    host: "ph.lorenzozanna.com",
  });
  const text = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/plain/);
  assert.match(text, /User-agent: \*/);
  assert.match(text, /Allow: \//);
  assert.match(text, /Sitemap: https:\/\/ph\.lorenzozanna\.com\/sitemap\.xml/);
});

test("GET /about maps to the published chi-sono page", async () => {
  for (const pathname of ["/about"]) {
    const db = createSeededDb();
    const response = await fetchWorker(pathname, {
      db,
      host: "ph.lorenzozanna.com",
    });
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /<h1[^>]*>Chi è Lorenzo Zanna<\/h1>/);
  }
});

test("GET /contact maps to the published contatti page", async () => {
  for (const pathname of ["/contact"]) {
    const db = createSeededDb();
    const response = await fetchWorker(pathname, {
      db,
      host: "ph.lorenzozanna.com",
    });
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /<h1[^>]*>Contatti<\/h1>/);
  }
});

test("GET /portfolio?site=ph renders through the current API worker route", async () => {
  const db = createSeededDb();
  const response = await fetchWorker("/portfolio?site=ph", { db });
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /<h1[^>]*>Portfolio fotografico<\/h1>/);
});

test("GET /portfolio reports a clear error before the dynamic D1 schema is migrated", async () => {
  const response = await fetchWorker("/portfolio?site=ph", {
    db: createMissingPagesSchemaDb(),
  });
  const payload = await response.json();

  assert.equal(response.status, 503);
  assert.equal(payload.error, "dynamic_schema_not_ready");
});

test("GET /.well-known/oauth-protected-resource publishes MCP resource metadata", async () => {
  const response = await fetchWorker("/.well-known/oauth-protected-resource", {
    host: "api.lorenzozanna.com",
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(payload.resource, "https://api.lorenzozanna.com/mcp");
  assert.deepEqual(payload.authorization_servers, ["https://api.lorenzozanna.com"]);
  assert.deepEqual(payload.scopes_supported, ["content:read", "content:write", "content:publish"]);
  assert.equal(payload.bearer_methods_supported.includes("header"), true);
});

test("GET /.well-known/oauth-authorization-server publishes OAuth discovery metadata", async () => {
  const response = await fetchWorker("/.well-known/oauth-authorization-server", {
    host: "api.lorenzozanna.com",
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.issuer, "https://api.lorenzozanna.com");
  assert.equal(payload.authorization_endpoint, "https://api.lorenzozanna.com/oauth/authorize");
  assert.equal(payload.token_endpoint, "https://api.lorenzozanna.com/oauth/token");
  assert.deepEqual(payload.response_types_supported, ["code"]);
  assert.deepEqual(payload.code_challenge_methods_supported, ["S256"]);
  assert.deepEqual(payload.scopes_supported, ["content:read", "content:write", "content:publish"]);
});

test("GET /oauth/authorize renders the Lorenzo login and consent page for a valid ChatGPT client", async () => {
  const verifier = "test-verifier-for-chatgpt-oauth-flow";
  const challenge = await pkceChallenge(verifier);
  const response = await fetchWorker(`/oauth/authorize?${oauthAuthorizeParams(challenge)}`, {
    host: "api.lorenzozanna.com",
  });
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  assert.match(html, /Lorenzo Zanna Site Editor/);
  assert.match(html, /name="client_id" value="chatgpt-lorenzo-dev"/);
  assert.match(html, /name="code_challenge"/);
});

test("OAuth authorization-code flow issues a PKCE-bound token accepted by MCP", async () => {
  const db = createSeededDb();
  const verifier = "test-verifier-for-chatgpt-oauth-flow";
  const challenge = await pkceChallenge(verifier);

  const authorizeResponse = await fetchWorker("/oauth/authorize", {
    db,
    host: "api.lorenzozanna.com",
    method: "POST",
    form: {
      ...oauthAuthorizeForm(challenge),
      username: "lorenzo",
      password: OAUTH_PASSWORD,
    },
  });
  const location = authorizeResponse.headers.get("location");
  const redirected = new URL(location);
  const code = redirected.searchParams.get("code");

  assert.equal(authorizeResponse.status, 302);
  assert.equal(redirected.origin + redirected.pathname, OAUTH_REDIRECT_URI);
  assert.equal(redirected.searchParams.get("state"), "state-123");
  assert.match(code, /^oc_/);
  assert.equal(db.oauthAuthorizationCodes.length, 1);
  assert.equal(db.oauthAuthorizationCodes[0].code_hash.length, 64);
  assert.notEqual(db.oauthAuthorizationCodes[0].code_hash, code);
  assert.equal(db.oauthAuthorizationCodes[0].client_id, OAUTH_CLIENT_ID);
  assert.equal(db.oauthAuthorizationCodes[0].resource, OAUTH_RESOURCE);

  const tokenResponse = await fetchWorker("/oauth/token", {
    db,
    host: "api.lorenzozanna.com",
    method: "POST",
    form: {
      grant_type: "authorization_code",
      client_id: OAUTH_CLIENT_ID,
      code,
      redirect_uri: OAUTH_REDIRECT_URI,
      code_verifier: verifier,
      resource: OAUTH_RESOURCE,
    },
  });
  const tokenPayload = await tokenResponse.json();

  assert.equal(tokenResponse.status, 200);
  assert.equal(tokenPayload.token_type, "Bearer");
  assert.equal(tokenPayload.expires_in, 3600);
  assert.equal(tokenPayload.scope, "content:read content:write");
  assert.match(tokenPayload.access_token, /^oat_/);
  assert.equal(db.oauthAuthorizationCodes[0].used_at, "2026-07-13 00:00:01");
  assert.equal(db.oauthAccessTokens.length, 1);
  assert.equal(db.oauthAccessTokens[0].token_hash.length, 64);
  assert.notEqual(db.oauthAccessTokens[0].token_hash, tokenPayload.access_token);

  const mcpResponse = await fetchWorker("/mcp", {
    db,
    host: "api.lorenzozanna.com",
    method: "POST",
    bearerToken: tokenPayload.access_token,
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "get_page",
        arguments: {
          site: "ph",
          page: "portfolio",
        },
      },
    },
  });
  const mcpPayload = await mcpResponse.json();

  assert.equal(mcpResponse.status, 200);
  assert.equal(mcpPayload.result.structuredContent.page, "portfolio");
  assert.equal(db.oauthAccessTokens[0].last_used_at, "2026-07-13 00:00:01");
});

test("POST /oauth/token rejects an authorization code with a wrong PKCE verifier", async () => {
  const db = createSeededDb();
  const verifier = "test-verifier-for-chatgpt-oauth-flow";
  const challenge = await pkceChallenge(verifier);

  const authorizeResponse = await fetchWorker("/oauth/authorize", {
    db,
    host: "api.lorenzozanna.com",
    method: "POST",
    form: {
      ...oauthAuthorizeForm(challenge),
      username: "lorenzo",
      password: OAUTH_PASSWORD,
    },
  });
  const code = new URL(authorizeResponse.headers.get("location")).searchParams.get("code");

  const tokenResponse = await fetchWorker("/oauth/token", {
    db,
    host: "api.lorenzozanna.com",
    method: "POST",
    form: {
      grant_type: "authorization_code",
      client_id: OAUTH_CLIENT_ID,
      code,
      redirect_uri: OAUTH_REDIRECT_URI,
      code_verifier: "wrong-verifier",
      resource: OAUTH_RESOURCE,
    },
  });
  const tokenPayload = await tokenResponse.json();

  assert.equal(tokenResponse.status, 400);
  assert.equal(tokenPayload.error, "invalid_grant");
  assert.equal(db.oauthAccessTokens.length, 0);
});

test("POST /mcp is reachable through the current API worker route", async () => {
  const response = await fetchWorker("/mcp", {
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
  assert.match(
    response.headers.get("www-authenticate"),
    /^Bearer resource_metadata="https:\/\/api\.lorenzozanna\.com\/\.well-known\/oauth-protected-resource"/,
  );
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
  assert.match(
    response.headers.get("www-authenticate"),
    /^Bearer resource_metadata="https:\/\/mcp\.lorenzozanna\.com\/\.well-known\/oauth-protected-resource"/,
  );
});

test("POST /mcp accepts active scoped user tokens", async () => {
  const db = createSeededDb({
    authTokens: [
      await scopedAuthToken({
        token: USER_TOKEN,
        actor: "lorenzo",
        role: "owner",
        scopes: ["content:read", "content:write", "content:publish"],
      }),
    ],
  });
  const response = await fetchWorker("/mcp", {
    db,
    host: "mcp.lorenzozanna.com",
    method: "POST",
    bearerToken: USER_TOKEN,
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
    },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.result.serverInfo.name, "lorenzozanna-content");
  assert.equal(db.authTokens[0].last_used_at, "2026-07-13 00:00:01");
});

test("POST /mcp rejects revoked scoped user tokens", async () => {
  const db = createSeededDb({
    authTokens: [
      await scopedAuthToken({
        token: USER_TOKEN,
        actor: "lorenzo",
        role: "owner",
        scopes: ["content:read", "content:write"],
        status: "revoked",
      }),
    ],
  });
  const response = await fetchWorker("/mcp", {
    db,
    host: "mcp.lorenzozanna.com",
    method: "POST",
    bearerToken: USER_TOKEN,
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
    },
  });
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload.error, "unauthorized");
  assert.equal(payload.message, "MCP token is revoked.");
  assert.match(response.headers.get("www-authenticate"), /error="invalid_token"/);
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

test("POST /mcp tools/list exposes page read and section visibility tools", async () => {
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
  const getPage = payload.result.tools.find((tool) => tool.name === "get_page");
  const listMediaAssets = payload.result.tools.find((tool) => tool.name === "list_media_assets");
  const createImageUpload = payload.result.tools.find((tool) => tool.name === "create_image_upload");
  const updateText = payload.result.tools.find((tool) => tool.name === "update_text");
  const updateContactChannel = payload.result.tools.find((tool) => tool.name === "update_contact_channel");
  const replaceImage = payload.result.tools.find((tool) => tool.name === "replace_image");
  const setImageFocalPoint = payload.result.tools.find((tool) => tool.name === "set_image_focal_point");

  assert.equal(response.status, 200);
  assert.equal(payload.jsonrpc, "2.0");
  assert.deepEqual(toolNames, [
    "get_page",
    "list_section_presets",
    "list_changes",
    "list_media_assets",
    "disable_section",
    "enable_section",
    "add_section_from_preset",
    "add_faq_section",
    "add_faq_item",
    "update_faq_item",
    "remove_faq_item",
    "reorder_faq_items",
    "add_text_subsection",
    "update_text",
    "update_cta",
    "update_contact_channel",
    "create_image_upload",
    "confirm_image_upload",
    "update_image_alt",
    "replace_image",
    "set_image_focal_point",
    "update_rich_text",
    "rollback_change",
  ]);
  assert.deepEqual(getPage.securitySchemes, [{ type: "oauth2", scopes: ["content:read"] }]);
  assert.deepEqual(listMediaAssets.securitySchemes, [{ type: "oauth2", scopes: ["content:read"] }]);
  assert.deepEqual(updateText.securitySchemes, [{ type: "oauth2", scopes: ["content:write"] }]);
  assert.deepEqual(updateContactChannel.securitySchemes, [{ type: "oauth2", scopes: ["content:write"] }]);
  assert.deepEqual(createImageUpload.securitySchemes, [{ type: "oauth2", scopes: ["content:write"] }]);
  assert.deepEqual(replaceImage.securitySchemes, [{ type: "oauth2", scopes: ["content:write"] }]);
  assert.deepEqual(setImageFocalPoint.securitySchemes, [{ type: "oauth2", scopes: ["content:write"] }]);
  assert.deepEqual(updateContactChannel.inputSchema.properties.channel.enum, ["email", "instagram", "telefono"]);
  assert.equal(updateContactChannel.inputSchema.properties.href.type, "string");
  assert.equal(replaceImage.inputSchema.properties.assetId.type, "string");
  assert.equal(setImageFocalPoint.inputSchema.properties.x.minimum, 0);
  assert.equal(setImageFocalPoint.inputSchema.properties.y.maximum, 100);
  assert.equal(createImageUpload.inputSchema.properties.mimeType.enum.includes("image/jpeg"), true);
});

test("POST /mcp tools/call list_section_presets allows viewer scoped user tokens", async () => {
  const db = createSeededDb({
    authTokens: [
      await scopedAuthToken({
        token: USER_TOKEN,
        actor: "lorenzo",
        role: "viewer",
        scopes: ["content:read"],
      }),
    ],
  });
  const response = await fetchWorker("/mcp", {
    db,
    host: "mcp.lorenzozanna.com",
    method: "POST",
    bearerToken: USER_TOKEN,
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "list_section_presets",
        arguments: {
          site: "ph",
        },
      },
    },
  });
  const payload = await response.json();
  const presets = payload.result.structuredContent.presets;

  assert.equal(response.status, 200);
  assert.deepEqual(presets.map((preset) => preset.id), ["faq", "text", "cta", "gallery", "image_text"]);
  assert.equal(presets.find((preset) => preset.id === "faq").styleContract, "common.faq");
  assert.equal(db.authTokens[0].last_used_at, "2026-07-13 00:00:01");
});

test("POST /mcp tools/call get_page returns sections with style contracts and editable fields", async () => {
  const response = await fetchWorker("/mcp", {
    host: "mcp.lorenzozanna.com",
    method: "POST",
    privateAuth: true,
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "get_page",
        arguments: {
          site: "ph",
          page: "portfolio",
        },
      },
    },
  });
  const payload = await response.json();
  const page = payload.result.structuredContent;
  const hero = page.sections.find((section) => section.sectionId === "hero");
  const faq = page.sections.find((section) => section.sectionId === "faq");

  assert.equal(response.status, 200);
  assert.equal(page.site, "ph");
  assert.equal(page.page, "portfolio");
  assert.equal(page.title, "Portfolio fotografico");
  assert.equal(hero.styleContract, "portfolio.page_hero");
  assert.equal(hero.enabled, true);
  assert.equal(hero.data.title, "Portfolio fotografico");
  assert.deepEqual(
    hero.editableFields.map((field) => field.path),
    ["eyebrow", "title", "intro"],
  );
  assert.equal(hero.editableFields.find((field) => field.path === "intro").kind, "rich_text");
  assert.equal(faq.styleContract, "common.faq");
  assert.equal(faq.editableFields.find((field) => field.path === "items[].answer").kind, "rich_text");
});

test("POST /mcp tools/call list_media_assets allows viewer scoped user tokens", async () => {
  const db = createSeededDb({
    authTokens: [
      await scopedAuthToken({
        token: USER_TOKEN,
        actor: "lorenzo",
        role: "viewer",
        scopes: ["content:read"],
      }),
    ],
    mediaAssets: [
      mediaAsset({
        id: "asset_ready_portrait",
        public_url: "assets/images/media/portrait.jpg",
        alt: "Ritratto dalla libreria media",
        status: "ready",
      }),
      mediaAsset({
        id: "asset_draft",
        public_url: "assets/images/media/draft.jpg",
        alt: "Bozza",
        status: "draft",
      }),
    ],
  });
  const response = await fetchWorker("/mcp", {
    db,
    host: "mcp.lorenzozanna.com",
    method: "POST",
    bearerToken: USER_TOKEN,
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "list_media_assets",
        arguments: {
          site: "ph",
        },
      },
    },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(
    payload.result.structuredContent.assets.map((asset) => asset.id),
    ["asset_ready_portrait"],
  );
  assert.equal(payload.result.structuredContent.assets[0].publicUrl, "assets/images/media/portrait.jpg");
  assert.equal(db.authTokens[0].last_used_at, "2026-07-13 00:00:01");
});

test("POST /mcp tools/call get_page exposes contact-band as a contact contract", async () => {
  const response = await fetchWorker("/mcp", {
    host: "mcp.lorenzozanna.com",
    method: "POST",
    privateAuth: true,
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "get_page",
        arguments: {
          site: "ph",
          page: "contatti",
        },
      },
    },
  });
  const payload = await response.json();
  const page = payload.result.structuredContent;
  const contactBand = page.sections.find((section) => section.sectionId === "contact-band");

  assert.equal(response.status, 200);
  assert.equal(page.page, "contatti");
  assert.equal(contactBand.styleContract, "contact.band");
  assert.equal(contactBand.enabled, true);
  assert.deepEqual(
    contactBand.editableFields.map((field) => field.path),
    ["channels[].label", "channels[].value", "channels[].href", "channels[].enabled"],
  );
  assert.equal(contactBand.editableFields.find((field) => field.path === "channels[].href").nullable, true);
  assert.equal(contactBand.data.channels[0].label, "Email");
});

test("POST /mcp tools/call update_contact_channel edits and hides contact channels", async () => {
  const db = await createEditorDb();
  const response = await fetchWorker("/mcp", {
    db,
    host: "mcp.lorenzozanna.com",
    method: "POST",
    bearerToken: USER_TOKEN,
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "update_contact_channel",
        arguments: {
          site: "ph",
          page: "contatti",
          channel: "telefono",
          enabled: false,
        },
      },
    },
  });
  const payload = await response.json();
  const contactBand = db.pageSections.find((section) => section.section_key === "contact-band");

  assert.equal(response.status, 200);
  assert.equal(payload.result.structuredContent.sectionId, "contact-band");
  assert.equal(payload.result.structuredContent.channel.label, "Telefono");
  assert.equal(payload.result.structuredContent.channel.enabled, false);
  assert.equal(JSON.parse(contactBand.data).channels[2].enabled, false);
  assert.equal(db.sectionRevisions[0].action, "update_contact_channel");
  assert.equal(db.changeLog[0].target, "pages/contatti/sections/contact-band/channels[2]");
});

test("POST /mcp tools/call create_image_upload creates a pending media upload", async () => {
  const db = await createEditorDb();
  const response = await fetchWorker("/mcp", {
    db,
    host: "mcp.lorenzozanna.com",
    method: "POST",
    bearerToken: USER_TOKEN,
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "create_image_upload",
        arguments: {
          site: "ph",
          filename: "Nuovo Ritratto.JPG",
          mimeType: "image/jpeg",
          sizeBytes: 456789,
          width: 1800,
          height: 1200,
          alt: "Ritratto caricato via MCP",
        },
      },
    },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.result.structuredContent.upload.status, "pending");
  assert.match(payload.result.structuredContent.upload.uploadToken, /^mu_/);
  assert.equal(payload.result.structuredContent.asset.status, "draft");
  assert.equal(db.mediaUploads.length, 1);
  assert.equal(db.mediaAssets.find((asset) => asset.id === payload.result.structuredContent.asset.id).status, "draft");
  assert.equal(db.changeLog[0].action, "create_image_upload");
});

test("POST /mcp tools/call confirm_image_upload promotes an uploaded object to ready media", async () => {
  const db = await createEditorDb();
  const createResponse = await fetchWorker("/mcp", {
    db,
    host: "mcp.lorenzozanna.com",
    method: "POST",
    bearerToken: USER_TOKEN,
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "create_image_upload",
        arguments: {
          site: "ph",
          filename: "ritratto.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 456789,
          width: 1800,
          height: 1200,
          alt: "Ritratto caricato via MCP",
        },
      },
    },
  });
  const created = (await createResponse.json()).result.structuredContent;
  db.changeLog = [];

  const response = await fetchWorker("/mcp", {
    db,
    mediaBucket: new FakeMediaBucket({
      [created.upload.r2Key]: {
        size: 456789,
        contentType: "image/jpeg",
      },
    }),
    host: "mcp.lorenzozanna.com",
    method: "POST",
    bearerToken: USER_TOKEN,
    body: {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "confirm_image_upload",
        arguments: {
          site: "ph",
          uploadId: created.upload.id,
        },
      },
    },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.result.structuredContent.upload.status, "uploaded");
  assert.equal(payload.result.structuredContent.asset.status, "ready");
  assert.equal(db.mediaUploads[0].status, "uploaded");
  assert.equal(db.mediaAssets.find((asset) => asset.id === created.asset.id).status, "ready");
  assert.equal(db.changeLog[0].action, "confirm_image_upload");
});

test("PUT /media/uploads/:uploadId stores an image object in R2 using the upload token", async () => {
  const db = await createEditorDb();
  const createResponse = await fetchWorker("/mcp", {
    db,
    host: "mcp.lorenzozanna.com",
    method: "POST",
    bearerToken: USER_TOKEN,
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "create_image_upload",
        arguments: {
          site: "ph",
          filename: "ritratto.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 5,
          width: 1800,
          height: 1200,
          alt: "Ritratto caricato via endpoint",
        },
      },
    },
  });
  const created = (await createResponse.json()).result.structuredContent;
  const bucket = new FakeMediaBucket({});

  const response = await fetchWorker(created.upload.uploadUrl, {
    db,
    mediaBucket: bucket,
    host: "api.lorenzozanna.com",
    method: "PUT",
    bearerToken: created.upload.uploadToken,
    headers: {
      "content-type": "image/jpeg",
      "content-length": "5",
    },
    rawBody: new Uint8Array([1, 2, 3, 4, 5]),
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.uploadId, created.upload.id);
  assert.equal(payload.status, "stored");
  assert.equal(payload.r2Key, created.upload.r2Key);
  assert.equal(bucket.puts.length, 1);
  assert.equal(bucket.puts[0].key, created.upload.r2Key);
  assert.equal(bucket.puts[0].body.byteLength, 5);
  assert.equal(bucket.puts[0].options.httpMetadata.contentType, "image/jpeg");
});

test("PUT /media/uploads/:uploadId rejects invalid tokens and invalid image payloads", async () => {
  const db = await createEditorDb();
  const createResponse = await fetchWorker("/mcp", {
    db,
    host: "mcp.lorenzozanna.com",
    method: "POST",
    bearerToken: USER_TOKEN,
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "create_image_upload",
        arguments: {
          site: "ph",
          filename: "ritratto.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 5,
          width: 1800,
          height: 1200,
          alt: "Ritratto caricato via endpoint",
        },
      },
    },
  });
  const created = (await createResponse.json()).result.structuredContent;

  const badToken = await fetchWorker(created.upload.uploadUrl, {
    db,
    mediaBucket: new FakeMediaBucket({}),
    host: "api.lorenzozanna.com",
    method: "PUT",
    bearerToken: "mu_wrong",
    headers: {
      "content-type": "image/jpeg",
      "content-length": "5",
    },
    rawBody: new Uint8Array([1, 2, 3, 4, 5]),
  });
  const badTokenPayload = await badToken.json();

  assert.equal(badToken.status, 401);
  assert.equal(badTokenPayload.error, "invalid_upload_token");

  const badType = await fetchWorker(created.upload.uploadUrl, {
    db,
    mediaBucket: new FakeMediaBucket({}),
    host: "api.lorenzozanna.com",
    method: "PUT",
    bearerToken: created.upload.uploadToken,
    headers: {
      "content-type": "image/png",
      "content-length": "5",
    },
    rawBody: new Uint8Array([1, 2, 3, 4, 5]),
  });
  const badTypePayload = await badType.json();

  assert.equal(badType.status, 415);
  assert.equal(badTypePayload.error, "invalid_content_type");

  const badSize = await fetchWorker(created.upload.uploadUrl, {
    db,
    mediaBucket: new FakeMediaBucket({}),
    host: "api.lorenzozanna.com",
    method: "PUT",
    bearerToken: created.upload.uploadToken,
    headers: {
      "content-type": "image/jpeg",
      "content-length": "6",
    },
    rawBody: new Uint8Array([1, 2, 3, 4, 5, 6]),
  });
  const badSizePayload = await badSize.json();

  assert.equal(badSize.status, 413);
  assert.equal(badSizePayload.error, "invalid_upload_size");
});

test("PUT /media/uploads/:uploadId rejects expired upload sessions", async () => {
  const db = await createEditorDb();
  const mediaBucket = new FakeMediaBucket({});
  const createResponse = await fetchWorker("/mcp", {
    db,
    host: "mcp.lorenzozanna.com",
    method: "POST",
    bearerToken: USER_TOKEN,
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "create_image_upload",
        arguments: {
          site: "ph",
          filename: "expired.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 5,
          width: 800,
          height: 600,
          alt: "Upload scaduto",
        },
      },
    },
  });
  const created = (await createResponse.json()).result.structuredContent;
  db.mediaUploads[0].expires_at = "2000-01-01T00:00:00.000Z";

  const response = await fetchWorker(created.upload.uploadUrl, {
    db,
    mediaBucket,
    host: "api.lorenzozanna.com",
    method: "PUT",
    bearerToken: created.upload.uploadToken,
    headers: {
      "content-type": "image/jpeg",
      "content-length": "5",
    },
    rawBody: new Uint8Array([1, 2, 3, 4, 5]),
  });
  const payload = await response.json();

  assert.equal(response.status, 410);
  assert.equal(payload.error, "upload_expired");
  assert.equal(mediaBucket.puts.length, 0);
});

test("POST /mcp tools/call replace_image updates a contracted image from the media library", async () => {
  const db = await createEditorDb({
    mediaAssets: [
      mediaAsset({
        id: "asset_ready_portrait",
        public_url: "assets/images/media/portrait.jpg",
        alt: "Ritratto dalla libreria media",
        caption: "Ritratto media",
        status: "ready",
      }),
    ],
  });
  db.pageSections.push(
    pageSection("page_portfolio", "section_portfolio_gallery", "gallery", "gallery", 25, true, {
      items: [
        {
          key: "ritratti",
          title: "Ritratti",
          images: [
            {
              src: "assets/images/old.jpg",
              alt: "Vecchio alt",
              caption: "Vecchia caption",
              variant: "wide",
            },
          ],
        },
      ],
    }),
  );

  const response = await fetchWorker("/mcp", {
    db,
    host: "mcp.lorenzozanna.com",
    method: "POST",
    bearerToken: USER_TOKEN,
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "replace_image",
        arguments: {
          site: "ph",
          page: "portfolio",
          sectionId: "gallery",
          path: "items[0].images[0]",
          assetId: "asset_ready_portrait",
          alt: "Nuovo ritratto dal media manager",
        },
      },
    },
  });
  const payload = await response.json();
  const gallery = db.pageSections.find((section) => section.section_key === "gallery");
  const image = JSON.parse(gallery.data).items[0].images[0];

  assert.equal(response.status, 200);
  assert.equal(payload.result.structuredContent.image.assetId, "asset_ready_portrait");
  assert.equal(payload.result.structuredContent.image.src, "assets/images/media/portrait.jpg");
  assert.equal(image.assetId, "asset_ready_portrait");
  assert.equal(image.alt, "Nuovo ritratto dal media manager");
  assert.equal(db.mediaUsages[0].path, "items[0].images[0]");
  assert.equal(db.sectionRevisions[0].action, "replace_image");
  assert.equal(db.changeLog[0].target, "pages/portfolio/sections/gallery/items[0].images[0]");
});

test("POST /mcp tools/call rollback_change reverts an image replacement and media usage index", async () => {
  const db = await createEditorDb({
    mediaAssets: [
      mediaAsset({
        id: "asset_ready_portrait",
        public_url: "assets/images/media/portrait.jpg",
        alt: "Ritratto dalla libreria media",
        caption: "Ritratto media",
        status: "ready",
      }),
    ],
  });
  db.pageSections.push(
    pageSection("page_portfolio", "section_portfolio_gallery", "gallery", "gallery", 25, true, {
      items: [
        {
          key: "ritratti",
          title: "Ritratti",
          images: [
            {
              src: "assets/images/old.jpg",
              alt: "Vecchio alt",
              caption: "Vecchia caption",
              variant: "wide",
            },
          ],
        },
      ],
    }),
  );

  const replaceResponse = await fetchWorker("/mcp", {
    db,
    host: "mcp.lorenzozanna.com",
    method: "POST",
    bearerToken: USER_TOKEN,
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "replace_image",
        arguments: {
          site: "ph",
          page: "portfolio",
          sectionId: "gallery",
          path: "items[0].images[0]",
          assetId: "asset_ready_portrait",
          alt: "Nuovo ritratto dal media manager",
        },
      },
    },
  });
  assert.equal(replaceResponse.status, 200);
  assert.equal(db.mediaUsages.length, 1);

  const rollbackResponse = await fetchWorker("/mcp", {
    db,
    host: "mcp.lorenzozanna.com",
    method: "POST",
    bearerToken: USER_TOKEN,
    body: {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "rollback_change",
        arguments: {
          site: "ph",
          changeId: db.changeLog[0].id,
        },
      },
    },
  });
  const payload = await rollbackResponse.json();
  const gallery = db.pageSections.find((section) => section.section_key === "gallery");
  const image = JSON.parse(gallery.data).items[0].images[0];

  assert.equal(rollbackResponse.status, 200);
  assert.equal(payload.result.structuredContent.rolledBackAction, "replace_image");
  assert.equal(image.assetId, undefined);
  assert.equal(image.src, "assets/images/old.jpg");
  assert.equal(image.alt, "Vecchio alt");
  assert.equal(db.mediaUsages.length, 0);
  assert.equal(db.sectionRevisions[1].action, "rollback_change");
  assert.equal(db.changeLog[1].action, "rollback_change");
});

test("POST /mcp tools/call set_image_focal_point updates a contracted image", async () => {
  const db = await createEditorDb();
  db.pageSections.push(
    pageSection("page_portfolio", "section_portfolio_gallery", "gallery", "gallery", 25, true, {
      items: [
        {
          key: "ritratti",
          title: "Ritratti",
          images: [
            {
              src: "assets/images/old.jpg",
              alt: "Vecchio alt",
              caption: "Vecchia caption",
              variant: "wide",
            },
          ],
        },
      ],
    }),
  );

  const response = await fetchWorker("/mcp", {
    db,
    host: "mcp.lorenzozanna.com",
    method: "POST",
    bearerToken: USER_TOKEN,
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "set_image_focal_point",
        arguments: {
          site: "ph",
          page: "portfolio",
          sectionId: "gallery",
          path: "items[0].images[0]",
          x: 35,
          y: 42,
        },
      },
    },
  });
  const payload = await response.json();
  const gallery = db.pageSections.find((section) => section.section_key === "gallery");
  const image = JSON.parse(gallery.data).items[0].images[0];

  assert.equal(response.status, 200);
  assert.deepEqual(payload.result.structuredContent.focalPoint, { x: 35, y: 42 });
  assert.deepEqual(image.focalPoint, { x: 35, y: 42 });
  assert.equal(db.sectionRevisions[0].action, "set_image_focal_point");
  assert.equal(db.changeLog[0].target, "pages/portfolio/sections/gallery/items[0].images[0]/focalPoint");
});

test("POST /mcp tools/call get_page allows viewer scoped user tokens", async () => {
  const db = createSeededDb({
    authTokens: [
      await scopedAuthToken({
        token: USER_TOKEN,
        actor: "lorenzo",
        role: "viewer",
        scopes: ["content:read"],
      }),
    ],
  });
  const response = await fetchWorker("/mcp", {
    db,
    host: "mcp.lorenzozanna.com",
    method: "POST",
    bearerToken: USER_TOKEN,
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "get_page",
        arguments: {
          site: "ph",
          page: "portfolio",
        },
      },
    },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.result.structuredContent.page, "portfolio");
  assert.equal(payload.result.structuredContent.sections[0].styleContract, "portfolio.page_hero");
});

test("POST /mcp tools/call list_changes allows viewer tokens and filters section changes", async () => {
  const db = createSeededDb({
    authTokens: [
      await scopedAuthToken({
        token: USER_TOKEN,
        actor: "lorenzo",
        role: "viewer",
        scopes: ["content:read"],
      }),
    ],
  });
  db.changeLog.push(
    changeLogEntry({
      id: "change_home_title",
      action: "update_text",
      target: "pages/home/sections/hero/title",
      createdAt: "2026-07-14 09:00:00",
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
      createdAt: "2026-07-14 10:00:00",
    }),
  );

  const response = await fetchWorker("/mcp", {
    db,
    host: "mcp.lorenzozanna.com",
    method: "POST",
    bearerToken: USER_TOKEN,
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "list_changes",
        arguments: {
          site: "ph",
          page: "portfolio",
          sectionId: "faq",
        },
      },
    },
  });
  const payload = await response.json();
  const changes = payload.result.structuredContent.changes;

  assert.equal(response.status, 200);
  assert.equal(payload.result.structuredContent.site, "ph");
  assert.equal(changes.length, 1);
  assert.equal(changes[0].id, "change_faq_question");
  assert.equal(changes[0].page, "portfolio");
  assert.equal(changes[0].sectionId, "faq");
  assert.equal(changes[0].path, "items[0].question");
  assert.equal(changes[0].before.data.items[0].question, "How?");
});

test("POST /mcp tools/call rejects viewer tokens for write tools", async () => {
  const db = createSeededDb({
    authTokens: [
      await scopedAuthToken({
        token: USER_TOKEN,
        actor: "lorenzo",
        role: "viewer",
        scopes: ["content:read"],
      }),
    ],
  });
  const response = await fetchWorker("/mcp", {
    db,
    host: "mcp.lorenzozanna.com",
    method: "POST",
    bearerToken: USER_TOKEN,
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
  const payload = await response.json();
  const faq = db.pageSections.find((section) => section.section_key === "faq");

  assert.equal(response.status, 200);
  assert.equal(payload.error.code, -32003);
  assert.equal(payload.error.message, "Permission denied for content:write.");
  assert.equal(faq.enabled, 1);
  assert.equal(db.changeLog.length, 0);
});

test("POST /mcp tools/call rejects technical token for content write tools", async () => {
  const db = createSeededDb();
  const response = await fetchWorker("/mcp", {
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
  const payload = await response.json();
  const faq = db.pageSections.find((section) => section.section_key === "faq");

  assert.equal(response.status, 200);
  assert.equal(payload.error.code, -32003);
  assert.equal(payload.error.message, "Permission denied for content:write.");
  assert.equal(faq.enabled, 1);
  assert.equal(db.changeLog.length, 0);
});

test("POST /mcp tools/call disable_section updates D1 and the dynamic portfolio HTML", async () => {
  const db = await createEditorDb();
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
    bearerToken: USER_TOKEN,
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

test("POST /mcp tools/call enable_section updates D1 and the dynamic portfolio HTML", async () => {
  const db = await createEditorDb({
    faqEnabled: false,
  });
  const beforeResponse = await fetchWorker("/portfolio", {
    db,
    host: "ph.lorenzozanna.com",
  });
  const beforeHtml = await beforeResponse.text();
  assert.doesNotMatch(beforeHtml, /data-section-id="faq"/);

  const mcpResponse = await fetchWorker("/mcp", {
    db,
    host: "mcp.lorenzozanna.com",
    method: "POST",
    bearerToken: USER_TOKEN,
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "enable_section",
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
  assert.equal(mcpPayload.result.structuredContent.enabled, true);
  assert.equal(mcpPayload.result.structuredContent.sectionId, "faq");

  const afterResponse = await fetchWorker("/portfolio", {
    db,
    host: "ph.lorenzozanna.com",
  });
  const afterHtml = await afterResponse.text();
  assert.match(afterHtml, /data-section-id="faq"/);
  assert.match(afterHtml, /Domande frequenti/);
  assert.equal(db.sectionRevisions[0].action, "enable_section");
  assert.equal(db.changeLog[0].action, "enable_section");
});

test("POST /mcp tools/call update_text updates D1 and the dynamic portfolio HTML", async () => {
  const db = await createEditorDb();
  const beforeResponse = await fetchWorker("/portfolio", {
    db,
    host: "ph.lorenzozanna.com",
  });
  const beforeHtml = await beforeResponse.text();
  assert.match(beforeHtml, /<h1[^>]*>Portfolio fotografico<\/h1>/);

  const mcpResponse = await fetchWorker("/mcp", {
    db,
    host: "mcp.lorenzozanna.com",
    method: "POST",
    bearerToken: USER_TOKEN,
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "update_text",
        arguments: {
          site: "ph",
          page: "portfolio",
          sectionId: "hero",
          path: "title",
          value: "Portfolio aggiornato",
        },
      },
    },
  });
  const mcpPayload = await mcpResponse.json();

  assert.equal(mcpResponse.status, 200);
  assert.equal(mcpPayload.result.structuredContent.sectionId, "hero");
  assert.equal(mcpPayload.result.structuredContent.path, "title");
  assert.equal(mcpPayload.result.structuredContent.value, "Portfolio aggiornato");

  const afterResponse = await fetchWorker("/portfolio", {
    db,
    host: "ph.lorenzozanna.com",
  });
  const afterHtml = await afterResponse.text();
  assert.match(afterHtml, /<h1[^>]*>Portfolio aggiornato<\/h1>/);
  assert.equal(db.sectionRevisions[0].action, "update_text");
  assert.equal(db.changeLog[0].action, "update_text");
  assert.equal(db.changeLog[0].target, "pages/portfolio/sections/hero/title");
});

test("POST /mcp tools/call update_text can toggle contact channel visibility", async () => {
  const db = await createEditorDb();
  const mcpResponse = await fetchWorker("/mcp", {
    db,
    host: "mcp.lorenzozanna.com",
    method: "POST",
    bearerToken: USER_TOKEN,
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "update_text",
        arguments: {
          site: "ph",
          page: "contatti",
          sectionId: "contact-band",
          path: "channels[2].enabled",
          value: "true",
        },
      },
    },
  });
  const mcpPayload = await mcpResponse.json();
  const contactBand = db.pageSections.find((section) => section.section_key === "contact-band");

  assert.equal(mcpResponse.status, 200);
  assert.equal(mcpPayload.result.structuredContent.value, true);
  assert.equal(JSON.parse(contactBand.data).channels[2].enabled, true);
});

test("POST /mcp tools/call rollback_change reverts a previous text change", async () => {
  const db = await createEditorDb();
  const updateResponse = await fetchWorker("/mcp", {
    db,
    host: "mcp.lorenzozanna.com",
    method: "POST",
    bearerToken: USER_TOKEN,
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "update_text",
        arguments: {
          site: "ph",
          page: "portfolio",
          sectionId: "hero",
          path: "title",
          value: "Portfolio rollback",
        },
      },
    },
  });
  assert.equal(updateResponse.status, 200);
  const changedHtml = await (
    await fetchWorker("/portfolio", {
      db,
      host: "ph.lorenzozanna.com",
    })
  ).text();
  assert.match(changedHtml, /<h1[^>]*>Portfolio rollback<\/h1>/);

  const rollbackResponse = await fetchWorker("/mcp", {
    db,
    host: "mcp.lorenzozanna.com",
    method: "POST",
    bearerToken: USER_TOKEN,
    body: {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "rollback_change",
        arguments: {
          site: "ph",
          changeId: db.changeLog[0].id,
        },
      },
    },
  });
  const rollbackPayload = await rollbackResponse.json();

  assert.equal(rollbackResponse.status, 200);
  assert.equal(rollbackPayload.result.structuredContent.sectionId, "hero");
  assert.equal(rollbackPayload.result.structuredContent.path, "title");
  assert.equal(rollbackPayload.result.structuredContent.rolledBackChangeId, db.changeLog[0].id);

  const restoredHtml = await (
    await fetchWorker("/portfolio", {
      db,
      host: "ph.lorenzozanna.com",
    })
  ).text();
  assert.match(restoredHtml, /<h1[^>]*>Portfolio fotografico<\/h1>/);
  assert.equal(db.sectionRevisions[1].action, "rollback_change");
  assert.equal(db.changeLog[1].action, "rollback_change");
});

test("POST /mcp tools/call add_faq_section creates and renders a FAQ from preset", async () => {
  const db = await createEditorDb({ includeFaq: false });
  const response = await fetchWorker("/mcp", {
    db,
    host: "mcp.lorenzozanna.com",
    method: "POST",
    bearerToken: USER_TOKEN,
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "add_faq_section",
        arguments: {
          site: "ph",
          page: "portfolio",
          title: "Domande frequenti",
          items: [
            {
              question: "Posso richiedere una stampa?",
              answer: "Si, indicando fotografia e formato.",
            },
          ],
        },
      },
    },
  });
  const payload = await response.json();
  const htmlResponse = await fetchWorker("/portfolio?site=ph", {
    db,
    host: "api.lorenzozanna.com",
  });
  const html = await htmlResponse.text();

  assert.equal(response.status, 200);
  assert.equal(payload.result.structuredContent.created, true);
  assert.equal(payload.result.structuredContent.sectionId, "faq");
  assert.equal(db.pageSections.filter((section) => section.section_key === "faq").length, 1);
  assert.match(html, /data-section-id="faq"/);
  assert.match(html, /Posso richiedere una stampa\?/);
  assert.equal(db.changeLog.at(-1).action, "add_faq_section");
});

test("POST /mcp tools/call add_text_subsection adds and renders an editorial item", async () => {
  const db = await createEditorDb();
  const response = await fetchWorker("/mcp", {
    db,
    host: "mcp.lorenzozanna.com",
    method: "POST",
    bearerToken: USER_TOKEN,
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "add_text_subsection",
        arguments: {
          site: "ph",
          page: "portfolio",
          sectionId: "text_2",
          title: "Stampe fine art",
          paragraphs: ["Una voce aggiunta dentro la sezione editoriale live."],
        },
      },
    },
  });
  const payload = await response.json();
  const html = await (
    await fetchWorker("/portfolio", {
      db,
      host: "ph.lorenzozanna.com",
    })
  ).text();

  assert.equal(response.status, 200);
  assert.equal(payload.result.structuredContent.sectionId, "text_2");
  assert.equal(payload.result.structuredContent.itemIndex, 1);
  assert.match(html, /data-section-id="text_2"/);
  assert.match(html, /Stampe fine art/);
  assert.match(html, /Una voce aggiunta dentro la sezione editoriale live\./);
  assert.equal(db.changeLog.at(-1).action, "add_text_subsection");
  assert.equal(db.changeLog.at(-1).target, "pages/portfolio/sections/text_2/subsections[1]");
});

test("POST /mcp tools/call update_cta updates D1 and the dynamic home HTML", async () => {
  const db = await createEditorDb();
  const mcpResponse = await fetchWorker("/mcp", {
    db,
    host: "mcp.lorenzozanna.com",
    method: "POST",
    bearerToken: USER_TOKEN,
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "update_cta",
        arguments: {
          site: "ph",
          page: "home",
          sectionId: "hero",
          path: "primaryCta",
          label: "Vai al portfolio",
          href: "/portfolio.html",
        },
      },
    },
  });
  const mcpPayload = await mcpResponse.json();

  assert.equal(mcpResponse.status, 200);
  assert.equal(mcpPayload.result.structuredContent.path, "primaryCta");
  assert.equal(mcpPayload.result.structuredContent.value.label, "Vai al portfolio");

  const afterResponse = await fetchWorker("/", {
    db,
    host: "ph.lorenzozanna.com",
  });
  const afterHtml = await afterResponse.text();
  assert.match(afterHtml, /<a class="text-link text-link--accent" href="\/portfolio.html">Vai al portfolio<\/a>/);
  assert.equal(db.sectionRevisions[0].action, "update_cta");
  assert.equal(db.changeLog[0].action, "update_cta");
});

test("POST /mcp tools/call update_rich_text updates D1 and renders marks plus links", async () => {
  const db = await createEditorDb();
  const richText = richTextValue([
    [
      { text: "Risposta ", marks: [] },
      { text: "forte", marks: ["bold"] },
      { text: " e ", marks: [] },
      { text: "delicata", marks: ["italic"] },
      { text: " ", marks: [] },
      { text: "qui", marks: [], link: { href: "/portfolio.html" } },
    ],
  ]);

  const mcpResponse = await fetchWorker("/mcp", {
    db,
    host: "mcp.lorenzozanna.com",
    method: "POST",
    bearerToken: USER_TOKEN,
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "update_rich_text",
        arguments: {
          site: "ph",
          page: "portfolio",
          sectionId: "faq",
          path: "items[0].answer",
          value: richText,
        },
      },
    },
  });
  const mcpPayload = await mcpResponse.json();

  assert.equal(mcpResponse.status, 200);
  assert.equal(mcpPayload.result.structuredContent.path, "items[0].answer");
  assert.equal(mcpPayload.result.structuredContent.value.format, "rich_text_v1");

  const afterResponse = await fetchWorker("/portfolio", {
    db,
    host: "ph.lorenzozanna.com",
  });
  const afterHtml = await afterResponse.text();
  assert.match(afterHtml, /Risposta <strong>forte<\/strong> e <em>delicata<\/em> <a href="\/portfolio.html">qui<\/a>/);
  assert.equal(db.sectionRevisions[0].action, "update_rich_text");
  assert.equal(db.changeLog[0].action, "update_rich_text");
});

test("POST /mcp tools/call disable_section logs the actor from a scoped user token", async () => {
  const db = createSeededDb({
    authTokens: [
      await scopedAuthToken({
        token: USER_TOKEN,
        actor: "lorenzo",
        role: "editor",
        scopes: ["content:read", "content:write"],
      }),
    ],
  });

  const mcpResponse = await fetchWorker("/mcp", {
    db,
    host: "mcp.lorenzozanna.com",
    method: "POST",
    bearerToken: USER_TOKEN,
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
  const payload = await mcpResponse.json();

  assert.equal(mcpResponse.status, 200);
  assert.equal(payload.result.structuredContent.enabled, false);
  assert.equal(db.sectionRevisions[0].actor, "lorenzo");
  assert.equal(db.changeLog[0].actor, "lorenzo");
});

test("POST /mcp tools/call reports a clear error before the dynamic D1 schema is migrated", async () => {
  const response = await fetchWorker("/mcp", {
    db: createMissingPagesSchemaDb(),
    method: "POST",
    bearerToken: USER_TOKEN,
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
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.error.code, -32000);
  assert.equal(payload.error.message, "Dynamic page schema is not migrated yet.");
  assert.deepEqual(payload.error.data, {
    error: "dynamic_schema_not_ready",
  });
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

  if (options.bearerToken) {
    headers.set("authorization", `Bearer ${options.bearerToken}`);
  }

  const init = {
    method: options.method || "GET",
    headers,
  };

  if (options.form !== undefined) {
    headers.set("content-type", "application/x-www-form-urlencoded");
    init.body = new URLSearchParams(options.form).toString();
  }

  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(options.body);
  }

  if (options.rawBody !== undefined) {
    init.body = options.rawBody;
  }

  return worker.fetch(new Request(`https://${host}${pathname}`, init), {
    DB: options.db ?? createSeededDb(),
    MEDIA_BUCKET: options.mediaBucket,
    AI_API_TOKEN: API_TOKEN,
    LORENZO_OAUTH_PASSWORD: OAUTH_PASSWORD,
    ROOT_DOMAIN: "lorenzozanna.com",
  });
}

async function createEditorDb(options = {}) {
  return createSeededDb({
    ...options,
    authTokens: options.authTokens ?? [
      await scopedAuthToken({
        token: USER_TOKEN,
        actor: "lorenzo",
        role: "editor",
        scopes: ["content:read", "content:write"],
      }),
    ],
  });
}

function oauthAuthorizeParams(challenge) {
  return new URLSearchParams(oauthAuthorizeForm(challenge)).toString();
}

function oauthAuthorizeForm(challenge) {
  return {
    response_type: "code",
    client_id: OAUTH_CLIENT_ID,
    redirect_uri: OAUTH_REDIRECT_URI,
    scope: "content:read content:write",
    state: "state-123",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: OAUTH_RESOURCE,
  };
}

async function pkceChallenge(verifier) {
  const bytes = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return base64Url(new Uint8Array(digest));
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function createSeededDb(options = {}) {
  const faqEnabled = options.faqEnabled !== false;
  const includeFaq = options.includeFaq !== false;

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
      pageSection("page_home", "section_home_hero", "hero", "hero", 10, true, {
        title: "Lorenzo Zanna Photography",
        intro: "Ritratti, natura, strada, forme e ombre.",
      }),
      pageSection("page_chi_sono", "section_chi_sono_hero", "hero", "hero", 10, true, {
        title: "Chi è Lorenzo Zanna",
        intro: "Sono Lorenzo Zanna.",
      }),
      pageSection("page_portfolio", "section_portfolio_hero", "hero", "hero", 10, true, {
        title: "Portfolio fotografico",
        intro: "Ritratti, strada, natura, forme e ombre.",
      }),
      pageSection("page_portfolio", "section_portfolio_text_2", "text_2", "text", 20, true, {
        type: "text",
        title: "Serie",
        paragraphs: [],
        subsections: [
          {
            title: "Ritratti",
            paragraphs: ["Persone, posture, riflessi, distanza."],
          },
        ],
      }),
      ...(includeFaq ? [pageSection("page_portfolio", "section_portfolio_faq", "faq", "faq", 90, faqEnabled, {
        title: "Domande frequenti",
        items: [
          {
            question: "Come e organizzato il portfolio?",
            answer: "Per serie.",
          },
        ],
      })] : []),
      pageSection("page_contatti", "section_contatti_hero", "hero", "hero", 10, true, {
        title: "Contatti",
        intro: "Scrivi per un ritratto.",
      }),
      pageSection("page_contatti", "section_contatti_contact_band", "contact-band", "text", 15, true, {
        type: "contact-band",
        channels: [
          { label: "Email", value: "Da definire", href: null },
          { label: "Instagram", value: "Da definire", href: null },
          { label: "Telefono", value: "Da definire", href: null },
        ],
      }),
    ],
    authTokens: options.authTokens ?? [],
    oauthAuthorizationCodes: options.oauthAuthorizationCodes ?? [],
    oauthAccessTokens: options.oauthAccessTokens ?? [],
    mediaAssets: options.mediaAssets ?? [],
    mediaUploads: options.mediaUploads ?? [],
    mediaUsages: options.mediaUsages ?? [],
  });
}

async function scopedAuthToken(options) {
  return {
    id: options.id ?? crypto.randomUUID(),
    site_id: "site_ph",
    site_slug: "ph",
    token_hash: await sha256Hex(options.token),
    label: options.label ?? "Lorenzo connector",
    actor: options.actor,
    role: options.role,
    scopes: JSON.stringify(options.scopes ?? []),
    status: options.status ?? "active",
    expires_at: options.expiresAt ?? null,
    revoked_at: options.status === "revoked" ? "2026-07-13 00:00:00" : null,
    last_used_at: null,
  };
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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

function richTextValue(blocks) {
  return {
    format: "rich_text_v1",
    blocks: blocks.map((spans) => ({
      type: "paragraph",
      spans,
    })),
  };
}

function pageSection(pageId, id, key, type, order, enabled, data) {
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

function mediaAsset(options) {
  return {
    id: options.id,
    site_id: options.site_id ?? "site_ph",
    r2_key: options.r2_key ?? `ph/originals/${options.id}.jpg`,
    public_url: options.public_url,
    alt: options.alt ?? "",
    caption: options.caption ?? null,
    width: options.width ?? 1600,
    height: options.height ?? 1200,
    mime_type: options.mime_type ?? "image/jpeg",
    size_bytes: options.size_bytes ?? 345678,
    status: options.status ?? "ready",
    created_at: "2026-07-15 00:00:00",
    updated_at: "2026-07-15 00:00:00",
  };
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

function createMissingPagesSchemaDb() {
  return {
    prepare(query) {
      return {
        bind(...params) {
          this.params = params;
          return this;
        },
        async first() {
          if (query.includes("FROM auth_tokens") && query.includes("token_hash = ?")) {
            return {
              id: "token_lorenzo_editor_missing_schema",
              site_id: "site_ph",
              label: "Lorenzo editor",
              actor: "lorenzo",
              role: "editor",
              scopes: JSON.stringify(["content:read", "content:write"]),
              status: "active",
              expires_at: null,
              site_slug: "ph",
            };
          }

          if (query.includes("FROM sites WHERE slug = ?")) {
            return {
              id: "site_ph",
              slug: this.params[0],
              name: "Lorenzo Zanna Photography",
              status: "published",
            };
          }

          if (query.includes("FROM pages")) {
            throw new Error("D1_ERROR: no such table: pages");
          }

          throw new Error(`Unhandled missing schema first query: ${query}`);
        },
        async all() {
          throw new Error(`Unhandled missing schema all query: ${query}`);
        },
        async run() {
          if (query.includes("UPDATE auth_tokens")) {
            return { success: true };
          }

          throw new Error(`Unhandled missing schema run query: ${query}`);
        },
      };
    },
  };
}

class FakeD1Database {
  constructor(seed) {
    this.sites = [...seed.sites];
    this.contentEntries = [...seed.contentEntries];
    this.pages = [...seed.pages];
    this.pageSections = [...seed.pageSections];
    this.authTokens = [...seed.authTokens];
    this.oauthAuthorizationCodes = [...seed.oauthAuthorizationCodes];
    this.oauthAccessTokens = [...seed.oauthAccessTokens];
    this.mediaAssets = [...seed.mediaAssets];
    this.mediaUploads = [...seed.mediaUploads];
    this.mediaUsages = [...seed.mediaUsages];
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
      const onlyEnabled = query.includes("enabled = 1");
      return {
        results: this.pageSections
          .filter((section) => section.page_id === params[0] && (!onlyEnabled || section.enabled === 1))
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
      if (query.includes("AND id = ?")) {
        return {
          results: this.changeLog.filter((entry) => entry.site_id === params[0] && entry.id === params[1]),
        };
      }

      const [siteId] = params;
      const limit = params.length > 1 ? params.at(-1) : 50;
      const target = params.length > 2 ? params[1] : null;
      const targetChildren = params.length > 2 ? params[2] : null;
      const targetChildPrefix = targetChildren ? targetChildren.slice(0, -1) : null;

      return {
        results: this.changeLog
          .filter((entry) => entry.site_id === siteId)
          .filter((entry) => !target || entry.target === target || entry.target.startsWith(targetChildPrefix))
          .sort((left, right) => right.created_at.localeCompare(left.created_at))
          .slice(0, limit),
      };
    }

    if (query.includes("FROM media_assets") && query.includes("AND id = ?")) {
      return {
        results: this.mediaAssets.filter((asset) => asset.site_id === params[0] && asset.id === params[1]),
      };
    }

    if (query.includes("FROM media_assets") && query.includes("status = ?")) {
      const [siteId, status, limit] = params;
      return {
        results: this.mediaAssets
          .filter((asset) => asset.site_id === siteId && asset.status === status)
          .slice(0, limit),
      };
    }

    if (query.includes("FROM media_assets") && query.includes("WHERE site_id = ?")) {
      const [siteId, limit] = params;
      return {
        results: this.mediaAssets
          .filter((asset) => asset.site_id === siteId)
          .slice(0, limit),
      };
    }

    if (query.includes("FROM media_uploads") && query.includes("u.id = ?")) {
      return {
        results: this.mediaUploads
          .filter((upload) => upload.site_id === params[0] && upload.id === params[1])
          .map((upload) => {
            const asset = this.mediaAssets.find((item) => item.id === upload.asset_id);
            return {
              upload_id: upload.id,
              upload_status: upload.status,
              upload_r2_key: upload.r2_key,
              upload_filename: upload.filename,
              upload_mime_type: upload.mime_type,
              upload_size_bytes: upload.size_bytes,
              upload_expires_at: upload.expires_at,
              asset_id: asset?.id,
              asset_r2_key: asset?.r2_key,
              asset_public_url: asset?.public_url,
              asset_alt: asset?.alt,
              asset_caption: asset?.caption,
              asset_width: asset?.width,
              asset_height: asset?.height,
              asset_mime_type: asset?.mime_type,
              asset_size_bytes: asset?.size_bytes,
              asset_status: asset?.status,
              asset_created_at: asset?.created_at,
              asset_updated_at: asset?.updated_at,
            };
          }),
      };
    }

    if (query.includes("FROM media_uploads") && query.includes("WHERE id = ?")) {
      return {
        results: this.mediaUploads.filter((upload) => upload.id === params[0]),
      };
    }

    if (query.includes("FROM auth_tokens") && query.includes("token_hash = ?")) {
      return {
        results: this.authTokens
          .filter((token) => token.token_hash === params[0])
          .map((token) => ({
            ...token,
            site_slug: this.sites.find((site) => site.id === token.site_id)?.slug ?? token.site_slug,
          })),
      };
    }

    if (query.includes("FROM oauth_authorization_codes") && query.includes("code_hash = ?")) {
      return {
        results: this.oauthAuthorizationCodes
          .filter((code) => code.code_hash === params[0])
          .map((code) => ({
            ...code,
            site_slug: this.sites.find((site) => site.id === code.site_id)?.slug ?? code.site_slug,
          })),
      };
    }

    if (query.includes("FROM oauth_access_tokens") && query.includes("token_hash = ?")) {
      return {
        results: this.oauthAccessTokens
          .filter((token) => token.token_hash === params[0])
          .map((token) => ({
            ...token,
            site_slug: this.sites.find((site) => site.id === token.site_id)?.slug ?? token.site_slug,
          })),
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

    if (query.includes("INSERT INTO media_assets")) {
      const [
        id,
        siteId,
        r2Key,
        publicUrl,
        alt,
        caption,
        width,
        height,
        mimeType,
        sizeBytes,
        status,
      ] = params;
      this.mediaAssets.push({
        id,
        site_id: siteId,
        r2_key: r2Key,
        public_url: publicUrl,
        alt,
        caption,
        width,
        height,
        mime_type: mimeType,
        size_bytes: sizeBytes,
        status,
        created_at: "2026-07-13 00:00:01",
        updated_at: "2026-07-13 00:00:01",
      });
      return { success: true };
    }

    if (query.includes("INSERT INTO media_uploads")) {
      const [id, siteId, assetId, r2Key, filename, mimeType, sizeBytes, tokenHash, expiresAt] = params;
      this.mediaUploads.push({
        id,
        site_id: siteId,
        asset_id: assetId,
        r2_key: r2Key,
        filename,
        mime_type: mimeType,
        size_bytes: sizeBytes,
        upload_token_hash: tokenHash,
        status: "pending",
        expires_at: expiresAt,
        uploaded_at: null,
        created_at: "2026-07-13 00:00:01",
        updated_at: "2026-07-13 00:00:01",
      });
      return { success: true };
    }

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

    if (query.includes("UPDATE media_assets")) {
      if (query.includes("status = ?")) {
        const [status, assetId] = params;
        const asset = this.mediaAssets.find((item) => item.id === assetId);
        if (asset) {
          asset.status = status;
          asset.updated_at = "2026-07-13 00:00:01";
        }
        return { success: true };
      }

      const [alt, assetId] = params;
      const asset = this.mediaAssets.find((item) => item.id === assetId);
      if (asset) {
        asset.alt = alt;
        asset.updated_at = "2026-07-13 00:00:01";
      }
      return { success: true };
    }

    if (query.includes("UPDATE media_uploads")) {
      const [status, uploadId] = params;
      const upload = this.mediaUploads.find((item) => item.id === uploadId);
      if (upload) {
        upload.status = status;
        upload.uploaded_at = status === "uploaded" ? "2026-07-13 00:00:01" : upload.uploaded_at;
        upload.updated_at = "2026-07-13 00:00:01";
      }
      return { success: true };
    }

    if (query.includes("DELETE FROM media_usages")) {
      const [pageId, sectionId] = params;
      this.mediaUsages = this.mediaUsages.filter(
        (usage) => usage.page_id !== pageId || usage.section_id !== sectionId,
      );
      return { success: true };
    }

    if (query.includes("INSERT INTO media_usages")) {
      const [id, assetId, pageId, sectionId, path] = params;
      const existing = this.mediaUsages.find(
        (usage) => usage.page_id === pageId && usage.section_id === sectionId && usage.path === path,
      );
      if (existing) {
        existing.asset_id = assetId;
        existing.updated_at = "2026-07-13 00:00:01";
      } else {
        this.mediaUsages.push({
          id,
          asset_id: assetId,
          page_id: pageId,
          section_id: sectionId,
          path,
          created_at: "2026-07-13 00:00:01",
          updated_at: "2026-07-13 00:00:01",
        });
      }
      return { success: true };
    }

    if (query.includes("UPDATE page_sections")) {
      if (query.includes("section_order = ?") && query.includes("enabled = ?")) {
        const [enabled, order, data, sectionId] = params;
        const section = this.pageSections.find((item) => item.id === sectionId);
        section.enabled = enabled;
        section.section_order = order;
        section.data = data;
        section.updated_at = "2026-07-13 00:00:01";
        return { success: true };
      }

      if (query.includes("section_order = ?")) {
        const [order, sectionId] = params;
        const section = this.pageSections.find((item) => item.id === sectionId);
        section.section_order = order;
        section.updated_at = "2026-07-13 00:00:01";
        return { success: true };
      }

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

    if (query.includes("UPDATE auth_tokens")) {
      const [id] = params;
      const token = this.authTokens.find((item) => item.id === id);
      if (token) token.last_used_at = "2026-07-13 00:00:01";
      return { success: true };
    }

    if (query.includes("INSERT INTO oauth_authorization_codes")) {
      const [
        id,
        codeHash,
        clientId,
        siteId,
        actor,
        role,
        scopes,
        redirectUri,
        codeChallenge,
        codeChallengeMethod,
        resource,
      ] = params;
      this.oauthAuthorizationCodes.push({
        id,
        code_hash: codeHash,
        client_id: clientId,
        site_id: siteId,
        actor,
        role,
        scopes,
        redirect_uri: redirectUri,
        code_challenge: codeChallenge,
        code_challenge_method: codeChallengeMethod,
        resource,
        expires_at: "2099-01-01 00:10:00",
        used_at: null,
        created_at: "2026-07-13 00:00:01",
      });
      return { success: true };
    }

    if (query.includes("UPDATE oauth_authorization_codes")) {
      const [id] = params;
      const code = this.oauthAuthorizationCodes.find((item) => item.id === id);
      if (code) code.used_at = "2026-07-13 00:00:01";
      return { success: true };
    }

    if (query.includes("INSERT INTO oauth_access_tokens")) {
      const [id, tokenHash, clientId, siteId, actor, role, scopes, resource] = params;
      this.oauthAccessTokens.push({
        id,
        token_hash: tokenHash,
        client_id: clientId,
        site_id: siteId,
        actor,
        role,
        scopes,
        resource,
        status: "active",
        expires_at: "2099-01-01 01:00:00",
        last_used_at: null,
        revoked_at: null,
        created_at: "2026-07-13 00:00:01",
      });
      return { success: true };
    }

    if (query.includes("UPDATE oauth_access_tokens")) {
      const [id] = params;
      const token = this.oauthAccessTokens.find((item) => item.id === id);
      if (token) token.last_used_at = "2026-07-13 00:00:01";
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

class FakeMediaBucket {
  constructor(objects) {
    this.objects = objects;
    this.puts = [];
  }

  head(key) {
    const object = this.objects[key];
    if (!object) return Promise.resolve(null);
    return Promise.resolve({
      size: object.size,
      httpMetadata: {
        contentType: object.contentType,
      },
    });
  }

  async put(key, body, options) {
    const bytes = body instanceof Uint8Array ? body : new Uint8Array(await new Response(body).arrayBuffer());
    this.puts.push({
      key,
      body: bytes,
      options,
    });
    this.objects[key] = {
      size: bytes.byteLength,
      contentType: options?.httpMetadata?.contentType,
    };
    return {
      key,
    };
  }
}

function compareContentEntries(left, right) {
  const collection = left.collection.localeCompare(right.collection);
  if (collection !== 0) return collection;
  return left.item_key.localeCompare(right.item_key);
}
