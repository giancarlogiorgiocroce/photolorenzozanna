import {
  disableSection,
  enableSection,
  updateContactChannel,
  updateCta,
  updateRichText,
  updateText,
} from "./sections.mjs";
import {
  attachImageToSection,
  confirmImageUpload,
  createImageUpload,
  listMediaAssets,
  replaceImage,
  setImageFocalPoint,
  updateImageAlt,
} from "./media.mjs";
import {
  addFaqItem,
  addFaqSection,
  addSectionFromPreset,
  removeFaqItem,
  reorderFaqItems,
  updateFaqItem,
} from "./faq-sections.mjs";
import { addTextSubsection } from "./text-sections.mjs";
import { getPage } from "./pages.mjs";
import { listChanges } from "./changes.mjs";
import { rollbackChange } from "./rollback.mjs";
import { listSectionPresets } from "./section-presets.mjs";
import { authenticateMcpRequest, hasMcpPermission } from "./auth.mjs";
import { READ_SECURITY_SCHEMES, WRITE_SECURITY_SCHEMES } from "./oauth-metadata.mjs";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
};

const PROTOCOL_VERSION = "2025-06-18";

const TOOLS = [
  {
    name: "get_page",
    title: "Get Page",
    description: "Read a structured page with section style contracts and editable field metadata.",
    securitySchemes: READ_SECURITY_SCHEMES,
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
    name: "list_section_presets",
    title: "List Section Presets",
    description: "List safe structured section presets. Presets never allow arbitrary HTML.",
    securitySchemes: READ_SECURITY_SCHEMES,
    inputSchema: {
      type: "object",
      properties: {
        site: { type: "string", description: "Site slug, usually ph." },
      },
      required: ["site"],
    },
  },
  {
    name: "list_changes",
    title: "List Changes",
    description: "Read recent site changes, optionally filtered by page and section.",
    securitySchemes: READ_SECURITY_SCHEMES,
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
    name: "list_media_assets",
    title: "List Media Assets",
    description: "List ready media assets for a site so images can be chosen by assetId instead of arbitrary src paths.",
    securitySchemes: READ_SECURITY_SCHEMES,
    inputSchema: {
      type: "object",
      properties: {
        site: { type: "string", description: "Site slug, usually ph." },
        status: {
          type: "string",
          enum: ["ready", "draft", "archived", "all"],
          description: "Optional media status filter. Defaults to ready.",
        },
        limit: { type: "integer", description: "Maximum assets to return, from 1 to 100." },
      },
      required: ["site"],
    },
  },
  {
    name: "disable_section",
    title: "Disable Section",
    description: "Hide a structured page section without deleting its content.",
    securitySchemes: WRITE_SECURITY_SCHEMES,
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
    securitySchemes: WRITE_SECURITY_SCHEMES,
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
    name: "add_section_from_preset",
    title: "Add Section From Preset",
    description: "Add a section from an allowlisted preset. In v1 this supports FAQ only.",
    securitySchemes: WRITE_SECURITY_SCHEMES,
    inputSchema: {
      type: "object",
      properties: {
        site: { type: "string", description: "Site slug, usually ph." },
        page: { type: "string", description: "Page slug, for example portfolio." },
        presetId: { type: "string", description: "Preset id, for example faq." },
        sectionId: { type: "string", description: "Optional section identifier. FAQ must use faq." },
        title: { type: "string", description: "Optional safe plain-text title." },
        intro: { type: "string", description: "Optional safe plain-text intro." },
        items: { type: "array", description: "Optional preset items. FAQ items require question and answer." },
      },
      required: ["site", "page", "presetId"],
    },
  },
  {
    name: "add_faq_section",
    title: "Add FAQ Section",
    description: "Create or re-enable the FAQ section from the safe FAQ preset without duplicating it.",
    securitySchemes: WRITE_SECURITY_SCHEMES,
    inputSchema: {
      type: "object",
      properties: {
        site: { type: "string", description: "Site slug, usually ph." },
        page: { type: "string", description: "Page slug, for example portfolio." },
        sectionId: { type: "string", description: "Optional section identifier. Defaults to faq." },
        title: { type: "string", description: "Safe plain-text FAQ title." },
        intro: { type: "string", description: "Optional safe plain-text intro." },
        items: { type: "array", description: "Optional FAQ items with safe question and answer fields." },
      },
      required: ["site", "page"],
    },
  },
  {
    name: "add_faq_item",
    title: "Add FAQ Item",
    description: "Add one safe FAQ item to an existing FAQ section.",
    securitySchemes: WRITE_SECURITY_SCHEMES,
    inputSchema: {
      type: "object",
      properties: {
        site: { type: "string", description: "Site slug, usually ph." },
        page: { type: "string", description: "Page slug, for example portfolio." },
        sectionId: { type: "string", description: "Optional section identifier. Defaults to faq." },
        question: { type: "string", description: "Safe plain-text question." },
        answer: { description: "Safe plain-text answer or rich_text_v1 object." },
        index: { type: "integer", description: "Optional insert index." },
      },
      required: ["site", "page", "question", "answer"],
    },
  },
  {
    name: "update_faq_item",
    title: "Update FAQ Item",
    description: "Update a safe FAQ question and/or answer by item index.",
    securitySchemes: WRITE_SECURITY_SCHEMES,
    inputSchema: {
      type: "object",
      properties: {
        site: { type: "string", description: "Site slug, usually ph." },
        page: { type: "string", description: "Page slug, for example portfolio." },
        sectionId: { type: "string", description: "Optional section identifier. Defaults to faq." },
        index: { type: "integer", description: "FAQ item index." },
        question: { type: "string", description: "Optional safe plain-text question." },
        answer: { description: "Optional safe plain-text answer or rich_text_v1 object." },
      },
      required: ["site", "page", "index"],
    },
  },
  {
    name: "remove_faq_item",
    title: "Remove FAQ Item",
    description: "Remove one FAQ item by index.",
    securitySchemes: WRITE_SECURITY_SCHEMES,
    inputSchema: {
      type: "object",
      properties: {
        site: { type: "string", description: "Site slug, usually ph." },
        page: { type: "string", description: "Page slug, for example portfolio." },
        sectionId: { type: "string", description: "Optional section identifier. Defaults to faq." },
        index: { type: "integer", description: "FAQ item index." },
      },
      required: ["site", "page", "index"],
    },
  },
  {
    name: "reorder_faq_items",
    title: "Reorder FAQ Items",
    description: "Reorder FAQ items using a complete permutation of item indexes.",
    securitySchemes: WRITE_SECURITY_SCHEMES,
    inputSchema: {
      type: "object",
      properties: {
        site: { type: "string", description: "Site slug, usually ph." },
        page: { type: "string", description: "Page slug, for example portfolio." },
        sectionId: { type: "string", description: "Optional section identifier. Defaults to faq." },
        order: { type: "array", description: "Complete item-index order, for example [1,0,2]." },
      },
      required: ["site", "page", "order"],
    },
  },
  {
    name: "add_text_subsection",
    title: "Add Text Subsection",
    description: "Add one safe text item to a contracted text section with subsections, such as portfolio/text_2.",
    securitySchemes: WRITE_SECURITY_SCHEMES,
    inputSchema: {
      type: "object",
      properties: {
        site: { type: "string", description: "Site slug, usually ph." },
        page: { type: "string", description: "Page slug, for example portfolio." },
        sectionId: { type: "string", description: "Text section identifier, for example text_2." },
        title: { type: "string", description: "Safe plain-text item title." },
        paragraphs: {
          type: "array",
          description: "Safe plain-text paragraphs for the item.",
          items: { type: "string" },
        },
        text: { type: "string", description: "Optional single paragraph alias." },
        index: { type: "integer", description: "Optional insert index." },
      },
      required: ["site", "page", "sectionId", "title"],
    },
  },
  {
    name: "update_text",
    title: "Update Text",
    description: "Update a contracted plain-text field without accepting arbitrary HTML.",
    securitySchemes: WRITE_SECURITY_SCHEMES,
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
    securitySchemes: WRITE_SECURITY_SCHEMES,
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
    name: "update_contact_channel",
    title: "Update Contact Channel",
    description:
      "Edit or hide one contact channel in the contact-band section by semantic name, for example email, instagram, or telefono.",
    securitySchemes: WRITE_SECURITY_SCHEMES,
    inputSchema: {
      type: "object",
      properties: {
        site: { type: "string", description: "Site slug, usually ph." },
        page: { type: "string", description: "Page slug, usually contatti." },
        sectionId: { type: "string", description: "Optional section identifier. Defaults to contact-band." },
        channel: {
          type: "string",
          enum: ["email", "instagram", "telefono"],
          description: "Contact channel name.",
        },
        label: { type: "string", description: "Optional visible label." },
        value: { type: "string", description: "Optional visible value, for example zannafotografia@icloud.com." },
        href: {
          type: "string",
          description: "Optional safe href. Omit this when updating an email value: mailto is generated automatically.",
        },
        enabled: { type: "boolean", description: "Set false to hide this single contact channel." },
      },
      required: ["site", "page", "channel"],
    },
  },
  {
    name: "create_image_upload",
    title: "Create Image Upload",
    description: "Create a short-lived upload session and draft media asset for a new image.",
    securitySchemes: WRITE_SECURITY_SCHEMES,
    inputSchema: {
      type: "object",
      properties: {
        site: { type: "string", description: "Site slug, usually ph." },
        filename: { type: "string", description: "Original image filename." },
        mimeType: {
          type: "string",
          enum: ["image/jpeg", "image/png", "image/webp", "image/avif"],
          description: "Allowed image MIME type.",
        },
        sizeBytes: { type: "integer", description: "Image file size in bytes." },
        width: { type: "integer", description: "Image pixel width." },
        height: { type: "integer", description: "Image pixel height." },
        alt: { type: "string", description: "Accessible alt text. Required for non-decorative images." },
        caption: { type: "string", description: "Optional caption." },
      },
      required: ["site", "filename", "mimeType", "sizeBytes", "width", "height", "alt"],
    },
  },
  {
    name: "confirm_image_upload",
    title: "Confirm Image Upload",
    description: "Confirm that a pending upload exists in R2 and promote the draft media asset to ready.",
    securitySchemes: WRITE_SECURITY_SCHEMES,
    inputSchema: {
      type: "object",
      properties: {
        site: { type: "string", description: "Site slug, usually ph." },
        uploadId: { type: "string", description: "Upload session id returned by create_image_upload." },
      },
      required: ["site", "uploadId"],
    },
  },
  {
    name: "update_image_alt",
    title: "Update Image Alt",
    description: "Update the alt text stored on a media asset. HTML is not accepted.",
    securitySchemes: WRITE_SECURITY_SCHEMES,
    inputSchema: {
      type: "object",
      properties: {
        site: { type: "string", description: "Site slug, usually ph." },
        assetId: { type: "string", description: "Media asset id from list_media_assets." },
        alt: { type: "string", description: "Accessible alt text. Required for non-decorative images." },
      },
      required: ["site", "assetId", "alt"],
    },
  },
  {
    name: "replace_image",
    title: "Replace Image",
    description: "Replace a contracted image field with an existing media asset. The client supplies assetId, never a free src.",
    securitySchemes: WRITE_SECURITY_SCHEMES,
    inputSchema: {
      type: "object",
      properties: {
        site: { type: "string", description: "Site slug, usually ph." },
        page: { type: "string", description: "Page slug, for example portfolio." },
        sectionId: { type: "string", description: "Section identifier, for example gallery or hero." },
        path: { type: "string", description: "Concrete image object path, for example items[0].images[0] or image." },
        assetId: { type: "string", description: "Ready media asset id from list_media_assets." },
        alt: { type: "string", description: "Optional replacement alt text. Required if the asset has no alt and image is not decorative." },
        caption: { type: "string", description: "Optional caption override." },
        decorative: { type: "boolean", description: "Set true only for decorative images that should render with empty alt." },
      },
      required: ["site", "page", "sectionId", "path", "assetId"],
    },
  },
  {
    name: "attach_image_to_section",
    title: "Attach Image To Section",
    description: "Append a ready media asset to a contracted image array, such as a portfolio gallery group.",
    securitySchemes: WRITE_SECURITY_SCHEMES,
    inputSchema: {
      type: "object",
      properties: {
        site: { type: "string", description: "Site slug, usually ph." },
        page: { type: "string", description: "Page slug, for example portfolio." },
        sectionId: { type: "string", description: "Section identifier, for example gallery." },
        path: { type: "string", description: "Concrete image array path, for example items[0].images or shots." },
        assetId: { type: "string", description: "Ready media asset id from list_media_assets." },
        alt: { type: "string", description: "Optional image alt text. Required if the asset has no alt and image is not decorative." },
        caption: { type: "string", description: "Optional caption override." },
        variant: {
          type: "string",
          enum: ["standard", "wide", "tall"],
          description: "Optional layout variant allowed by the target section contract.",
        },
        decorative: { type: "boolean", description: "Set true only for decorative images that should render with empty alt." },
      },
      required: ["site", "page", "sectionId", "path", "assetId"],
    },
  },
  {
    name: "set_image_focal_point",
    title: "Set Image Focal Point",
    description: "Set a controlled focal point for a contracted image object using percentage coordinates from 0 to 100.",
    securitySchemes: WRITE_SECURITY_SCHEMES,
    inputSchema: {
      type: "object",
      properties: {
        site: { type: "string", description: "Site slug, usually ph." },
        page: { type: "string", description: "Page slug, for example portfolio." },
        sectionId: { type: "string", description: "Section identifier, for example gallery or hero." },
        path: { type: "string", description: "Concrete image object path, for example items[0].images[0] or image." },
        x: { type: "integer", minimum: 0, maximum: 100, description: "Horizontal focal point percentage." },
        y: { type: "integer", minimum: 0, maximum: 100, description: "Vertical focal point percentage." },
      },
      required: ["site", "page", "sectionId", "path", "x", "y"],
    },
  },
  {
    name: "update_rich_text",
    title: "Update Rich Text",
    description: "Update a contracted rich text field using rich_text_v1 spans, marks, and safe links.",
    securitySchemes: WRITE_SECURITY_SCHEMES,
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
    securitySchemes: WRITE_SECURITY_SCHEMES,
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
  if (!auth.ok) {
    return json(
      { error: auth.error, message: auth.message },
      auth.status,
      auth.wwwAuthenticate ? { "www-authenticate": auth.wwwAuthenticate } : {},
    );
  }

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

    if (name === "list_section_presets") {
      if (!hasMcpPermission(auth, "content:read", args.site)) {
        throw mcpError(-32003, "Permission denied for content:read.", {
          permission: "content:read",
          site: args.site,
        });
      }

      return toolResult({
        site: args.site,
        ...listSectionPresets(),
      });
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

    if (name === "list_media_assets") {
      if (!hasMcpPermission(auth, "content:read", args.site)) {
        throw mcpError(-32003, "Permission denied for content:read.", {
          permission: "content:read",
          site: args.site,
        });
      }

      const result = await listMediaAssets(env, {
        site: args.site,
        status: args.status,
        limit: args.limit,
      });
      return toolResult(result);
    }

    if (name === "add_section_from_preset") {
      if (!hasMcpPermission(auth, "content:write", args.site)) {
        throw mcpError(-32003, "Permission denied for content:write.", {
          permission: "content:write",
          site: args.site,
        });
      }

      const result = await addSectionFromPreset(env, {
        site: args.site,
        page: args.page,
        presetId: args.presetId,
        sectionId: args.sectionId,
        title: args.title,
        intro: args.intro,
        items: args.items,
        actor: auth.actor,
      });
      return toolResult(result);
    }

    if (name === "add_faq_section") {
      if (!hasMcpPermission(auth, "content:write", args.site)) {
        throw mcpError(-32003, "Permission denied for content:write.", {
          permission: "content:write",
          site: args.site,
        });
      }

      const result = await addFaqSection(env, {
        site: args.site,
        page: args.page,
        sectionId: args.sectionId,
        title: args.title,
        intro: args.intro,
        items: args.items,
        actor: auth.actor,
      });
      return toolResult(result);
    }

    if (name === "add_faq_item") {
      if (!hasMcpPermission(auth, "content:write", args.site)) {
        throw mcpError(-32003, "Permission denied for content:write.", {
          permission: "content:write",
          site: args.site,
        });
      }

      const result = await addFaqItem(env, {
        site: args.site,
        page: args.page,
        sectionId: args.sectionId,
        question: args.question,
        answer: args.answer,
        index: args.index,
        position: args.position,
        actor: auth.actor,
      });
      return toolResult(result);
    }

    if (name === "update_faq_item") {
      if (!hasMcpPermission(auth, "content:write", args.site)) {
        throw mcpError(-32003, "Permission denied for content:write.", {
          permission: "content:write",
          site: args.site,
        });
      }

      const result = await updateFaqItem(env, {
        site: args.site,
        page: args.page,
        sectionId: args.sectionId,
        index: args.index,
        question: args.question,
        answer: args.answer,
        actor: auth.actor,
      });
      return toolResult(result);
    }

    if (name === "remove_faq_item") {
      if (!hasMcpPermission(auth, "content:write", args.site)) {
        throw mcpError(-32003, "Permission denied for content:write.", {
          permission: "content:write",
          site: args.site,
        });
      }

      const result = await removeFaqItem(env, {
        site: args.site,
        page: args.page,
        sectionId: args.sectionId,
        index: args.index,
        actor: auth.actor,
      });
      return toolResult(result);
    }

    if (name === "reorder_faq_items") {
      if (!hasMcpPermission(auth, "content:write", args.site)) {
        throw mcpError(-32003, "Permission denied for content:write.", {
          permission: "content:write",
          site: args.site,
        });
      }

      const result = await reorderFaqItems(env, {
        site: args.site,
        page: args.page,
        sectionId: args.sectionId,
        order: args.order,
        actor: auth.actor,
      });
      return toolResult(result);
    }

    if (name === "add_text_subsection") {
      if (!hasMcpPermission(auth, "content:write", args.site)) {
        throw mcpError(-32003, "Permission denied for content:write.", {
          permission: "content:write",
          site: args.site,
        });
      }

      const result = await addTextSubsection(env, {
        site: args.site,
        page: args.page,
        sectionId: args.sectionId,
        title: args.title,
        paragraphs: args.paragraphs,
        text: args.text,
        index: args.index,
        position: args.position,
        actor: auth.actor,
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

    if (name === "update_contact_channel") {
      if (!hasMcpPermission(auth, "content:write", args.site)) {
        throw mcpError(-32003, "Permission denied for content:write.", {
          permission: "content:write",
          site: args.site,
        });
      }

      const input = {
        site: args.site,
        page: args.page,
        channel: args.channel,
        actor: auth.actor,
      };
      copyOptionalArg(input, args, "sectionId");
      copyOptionalArg(input, args, "label");
      copyOptionalArg(input, args, "value");
      copyOptionalArg(input, args, "href");
      copyOptionalArg(input, args, "enabled");

      const result = await updateContactChannel(env, input);
      return toolResult(result);
    }

    if (name === "create_image_upload") {
      if (!hasMcpPermission(auth, "content:write", args.site)) {
        throw mcpError(-32003, "Permission denied for content:write.", {
          permission: "content:write",
          site: args.site,
        });
      }

      const result = await createImageUpload(env, {
        site: args.site,
        filename: args.filename,
        mimeType: args.mimeType,
        sizeBytes: args.sizeBytes,
        width: args.width,
        height: args.height,
        alt: args.alt,
        caption: args.caption,
        actor: auth.actor,
      });
      return toolResult(result);
    }

    if (name === "confirm_image_upload") {
      if (!hasMcpPermission(auth, "content:write", args.site)) {
        throw mcpError(-32003, "Permission denied for content:write.", {
          permission: "content:write",
          site: args.site,
        });
      }

      const result = await confirmImageUpload(env, {
        site: args.site,
        uploadId: args.uploadId,
        actor: auth.actor,
      });
      return toolResult(result);
    }

    if (name === "update_image_alt") {
      if (!hasMcpPermission(auth, "content:write", args.site)) {
        throw mcpError(-32003, "Permission denied for content:write.", {
          permission: "content:write",
          site: args.site,
        });
      }

      const result = await updateImageAlt(env, {
        site: args.site,
        assetId: args.assetId,
        alt: args.alt,
        actor: auth.actor,
      });
      return toolResult(result);
    }

    if (name === "replace_image") {
      if (!hasMcpPermission(auth, "content:write", args.site)) {
        throw mcpError(-32003, "Permission denied for content:write.", {
          permission: "content:write",
          site: args.site,
        });
      }

      const input = {
        site: args.site,
        page: args.page,
        sectionId: args.sectionId,
        path: args.path,
        assetId: args.assetId,
        actor: auth.actor,
      };
      copyOptionalArg(input, args, "alt");
      copyOptionalArg(input, args, "caption");
      copyOptionalArg(input, args, "decorative");

      const result = await replaceImage(env, input);
      return toolResult(result);
    }

    if (name === "attach_image_to_section") {
      if (!hasMcpPermission(auth, "content:write", args.site)) {
        throw mcpError(-32003, "Permission denied for content:write.", {
          permission: "content:write",
          site: args.site,
        });
      }

      const input = {
        site: args.site,
        page: args.page,
        sectionId: args.sectionId,
        path: args.path,
        assetId: args.assetId,
        actor: auth.actor,
      };
      copyOptionalArg(input, args, "alt");
      copyOptionalArg(input, args, "caption");
      copyOptionalArg(input, args, "variant");
      copyOptionalArg(input, args, "decorative");

      const result = await attachImageToSection(env, input);
      return toolResult(result);
    }

    if (name === "set_image_focal_point") {
      if (!hasMcpPermission(auth, "content:write", args.site)) {
        throw mcpError(-32003, "Permission denied for content:write.", {
          permission: "content:write",
          site: args.site,
        });
      }

      const result = await setImageFocalPoint(env, {
        site: args.site,
        page: args.page,
        sectionId: args.sectionId,
        path: args.path,
        x: args.x,
        y: args.y,
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

function copyOptionalArg(target, source, key) {
  if (Object.prototype.hasOwnProperty.call(Object(source), key)) {
    target[key] = source[key];
  }
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
  return message.includes("no such table: pages")
    || message.includes("no such table: page_sections")
    || message.includes("no such table: media_assets")
    || message.includes("no such table: media_usages")
    || message.includes("no such table: media_uploads");
}

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      ...JSON_HEADERS,
      ...headers,
    },
  });
}
