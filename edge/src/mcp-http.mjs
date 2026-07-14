import { disableSection, enableSection, updateCta, updateRichText, updateText } from "./sections.mjs";
import { getPage } from "./pages.mjs";
import { listChanges } from "./changes.mjs";
import { rollbackChange } from "./rollback.mjs";
import { authenticateMcpRequest, hasMcpPermission } from "./auth.mjs";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
};

const PROTOCOL_VERSION = "2025-06-18";

const TOOLS = [
  {
    name: "get_page",
    title: "Get Page",
    description: "Read a structured page with section style contracts and editable field metadata.",
    inputSchema: {
      type: "object",
      properties: {
        site: { type: "string", description: "Site slug, usually ph." },
        page: { type: "string", description: "Page slug, for example portfolio." },
      },
      required: ["site", "page"],
    },
  },
  {
    name: "list_changes",
    title: "List Changes",
    description: "Read recent site changes, optionally filtered by page and section.",
    inputSchema: {
      type: "object",
      properties: {
        site: { type: "string", description: "Site slug, usually ph." },
        page: { type: "string", description: "Optional page slug, for example portfolio." },
        sectionId: { type: "string", description: "Optional section identifier. Requires page." },
        limit: { type: "integer", description: "Maximum changes to return, from 1 to 50." },
      },
      required: ["site"],
    },
  },
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
  {
    name: "enable_section",
    title: "Enable Section",
    description: "Show a structured page section that was hidden, without changing its content.",
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
  {
    name: "update_text",
    title: "Update Text",
    description: "Update a contracted plain-text field without accepting arbitrary HTML.",
    inputSchema: {
      type: "object",
      properties: {
        site: { type: "string", description: "Site slug, usually ph." },
        page: { type: "string", description: "Page slug, for example portfolio." },
        sectionId: { type: "string", description: "Section identifier, for example hero or faq." },
        path: { type: "string", description: "Concrete editable field path, for example title or items[0].question." },
        value: { type: "string", description: "Plain text value. HTML is rejected." },
      },
      required: ["site", "page", "sectionId", "path", "value"],
    },
  },
  {
    name: "update_cta",
    title: "Update CTA",
    description: "Update a contracted CTA/link label and href with URL validation.",
    inputSchema: {
      type: "object",
      properties: {
        site: { type: "string", description: "Site slug, usually ph." },
        page: { type: "string", description: "Page slug, for example home." },
        sectionId: { type: "string", description: "Section identifier, for example hero or cta." },
        path: { type: "string", description: "Concrete link field path, for example primaryCta." },
        label: { type: "string", description: "Plain text CTA label." },
        href: { type: "string", description: "Safe href: internal path, allowlisted html page, https, mailto, or tel." },
      },
      required: ["site", "page", "sectionId", "path", "href"],
    },
  },
  {
    name: "update_rich_text",
    title: "Update Rich Text",
    description: "Update a contracted rich text field using rich_text_v1 spans, marks, and safe links.",
    inputSchema: {
      type: "object",
      properties: {
        site: { type: "string", description: "Site slug, usually ph." },
        page: { type: "string", description: "Page slug, for example portfolio." },
        sectionId: { type: "string", description: "Section identifier, for example faq." },
        path: { type: "string", description: "Concrete rich text field path, for example items[0].answer." },
        value: {
          type: "object",
          description: "rich_text_v1 object with paragraph blocks and spans.",
        },
      },
      required: ["site", "page", "sectionId", "path", "value"],
    },
  },
  {
    name: "rollback_change",
    title: "Rollback Change",
    description: "Safely rollback a structured section change using its recorded before snapshot.",
    inputSchema: {
      type: "object",
      properties: {
        site: { type: "string", description: "Site slug, usually ph." },
        changeId: { type: "string", description: "Specific change_log id to rollback." },
        revisionId: { type: "string", description: "Specific section_revisions id to rollback." },
        page: { type: "string", description: "Page slug for rolling back the latest matching change." },
        sectionId: { type: "string", description: "Optional section identifier for latest-change rollback. Requires page." },
      },
      required: ["site"],
    },
  },
];

export async function handleMcpHttpRequest(request, env) {
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed", message: "Use POST for MCP JSON-RPC requests." }, 405);
  }

  const auth = await authenticateMcpRequest(request, env);
  if (!auth.ok) return json({ error: auth.error, message: auth.message }, auth.status);

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
    const result = await handleMcpMethod(message.method, message.params ?? {}, env, auth);
    return json({
      jsonrpc: "2.0",
      id: message.id ?? null,
      result,
    });
  } catch (error) {
    const normalized = normalizeMcpError(error);
    return json(rpcError(message.id ?? null, normalized.code, normalized.message, normalized.data));
  }
}

async function handleMcpMethod(method, params, env, auth) {
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

    if (name === "get_page") {
      if (!hasMcpPermission(auth, "content:read", args.site)) {
        throw mcpError(-32003, "Permission denied for content:read.", {
          permission: "content:read",
          site: args.site,
        });
      }

      const result = await getPage(env, {
        site: args.site,
        page: args.page,
      });
      return toolResult(result);
    }

    if (name === "list_changes") {
      if (!hasMcpPermission(auth, "content:read", args.site)) {
        throw mcpError(-32003, "Permission denied for content:read.", {
          permission: "content:read",
          site: args.site,
        });
      }

      const result = await listChanges(env, {
        site: args.site,
        page: args.page,
        sectionId: args.sectionId,
        limit: args.limit,
      });
      return toolResult(result);
    }

    if (name === "disable_section") {
      if (!hasMcpPermission(auth, "content:write", args.site)) {
        throw mcpError(-32003, "Permission denied for content:write.", {
          permission: "content:write",
          site: args.site,
        });
      }

      const result = await disableSection(env, {
        site: args.site,
        page: args.page,
        sectionId: args.sectionId,
        actor: auth.actor,
      });
      return toolResult(result);
    }

    if (name === "enable_section") {
      if (!hasMcpPermission(auth, "content:write", args.site)) {
        throw mcpError(-32003, "Permission denied for content:write.", {
          permission: "content:write",
          site: args.site,
        });
      }

      const result = await enableSection(env, {
        site: args.site,
        page: args.page,
        sectionId: args.sectionId,
        actor: auth.actor,
      });
      return toolResult(result);
    }

    if (name === "update_text") {
      if (!hasMcpPermission(auth, "content:write", args.site)) {
        throw mcpError(-32003, "Permission denied for content:write.", {
          permission: "content:write",
          site: args.site,
        });
      }

      const result = await updateText(env, {
        site: args.site,
        page: args.page,
        sectionId: args.sectionId,
        path: args.path,
        value: args.value,
        actor: auth.actor,
      });
      return toolResult(result);
    }

    if (name === "update_cta") {
      if (!hasMcpPermission(auth, "content:write", args.site)) {
        throw mcpError(-32003, "Permission denied for content:write.", {
          permission: "content:write",
          site: args.site,
        });
      }

      const result = await updateCta(env, {
        site: args.site,
        page: args.page,
        sectionId: args.sectionId,
        path: args.path,
        label: args.label,
        href: args.href,
        actor: auth.actor,
      });
      return toolResult(result);
    }

    if (name === "update_rich_text") {
      if (!hasMcpPermission(auth, "content:write", args.site)) {
        throw mcpError(-32003, "Permission denied for content:write.", {
          permission: "content:write",
          site: args.site,
        });
      }

      const result = await updateRichText(env, {
        site: args.site,
        page: args.page,
        sectionId: args.sectionId,
        path: args.path,
        value: args.value,
        actor: auth.actor,
      });
      return toolResult(result);
    }

    if (name === "rollback_change") {
      if (!hasMcpPermission(auth, "content:write", args.site)) {
        throw mcpError(-32003, "Permission denied for content:write.", {
          permission: "content:write",
          site: args.site,
        });
      }

      const result = await rollbackChange(env, {
        site: args.site,
        changeId: args.changeId,
        revisionId: args.revisionId,
        page: args.page,
        sectionId: args.sectionId,
        actor: auth.actor,
      });
      return toolResult(result);
    }

    throw mcpError(-32602, `Unknown tool: ${name}`);
  }

  throw mcpError(-32601, `Method not found: ${method}`);
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

function normalizeMcpError(error) {
  if (isMissingDynamicSchemaError(error)) {
    return {
      code: -32000,
      message: "Dynamic page schema is not migrated yet.",
      data: {
        error: "dynamic_schema_not_ready",
      },
    };
  }

  return {
    code: error.code ?? -32000,
    message: error.message || "Server error",
    data: error.data,
  };
}

function isMissingDynamicSchemaError(error) {
  const message = String(error?.message ?? "");
  return message.includes("no such table: pages") || message.includes("no such table: page_sections");
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: JSON_HEADERS,
  });
}
