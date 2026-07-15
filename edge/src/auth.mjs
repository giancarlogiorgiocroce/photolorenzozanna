import { mcpWwwAuthenticateHeader } from "./oauth-metadata.mjs";

const ROLE_SCOPES = {
  owner: ["content:read", "content:write", "content:publish", "admin:tokens"],
  editor: ["content:read", "content:write"],
  publisher: ["content:read", "content:publish"],
  viewer: ["content:read"],
};

export async function authenticateMcpRequest(request, env) {
  const authHeader = request.headers.get("authorization") ?? "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";

  if (!bearerToken) {
    return authFailure("Missing MCP bearer token.", request, {
      error: "invalid_token",
    });
  }

  const technicalAuth = authenticateTechnicalToken(request, env, bearerToken);
  if (technicalAuth) return technicalAuth;

  if (!env?.DB) {
    return authFailure("D1 binding DB is not configured.", request, {
      error: "invalid_token",
    });
  }

  const tokenHash = await sha256Hex(bearerToken);
  const token = await env.DB.prepare(
    `SELECT
       auth_tokens.id,
       auth_tokens.site_id,
       auth_tokens.label,
       auth_tokens.actor,
       auth_tokens.role,
       auth_tokens.scopes,
       auth_tokens.status,
       auth_tokens.expires_at,
       sites.slug AS site_slug
     FROM auth_tokens
     JOIN sites ON sites.id = auth_tokens.site_id
     WHERE auth_tokens.token_hash = ?`,
  )
    .bind(tokenHash)
    .first();

  if (!token) {
    return authFailure("Invalid MCP token.", request, {
      error: "invalid_token",
    });
  }

  if (token.status === "revoked") {
    return authFailure("MCP token is revoked.", request, {
      error: "invalid_token",
    });
  }

  if (token.expires_at && token.expires_at <= currentSqlTimestamp()) {
    return authFailure("MCP token is expired.", request, {
      error: "invalid_token",
    });
  }

  await env.DB.prepare(
    `UPDATE auth_tokens
     SET last_used_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(token.id)
    .run();

  return {
    ok: true,
    source: "user-token",
    tokenId: token.id,
    actor: token.actor,
    role: token.role,
    site: token.site_slug,
    scopes: effectiveScopes(token.role, token.scopes),
  };
}

export function hasMcpPermission(auth, permission, site) {
  if (!auth?.ok) return false;
  if (site && auth.site !== "*" && auth.site !== site) return false;
  return auth.scopes.includes(permission);
}

export function roleScopes(role) {
  return [...(ROLE_SCOPES[role] ?? [])];
}

function authenticateTechnicalToken(request, env, bearerToken) {
  const expectedToken = env?.AI_API_TOKEN;
  if (!expectedToken || !timingSafeEqual(bearerToken, expectedToken)) return null;

  return {
    ok: true,
    source: "technical-token",
    actor: request.headers.get("x-ai-actor") || "mcp-technical",
    role: "technical",
    site: "*",
    scopes: ["content:read"],
  };
}

function authFailure(message, request, challenge = {}) {
  return {
    ok: false,
    status: 401,
    error: "unauthorized",
    message,
    wwwAuthenticate: request
      ? mcpWwwAuthenticateHeader(request, {
        ...challenge,
        errorDescription: message,
      })
      : undefined,
  };
}

function effectiveScopes(role, scopesJson) {
  const explicitScopes = parseScopes(scopesJson);
  return [...new Set([...roleScopes(role), ...explicitScopes])];
}

function parseScopes(value) {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((scope) => String(scope ?? "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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
