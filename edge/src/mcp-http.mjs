import { disableSection } from "./sections.mjs";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
};

const PROTOCOL_VERSION = "2025-06-18";

const TOOLS = [
  {
    name: "disable_section",
    title: "Disable Section",
    description: "Hide a structured page section without deleting its content.",
    inputSchema: {
      type: "object",
      properties: {
        site: { type: "string", description: "Site slug, usually ph." },
        page: { type: "string", description: "Page slug, for example portfolio." },
        sectionId: { type: "string", description: "Section identifier, for example faq." },
      },
      required: ["site", "page", "sectionId"],
    },
  },
];

export async function handleMcpHttpRequest(request, env) {
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed", message: "Use POST for MCP JSON-RPC requests." }, 405);
  }

  const auth = requireMcpAuth(request, env);
  if (!auth.ok) return auth.response;

  let message;
  try {
    message = await request.json();
  } catch {
    return json(rpcError(null, -32700, "Parse error"), 400);
  }

  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return json(rpcError(message?.id ?? null, -32600, "Invalid Request"), 400);
  }

  try {
    const result = await handleMcpMethod(message.method, message.params ?? {}, env, auth.actor);
    return json({
      jsonrpc: "2.0",
      id: message.id ?? null,
      result,
    });
  } catch (error) {
    return json(rpcError(message.id ?? null, error.code ?? -32000, error.message || "Server error", error.data));
  }
}

async function handleMcpMethod(method, params, env, actor) {
  if (method === "initialize") {
    return {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {
        tools: {
          listChanged: false,
        },
      },
      serverInfo: {
        name: "lorenzozanna-content",
        title: "Lorenzo Zanna Content MCP",
        version: "0.2.0",
      },
      instructions:
        "Use tools to modify structured site content only. Do not generate arbitrary HTML, CSS, JavaScript, or SQL.",
    };
  }

  if (method === "tools/list") {
    return { tools: TOOLS };
  }

  if (method === "tools/call") {
    const name = params?.name;
    const args = params?.arguments ?? {};

    if (name === "disable_section") {
      const result = await disableSection(env, {
        site: args.site,
        page: args.page,
        sectionId: args.sectionId,
        actor,
      });
      return toolResult(result);
    }

    throw mcpError(-32602, `Unknown tool: ${name}`);
  }

  throw mcpError(-32601, `Method not found: ${method}`);
}

function requireMcpAuth(request, env) {
  const expectedToken = env.AI_API_TOKEN;
  if (!expectedToken) {
    return {
      ok: false,
      response: json({ error: "missing_token", message: "AI_API_TOKEN is not configured." }, 500),
    };
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";

  if (!timingSafeEqual(token, expectedToken)) {
    return {
      ok: false,
      response: json({ error: "unauthorized", message: "Invalid MCP token." }, 401),
    };
  }

  return {
    ok: true,
    actor: request.headers.get("x-ai-actor") || "mcp-http",
  };
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

function rpcError(id, code, message, data) {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  };
}

function mcpError(code, message, data) {
  const error = new Error(message);
  error.code = code;
  error.data = data;
  return error;
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: JSON_HEADERS,
  });
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
