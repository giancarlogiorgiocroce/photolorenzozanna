import { MCP_OAUTH_SCOPES } from "./oauth-metadata.mjs";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const HTML_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
};

const OAUTH_CLIENTS = new Map([
  [
    "chatgpt-lorenzo-dev",
    {
      site: "ph",
      actor: "lorenzo",
      role: "editor",
      scopes: ["content:read", "content:write"],
    },
  ],
]);

const TOKEN_EXPIRES_IN_SECONDS = 3600;

export async function handleOAuthRequest(request, env, url, segments) {
  if (!env?.DB) {
    return json({ error: "server_error", error_description: "D1 binding DB is not configured." }, 500);
  }

  if (segments[1] === "authorize") {
    if (request.method === "GET") return renderAuthorizePage(request, url);
    if (request.method === "POST") return authorize(request, env);
    return json({ error: "method_not_allowed", error_description: "Use GET or POST for authorize." }, 405);
  }

  if (segments[1] === "token") {
    if (request.method !== "POST") {
      return json({ error: "method_not_allowed", error_description: "Use POST for token." }, 405);
    }
    return token(request, env);
  }

  return json({ error: "not_found", error_description: "OAuth route not found." }, 404);
}

async function renderAuthorizePage(request, url, errorMessage = "") {
  const validation = validateAuthorizeParams(url.searchParams, request);
  if (!validation.ok) {
    return json({ error: validation.error, error_description: validation.message }, validation.status);
  }

  return html(authorizeHtml(validation.value, errorMessage));
}

async function authorize(request, env) {
  const form = await readForm(request);
  if (!form.ok) return form.response;

  const url = new URL(request.url);
  url.search = form.value.toString();
  const validation = validateAuthorizeParams(url.searchParams, request);
  if (!validation.ok) {
    return json({ error: validation.error, error_description: validation.message }, validation.status);
  }

  const params = validation.value;
  const username = String(form.value.get("username") ?? "").trim().toLowerCase();
  const password = String(form.value.get("password") ?? "");

  if (!env.LORENZO_OAUTH_PASSWORD) {
    return html(authorizeHtml(params, "Login non configurato: manca LORENZO_OAUTH_PASSWORD."), 500);
  }

  if (username !== "lorenzo" || !timingSafeEqual(password, env.LORENZO_OAUTH_PASSWORD)) {
    return html(authorizeHtml(params, "Credenziali non valide."), 401);
  }

  const client = OAUTH_CLIENTS.get(params.clientId);
  const site = await env.DB.prepare("SELECT id, slug, name, status FROM sites WHERE slug = ?")
    .bind(client.site)
    .first();
  if (!site) {
    return json({ error: "server_error", error_description: "Configured OAuth site does not exist." }, 500);
  }

  const code = randomToken("oc_");
  const codeHash = await sha256Hex(code);
  await env.DB.prepare(
    `INSERT INTO oauth_authorization_codes (
       id,
       code_hash,
       client_id,
       site_id,
       actor,
       role,
       scopes,
       redirect_uri,
       code_challenge,
       code_challenge_method,
       resource,
       expires_at,
       created_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+10 minutes'), datetime('now'))`,
  )
    .bind(
      crypto.randomUUID(),
      codeHash,
      params.clientId,
      site.id,
      client.actor,
      client.role,
      JSON.stringify(params.scopes),
      params.redirectUri,
      params.codeChallenge,
      params.codeChallengeMethod,
      params.resource,
    )
    .run();

  const redirect = new URL(params.redirectUri);
  redirect.searchParams.set("code", code);
  if (params.state) redirect.searchParams.set("state", params.state);

  return new Response(null, {
    status: 302,
    headers: {
      location: redirect.toString(),
      "cache-control": "no-store",
    },
  });
}

async function token(request, env) {
  const form = await readForm(request);
  if (!form.ok) return form.response;

  const grantType = String(form.value.get("grant_type") ?? "");
  const clientId = String(form.value.get("client_id") ?? "");
  const code = String(form.value.get("code") ?? "");
  const redirectUri = String(form.value.get("redirect_uri") ?? "");
  const verifier = String(form.value.get("code_verifier") ?? "");
  const resource = String(form.value.get("resource") ?? "");

  if (grantType !== "authorization_code") {
    return oauthError("unsupported_grant_type", "Only authorization_code is supported.", 400);
  }

  if (!OAUTH_CLIENTS.has(clientId)) {
    return oauthError("invalid_client", "Unknown OAuth client.", 401);
  }

  if (!code || !verifier) {
    return oauthError("invalid_request", "code and code_verifier are required.", 400);
  }

  const storedCode = await env.DB.prepare(
    `SELECT
       oauth_authorization_codes.id,
       oauth_authorization_codes.client_id,
       oauth_authorization_codes.site_id,
       oauth_authorization_codes.actor,
       oauth_authorization_codes.role,
       oauth_authorization_codes.scopes,
       oauth_authorization_codes.redirect_uri,
       oauth_authorization_codes.code_challenge,
       oauth_authorization_codes.code_challenge_method,
       oauth_authorization_codes.resource,
       oauth_authorization_codes.expires_at,
       oauth_authorization_codes.used_at,
       sites.slug AS site_slug
     FROM oauth_authorization_codes
     JOIN sites ON sites.id = oauth_authorization_codes.site_id
     WHERE oauth_authorization_codes.code_hash = ?`,
  )
    .bind(await sha256Hex(code))
    .first();

  if (!storedCode) return oauthError("invalid_grant", "Authorization code is invalid.", 400);
  if (storedCode.used_at) return oauthError("invalid_grant", "Authorization code was already used.", 400);
  if (storedCode.expires_at <= currentSqlTimestamp()) {
    return oauthError("invalid_grant", "Authorization code is expired.", 400);
  }
  if (
    storedCode.client_id !== clientId
    || storedCode.redirect_uri !== redirectUri
    || storedCode.resource !== resource
  ) {
    return oauthError("invalid_grant", "Authorization code binding does not match this token request.", 400);
  }

  const expectedChallenge = await pkceChallenge(verifier);
  if (storedCode.code_challenge_method !== "S256" || expectedChallenge !== storedCode.code_challenge) {
    return oauthError("invalid_grant", "PKCE verification failed.", 400);
  }

  await env.DB.prepare(
    `UPDATE oauth_authorization_codes
     SET used_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(storedCode.id)
    .run();

  const accessToken = randomToken("oat_");
  const accessTokenHash = await sha256Hex(accessToken);
  const scopes = parseScopes(storedCode.scopes);

  await env.DB.prepare(
    `INSERT INTO oauth_access_tokens (
       id,
       token_hash,
       client_id,
       site_id,
       actor,
       role,
       scopes,
       resource,
       status,
       expires_at,
       created_at,
       updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', datetime('now', '+1 hour'), datetime('now'), datetime('now'))`,
  )
    .bind(
      crypto.randomUUID(),
      accessTokenHash,
      storedCode.client_id,
      storedCode.site_id,
      storedCode.actor,
      storedCode.role,
      JSON.stringify(scopes),
      storedCode.resource,
    )
    .run();

  return json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: TOKEN_EXPIRES_IN_SECONDS,
    scope: scopes.join(" "),
    resource: storedCode.resource,
  });
}

function validateAuthorizeParams(searchParams, request) {
  const responseType = String(searchParams.get("response_type") ?? "");
  const clientId = String(searchParams.get("client_id") ?? "");
  const redirectUri = String(searchParams.get("redirect_uri") ?? "");
  const codeChallenge = String(searchParams.get("code_challenge") ?? "");
  const codeChallengeMethod = String(searchParams.get("code_challenge_method") ?? "");
  const state = String(searchParams.get("state") ?? "");
  const resource = String(searchParams.get("resource") ?? "");
  const requestedScopes = parseRequestedScopes(searchParams.get("scope"));
  const client = OAUTH_CLIENTS.get(clientId);

  if (responseType !== "code") return invalidAuthorize("unsupported_response_type", "Only response_type=code is supported.");
  if (!client) return invalidAuthorize("invalid_client", "Unknown OAuth client.");
  if (!isAllowedRedirectUri(redirectUri)) return invalidAuthorize("invalid_request", "redirect_uri is not allowed.");
  if (!codeChallenge || codeChallengeMethod !== "S256") {
    return invalidAuthorize("invalid_request", "PKCE S256 code_challenge is required.");
  }

  const expectedResource = `${new URL(request.url).origin.toLowerCase()}/mcp`;
  if (resource !== expectedResource) {
    return invalidAuthorize("invalid_target", "resource must match this MCP server.");
  }

  const unsupported = requestedScopes.filter((scope) => !client.scopes.includes(scope) || !MCP_OAUTH_SCOPES.includes(scope));
  if (unsupported.length > 0) return invalidAuthorize("invalid_scope", `Unsupported scope: ${unsupported.join(" ")}`);

  const scopes = requestedScopes.length > 0 ? requestedScopes : client.scopes;
  return {
    ok: true,
    value: {
      responseType,
      clientId,
      redirectUri,
      scopes,
      state,
      codeChallenge,
      codeChallengeMethod,
      resource,
    },
  };
}

function invalidAuthorize(error, message) {
  return {
    ok: false,
    status: error === "invalid_client" ? 401 : 400,
    error,
    message,
  };
}

async function readForm(request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return {
      ok: false,
      response: oauthError("invalid_request", "Use application/x-www-form-urlencoded.", 415),
    };
  }

  return {
    ok: true,
    value: new URLSearchParams(await request.text()),
  };
}

function authorizeHtml(params, errorMessage = "") {
  const fields = [
    ["response_type", params.responseType],
    ["client_id", params.clientId],
    ["redirect_uri", params.redirectUri],
    ["scope", params.scopes.join(" ")],
    ["state", params.state],
    ["code_challenge", params.codeChallenge],
    ["code_challenge_method", params.codeChallengeMethod],
    ["resource", params.resource],
  ];

  return `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Collega Lorenzo Zanna Site Editor</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, sans-serif; background: #f5f4ef; color: #171717; }
    main { width: min(92vw, 440px); border: 1px solid #d8d4ca; background: #fff; padding: 28px; }
    h1 { margin: 0 0 12px; font-size: 1.45rem; }
    p { line-height: 1.5; }
    label { display: grid; gap: 6px; margin: 16px 0; font-size: .95rem; }
    input { min-height: 42px; padding: 8px 10px; border: 1px solid #bcb6aa; font: inherit; }
    button { width: 100%; min-height: 44px; border: 0; background: #171717; color: #fff; font: inherit; cursor: pointer; }
    .error { color: #9d1c1c; font-weight: 600; }
  </style>
</head>
<body>
  <main>
    <h1>Lorenzo Zanna Site Editor</h1>
    <p>Accedi per consentire a ChatGPT di leggere e modificare i contenuti del sito fotografico.</p>
    ${errorMessage ? `<p class="error">${escapeHtml(errorMessage)}</p>` : ""}
    <form method="post" action="/oauth/authorize">
      ${fields.map(([name, value]) => `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`).join("\n      ")}
      <label>Utente
        <input name="username" autocomplete="username" value="lorenzo" required>
      </label>
      <label>Password
        <input name="password" type="password" autocomplete="current-password" required>
      </label>
      <button type="submit">Consenti</button>
    </form>
  </main>
</body>
</html>`;
}

function isAllowedRedirectUri(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "chatgpt.com") return false;
    return url.pathname.startsWith("/connector/oauth/")
      || url.pathname === "/connector_platform_oauth_redirect";
  } catch {
    return false;
  }
}

function parseRequestedScopes(value) {
  return String(value ?? "")
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function parseScopes(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function pkceChallenge(verifier) {
  const bytes = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return base64Url(new Uint8Array(digest));
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken(prefix) {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `${prefix}${base64Url(bytes)}`;
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function currentSqlTimestamp() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function timingSafeEqual(actual, expected) {
  const encoder = new TextEncoder();
  const actualBytes = encoder.encode(actual);
  const expectedBytes = encoder.encode(expected);

  if (actualBytes.length !== expectedBytes.length) return false;

  let diff = 0;
  for (let index = 0; index < actualBytes.length; index += 1) {
    diff |= actualBytes[index] ^ expectedBytes[index];
  }

  return diff === 0;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function oauthError(error, description, status) {
  return json({ error, error_description: description }, status);
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: JSON_HEADERS,
  });
}

function html(markup, status = 200) {
  return new Response(markup, {
    status,
    headers: HTML_HEADERS,
  });
}
