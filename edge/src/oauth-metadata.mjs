export const MCP_OAUTH_SCOPES = ["content:read", "content:write", "content:publish"];

export const READ_SECURITY_SCHEMES = [
  {
    type: "oauth2",
    scopes: ["content:read"],
  },
];

export const WRITE_SECURITY_SCHEMES = [
  {
    type: "oauth2",
    scopes: ["content:write"],
  },
];

export function getProtectedResourceMetadata(request) {
  const origin = requestOrigin(request);

  return {
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    scopes_supported: MCP_OAUTH_SCOPES,
    bearer_methods_supported: ["header"],
    resource_documentation: `${origin}/`,
  };
}

export function getAuthorizationServerMetadata(request) {
  const origin = requestOrigin(request);

  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: MCP_OAUTH_SCOPES,
  };
}

export function oauthFlowNotConfigured() {
  return {
    error: "oauth_flow_not_configured",
    message:
      "OAuth discovery metadata is published, but the authorization-code flow is not configured yet. Use a scoped bearer token for now.",
  };
}

export function mcpWwwAuthenticateHeader(request, options = {}) {
  const params = [
    `resource_metadata="${protectedResourceMetadataUrl(request)}"`,
    `scope="${MCP_OAUTH_SCOPES.join(" ")}"`,
  ];

  if (options.error) {
    params.push(`error="${escapeHeaderValue(options.error)}"`);
  }

  if (options.errorDescription) {
    params.push(`error_description="${escapeHeaderValue(options.errorDescription)}"`);
  }

  return `Bearer ${params.join(", ")}`;
}

function protectedResourceMetadataUrl(request) {
  return `${requestOrigin(request)}/.well-known/oauth-protected-resource`;
}

function requestOrigin(request) {
  return new URL(request.url).origin.toLowerCase();
}

function escapeHeaderValue(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
