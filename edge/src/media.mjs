import { resolveEditableField } from "./page-contracts.mjs";
import {
  MAX_DIRECT_IMAGE_SIZE_BYTES,
  prepareDirectImageUpload,
  prepareImageResponseUpload,
} from "./direct-image-upload.mjs";

const SLUG_PATTERN = /^[a-z0-9-]{1,80}$/;
const SECTION_KEY_PATTERN = /^[a-z0-9_-]{1,80}$/;
const ID_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;
const PUBLIC_MEDIA_FILENAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,180}\.(?:jpg|png|webp|avif)$/;
const IMAGE_PATH_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(?:\[(?:0|[1-9]\d*)\])?(?:\.[A-Za-z][A-Za-z0-9_]*(?:\[(?:0|[1-9]\d*)\])?)*$/;
const MEDIA_STATUSES = new Set(["draft", "ready", "archived", "all"]);
const ALLOWED_IMAGE_MIME_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
]);
const MAX_UPLOAD_SIZE_BYTES = MAX_DIRECT_IMAGE_SIZE_BYTES;
const UPLOAD_TTL_MS = 15 * 60 * 1000;

export async function createImageUpload(env, input) {
  const siteSlug = requiredPattern(input?.site, "site", SLUG_PATTERN);
  const actor = requiredString(input?.actor || "mcp");
  const alt = normalizeAltText(input?.alt);
  const caption = normalizeOptionalText(input?.caption, { maxLength: 120, name: "caption" }) || null;
  const mimeType = "image/png";
  const sizeBytes = 1;
  const width = 1;
  const height = 1;
  const filename = "pending-browser-upload.png";
  const site = await loadSite(env, siteSlug);
  const uploadId = `upload_${crypto.randomUUID()}`;
  const assetId = `asset_${crypto.randomUUID()}`;
  const uploadToken = `mu_${crypto.randomUUID().replaceAll("-", "")}`;
  const uploadTokenHash = await sha256Hex(uploadToken);
  const r2Key = `${site.slug}/uploads/${assetId}/${filename}`;
  const publicUrl = `media/assets/${assetId}/${filename}`;
  const expiresAt = new Date(Date.now() + UPLOAD_TTL_MS).toISOString();

  const asset = {
    id: assetId,
    r2_key: r2Key,
    public_url: publicUrl,
    alt,
    caption,
    width,
    height,
    mime_type: mimeType,
    size_bytes: sizeBytes,
    status: "draft",
    created_at: null,
    updated_at: null,
  };

  await env.DB.prepare(
    `INSERT INTO media_assets (
       id, site_id, r2_key, public_url, alt, caption, width, height, mime_type, size_bytes, status, created_at, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
  )
    .bind(assetId, site.id, r2Key, publicUrl, alt, caption, width, height, mimeType, sizeBytes, "draft")
    .run();

  await env.DB.prepare(
    `INSERT INTO media_uploads (
       id, site_id, asset_id, r2_key, filename, mime_type, size_bytes, upload_token_hash, status, expires_at, created_at, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, datetime('now'), datetime('now'))`,
  )
    .bind(uploadId, site.id, assetId, r2Key, filename, mimeType, sizeBytes, uploadTokenHash, expiresAt)
    .run();

  await insertChangeLog(env, {
    siteId: site.id,
    actor,
    action: "create_image_upload",
    target: `media/${assetId}`,
    before: null,
    after: {
      uploadId,
      asset: serializeAsset(asset),
      status: "pending",
    },
  });

  return {
    site: site.slug,
    upload: {
      id: uploadId,
      status: "pending",
      method: "PUT",
      uploadUrl: `/media/uploads/${uploadId}`,
      uploadPageUrl: buildMediaUploadPageUrl(env, uploadId, uploadToken),
      uploadToken,
      headers: {
        authorization: `Bearer ${uploadToken}`,
      },
      r2Key,
      expiresAt,
      maxSizeBytes: MAX_UPLOAD_SIZE_BYTES,
    },
    nextAction: {
      type: "user_browser_upload",
      message: "Show upload.uploadPageUrl to the user. The browser sends the selected file bytes and real metadata; after the upload finishes, call confirm_image_upload with upload.id, then attach or replace the ready asset.",
      metadataSource: "uploaded_file",
      confirmTool: "confirm_image_upload",
      attachTools: ["attach_image_to_section", "replace_image"],
    },
    asset: serializeAsset(asset),
  };
}

export async function uploadImageFile(env, input, options = {}) {
  const siteSlug = requiredPattern(input?.site, "site", SLUG_PATTERN);
  const actor = requiredString(input?.actor || "mcp");
  const alt = normalizeAltText(input?.alt);
  const caption = normalizeOptionalText(input?.caption, { maxLength: 120, name: "caption" }) || null;
  const site = await loadSite(env, siteSlug);

  if (!env?.MEDIA_BUCKET || typeof env.MEDIA_BUCKET.put !== "function" || typeof env.MEDIA_BUCKET.delete !== "function") {
    throw new Error("R2 binding MEDIA_BUCKET is not configured for direct uploads.");
  }
  if (typeof env.DB?.batch !== "function") {
    throw new Error("D1 batch support is required for direct uploads.");
  }

  const prepared = await prepareDirectImageUpload(input?.file, {
    fetchImpl: options.fetchImpl,
    maxSizeBytes: MAX_UPLOAD_SIZE_BYTES,
  });
  const mimeType = prepared.detectedMimeType;
  const filename = normalizeUploadFilename(prepared.fileName || "chatgpt-image", mimeType);
  const assetId = `asset_${crypto.randomUUID()}`;
  const r2Key = `${site.slug}/uploads/${assetId}/${filename}`;
  const publicUrl = `media/assets/${assetId}/${filename}`;
  let storedObject = null;

  try {
    storedObject = await env.MEDIA_BUCKET.put(r2Key, prepared.stream, {
      httpMetadata: {
        contentType: mimeType,
      },
      customMetadata: {
        assetId,
        siteId: site.id,
        source: "openai_file_param",
      },
    });

    const sizeBytes = normalizeStoredObjectSize(storedObject?.size);
    if (sizeBytes > MAX_UPLOAD_SIZE_BYTES) {
      throw new Error(`Image upload exceeds max size ${MAX_UPLOAD_SIZE_BYTES}.`);
    }
    if (prepared.declaredSizeBytes != null && prepared.declaredSizeBytes !== sizeBytes) {
      throw new Error("Downloaded image size does not match Content-Length.");
    }

    const asset = {
      id: assetId,
      r2_key: r2Key,
      public_url: publicUrl,
      alt,
      caption,
      width: prepared.width,
      height: prepared.height,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      status: "ready",
      created_at: null,
      updated_at: null,
    };
    const serializedAsset = serializeAsset(asset);

    const assetStatement = env.DB.prepare(
      `INSERT INTO media_assets (
         id, site_id, r2_key, public_url, alt, caption, width, height, mime_type, size_bytes, status, created_at, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', datetime('now'), datetime('now'))`,
    ).bind(
      assetId,
      site.id,
      r2Key,
      publicUrl,
      alt,
      caption,
      prepared.width,
      prepared.height,
      mimeType,
      sizeBytes,
    );
    const auditStatement = env.DB.prepare(
      `INSERT INTO change_log (
         id, site_id, actor, action, target, before_json, after_json, created_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).bind(
      crypto.randomUUID(),
      site.id,
      actor,
      "upload_image_file",
      `media/${assetId}`,
      null,
      JSON.stringify(serializedAsset),
    );

    await env.DB.batch([assetStatement, auditStatement]);

    return {
      site: site.slug,
      source: {
        fileId: prepared.fileId,
        fileName: prepared.fileName,
      },
      asset: serializedAsset,
      published: true,
      nextAction: {
        tools: ["attach_image_to_section", "replace_image"],
        message: "The image is ready in the media catalog. Attach it to an image array or replace a contracted image field using asset.id.",
      },
    };
  } catch (error) {
    if (storedObject) {
      try {
        await env.MEDIA_BUCKET.delete(r2Key);
      } catch (cleanupError) {
        throw new Error(`Direct image upload failed and R2 cleanup also failed: ${cleanupError?.message || "unknown error"}`);
      }
    }
    throw error;
  }
}

export async function confirmImageUpload(env, input) {
  const siteSlug = requiredPattern(input?.site, "site", SLUG_PATTERN);
  const uploadId = requiredPattern(input?.uploadId, "uploadId", ID_PATTERN);
  const actor = requiredString(input?.actor || "mcp");
  const site = await loadSite(env, siteSlug);
  const upload = await loadMediaUpload(env, site.id, uploadId);

  if (upload.upload_status !== "pending") {
    throw new Error(`Media upload is not pending: ${uploadId}`);
  }

  if (!env?.MEDIA_BUCKET || typeof env.MEDIA_BUCKET.head !== "function") {
    throw new Error("R2 binding MEDIA_BUCKET is not configured.");
  }

  const object = await env.MEDIA_BUCKET.head(upload.upload_r2_key);
  if (!object) {
    throw new Error("Uploaded object not found in R2.");
  }

  const objectSize = Number(object.size);
  if (objectSize !== Number(upload.upload_size_bytes)) {
    throw new Error("Uploaded object size mismatch.");
  }

  const objectMimeType = object.httpMetadata?.contentType || object.customMetadata?.mime_type || "";
  if (objectMimeType && objectMimeType !== upload.upload_mime_type) {
    throw new Error("Uploaded object MIME type mismatch.");
  }

  const before = serializeUploadAsset(upload);

  await env.DB.prepare(
    `UPDATE media_assets
     SET status = ?, updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind("ready", upload.asset_id)
    .run();

  await env.DB.prepare(
    `UPDATE media_uploads
     SET status = ?, uploaded_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind("uploaded", upload.upload_id)
    .run();

  const after = {
    ...before,
    status: "ready",
  };

  await insertChangeLog(env, {
    siteId: site.id,
    actor,
    action: "confirm_image_upload",
    target: `media/${upload.asset_id}`,
    before,
    after,
  });

  return {
    site: site.slug,
    upload: {
      id: upload.upload_id,
      status: "uploaded",
      r2Key: upload.upload_r2_key,
    },
    asset: after,
    published: true,
  };
}

export async function handleMediaUploadRequest(request, env, segments) {
  const isAssetRoute = segments.length === 4 && segments[1] === "assets";
  const isUploadObjectRoute = segments.length === 3 && segments[1] === "uploads";
  const isUploadFormRoute = segments.length === 4 && segments[1] === "uploads" && segments[3] === "form";

  if (!isAssetRoute && !isUploadObjectRoute && !isUploadFormRoute) {
    return json({ error: "not_found", message: "Media route not found." }, 404);
  }

  if (isAssetRoute) {
    return handleMediaAssetRequest(request, env, segments);
  }

  const uploadId = String(segments[2] ?? "").trim();
  if (!ID_PATTERN.test(uploadId)) {
    return json({ error: "invalid_upload", message: "Invalid upload id." }, 400);
  }

  if (isUploadFormRoute) {
    return handleMediaUploadFormRequest(request, uploadId);
  }

  if (request.method !== "PUT") {
    return json({ error: "method_not_allowed", message: "Use PUT for media uploads." }, 405);
  }

  if (!env?.DB) {
    return json({ error: "missing_db", message: "D1 binding DB is not configured." }, 500);
  }

  if (!env?.MEDIA_BUCKET || typeof env.MEDIA_BUCKET.put !== "function") {
    return json({ error: "missing_media_bucket", message: "R2 binding MEDIA_BUCKET is not configured." }, 500);
  }

  const upload = await loadMediaUploadById(env, uploadId);
  if (!upload) {
    return json({ error: "upload_not_found", message: "Upload session not found." }, 404);
  }

  if (upload.status !== "pending") {
    return json({ error: "upload_not_pending", message: "Upload session is not pending." }, 409);
  }

  if (isExpiredUpload(upload.expires_at)) {
    return json({ error: "upload_expired", message: "Upload session has expired." }, 410);
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
  if (!token || !await timingSafeHashEqual(token, upload.upload_token_hash)) {
    return json({ error: "invalid_upload_token", message: "Invalid upload token." }, 401);
  }

  return storeBrowserImageUpload(request, env, upload);
}

async function storeBrowserImageUpload(request, env, upload) {
  if (!request.body) {
    return json({ error: "missing_upload_body", message: "Upload body is required." }, 400);
  }

  const contentType = normalizeHeaderContentType(request.headers.get("content-type"));
  const expectedMimeType = ALLOWED_IMAGE_MIME_TYPES.has(contentType) ? contentType : null;
  if (contentType && contentType !== "application/octet-stream" && !expectedMimeType) {
    return json({ error: "invalid_content_type", message: "Unsupported image content type." }, 415);
  }

  let prepared;
  try {
    prepared = await prepareImageResponseUpload(
      new Response(request.body, { headers: request.headers }),
      {
        expectedMimeType,
        maxSizeBytes: MAX_UPLOAD_SIZE_BYTES,
      },
    );
  } catch (error) {
    return json({ error: "invalid_image", message: error?.message || "Invalid image upload." }, 415);
  }

  let sourceFilename;
  try {
    const encodedFilename = request.headers.get("x-file-name") || "browser-image";
    sourceFilename = decodeURIComponent(encodedFilename);
  } catch {
    return json({ error: "invalid_filename", message: "Invalid image filename." }, 400);
  }

  let filename;
  try {
    filename = normalizeUploadFilename(sourceFilename, prepared.detectedMimeType);
  } catch (error) {
    return json({ error: "invalid_filename", message: error?.message || "Invalid image filename." }, 400);
  }

  const siteSlug = await loadSiteSlugById(env, upload.site_id);
  const r2Key = `${siteSlug}/uploads/${upload.asset_id}/${filename}`;
  const publicUrl = `media/assets/${upload.asset_id}/${filename}`;
  let storedObject = null;

  try {
    storedObject = await env.MEDIA_BUCKET.put(r2Key, prepared.stream, {
      httpMetadata: {
        contentType: prepared.detectedMimeType,
      },
      customMetadata: {
        uploadId: upload.id,
        assetId: upload.asset_id,
        siteId: upload.site_id,
        source: "browser_fallback",
      },
    });

    const sizeBytes = normalizeStoredObjectSize(storedObject?.size);
    if (prepared.declaredSizeBytes != null && prepared.declaredSizeBytes !== sizeBytes) {
      throw new Error("Uploaded image size does not match Content-Length.");
    }
    if (typeof env.DB.batch !== "function") {
      throw new Error("D1 batch support is required for browser uploads.");
    }

    const uploadStatement = env.DB.prepare(
      `UPDATE media_uploads
       SET r2_key = ?, filename = ?, mime_type = ?, size_bytes = ?, updated_at = datetime('now')
       WHERE id = ?`,
    ).bind(r2Key, filename, prepared.detectedMimeType, sizeBytes, upload.id);
    const assetStatement = env.DB.prepare(
      `UPDATE media_assets
       SET r2_key = ?, public_url = ?, width = ?, height = ?, mime_type = ?, size_bytes = ?, updated_at = datetime('now')
       WHERE id = ?`,
    ).bind(
      r2Key,
      publicUrl,
      prepared.width,
      prepared.height,
      prepared.detectedMimeType,
      sizeBytes,
      upload.asset_id,
    );

    await env.DB.batch([uploadStatement, assetStatement]);

    return json({
      uploadId: upload.id,
      status: "stored",
      r2Key,
      file: {
        name: filename,
        mimeType: prepared.detectedMimeType,
        sizeBytes,
        width: prepared.width,
        height: prepared.height,
      },
    });
  } catch (error) {
    if (storedObject) {
      try {
        await env.MEDIA_BUCKET.delete(r2Key);
      } catch {
        // The primary upload failure remains the useful error for this one-shot fallback.
      }
    }
    const message = error?.message || "Browser image upload failed.";
    const status = /exceeds max size|Content-Length/.test(message) ? 413 : 500;
    return json({ error: "browser_upload_failed", message }, status);
  }
}

async function loadSiteSlugById(env, siteId) {
  const site = await env.DB.prepare(
    `SELECT slug FROM sites WHERE id = ? LIMIT 1`,
  )
    .bind(siteId)
    .first();

  if (!site?.slug) {
    throw new Error("Media upload site not found.");
  }
  return site.slug;
}

async function handleMediaAssetRequest(request, env, segments) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return json({ error: "method_not_allowed", message: "Use GET or HEAD for media assets." }, 405);
  }

  if (!env?.DB) {
    return json({ error: "missing_db", message: "D1 binding DB is not configured." }, 500);
  }

  if (!env?.MEDIA_BUCKET || typeof env.MEDIA_BUCKET.get !== "function") {
    return json({ error: "missing_media_bucket", message: "R2 binding MEDIA_BUCKET is not configured." }, 500);
  }

  const assetId = String(segments[2] ?? "").trim();
  const filename = String(segments[3] ?? "").trim().toLowerCase();
  if (!ID_PATTERN.test(assetId) || !PUBLIC_MEDIA_FILENAME_PATTERN.test(filename)) {
    return json({ error: "invalid_media_asset", message: "Invalid media asset path." }, 400);
  }

  const publicPath = `media/assets/${assetId}/${filename}`;
  const asset = await loadReadyMediaAssetByPublicPath(env, publicPath, assetId);
  if (!asset?.r2_key) {
    return json({ error: "media_asset_not_found", message: "Media asset not found." }, 404);
  }

  const object = request.method === "HEAD" && typeof env.MEDIA_BUCKET.head === "function"
    ? await env.MEDIA_BUCKET.head(asset.r2_key)
    : await env.MEDIA_BUCKET.get(asset.r2_key);

  if (!object) {
    return json({ error: "media_asset_not_found", message: "Media asset not found." }, 404);
  }

  return new Response(request.method === "HEAD" ? null : object.body, {
    status: 200,
    headers: mediaAssetResponseHeaders(object, asset),
  });
}

function mediaAssetResponseHeaders(object, asset) {
  const headers = new Headers();
  if (typeof object.writeHttpMetadata === "function") {
    object.writeHttpMetadata(headers);
  }

  const contentType = normalizeHeaderContentType(
    headers.get("content-type") || object.httpMetadata?.contentType || asset.mime_type,
  );
  headers.set("content-type", ALLOWED_IMAGE_MIME_TYPES.has(contentType) ? contentType : asset.mime_type);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("content-disposition", "inline");
  headers.set("x-content-type-options", "nosniff");
  if (Number.isFinite(Number(object.size)) && Number(object.size) >= 0) {
    headers.set("content-length", String(Number(object.size)));
  }
  if (object.httpEtag) headers.set("etag", object.httpEtag);
  return headers;
}

function handleMediaUploadFormRequest(request, uploadId) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return json({ error: "method_not_allowed", message: "Use GET for the media upload form." }, 405);
  }

  return html(renderMediaUploadForm(uploadId), 200, { head: request.method === "HEAD" });
}

function renderMediaUploadForm(uploadId) {
  const escapedUploadId = escapeHtml(uploadId);
  const escapedUploadIdAttribute = escapeAttribute(uploadId);

  return `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Lorenzo Zanna Media Upload</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, sans-serif; background: #f7f6f2; color: #171717; }
    main { width: min(92vw, 460px); border: 1px solid #d8d4ca; background: #fff; padding: 28px; }
    h1 { margin: 0 0 12px; font-size: 24px; line-height: 1.15; }
    p { margin: 0 0 16px; line-height: 1.5; }
    code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; overflow-wrap: anywhere; }
    input { display: block; width: 100%; margin: 18px 0; font: inherit; }
    button { width: 100%; min-height: 44px; border: 0; background: #171717; color: #fff; font: inherit; cursor: pointer; }
    button:disabled { opacity: .55; cursor: wait; }
    output { display: block; min-height: 22px; margin-top: 14px; line-height: 1.45; }
  </style>
</head>
<body>
  <main>
    <h1>Lorenzo Zanna Media Upload</h1>
    <p>Seleziona il file immagine richiesto nella chat. Questa pagina puo caricare solo la sessione <code>${escapedUploadId}</code>.</p>
    <input id="file" type="file" accept="image/jpeg,image/png,image/webp,image/avif" />
    <button id="upload" type="button">Carica immagine</button>
    <output id="status" role="status"></output>
  </main>
  <script>
    const uploadId = "${escapedUploadIdAttribute}";
    const fileInput = document.getElementById("file");
    const uploadButton = document.getElementById("upload");
    const statusOutput = document.getElementById("status");

    function uploadToken() {
      const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
      const params = new URLSearchParams(hash);
      return params.get("token") || hash;
    }

    function setStatus(message) {
      statusOutput.textContent = message;
    }

    uploadButton.addEventListener("click", async () => {
      const token = uploadToken();
      const file = fileInput.files && fileInput.files[0];

      if (!token) {
        setStatus("Token upload mancante. Torna in chat e apri il link completo.");
        return;
      }

      if (!file) {
        setStatus("Scegli prima un file immagine.");
        return;
      }

      uploadButton.disabled = true;
      setStatus("Upload in corso...");

      try {
        const response = await fetch("/media/uploads/" + encodeURIComponent(uploadId), {
          method: "PUT",
          headers: {
            authorization: "Bearer " + token,
            "content-type": file.type || "application/octet-stream",
            "x-file-name": encodeURIComponent(file.name || "browser-image"),
          },
          body: file,
        });
        const text = await response.text();
        if (!response.ok) throw new Error(text || "HTTP " + response.status);
        setStatus("Upload completato. Torna in chat e chiedi di confermare e collegare l'immagine.");
      } catch (error) {
        setStatus("Upload non riuscito: " + error.message);
      } finally {
        uploadButton.disabled = false;
      }
    });
  </script>
</body>
</html>`;
}
export async function listMediaAssets(env, input) {
  const siteSlug = requiredPattern(input?.site, "site", SLUG_PATTERN);
  const status = normalizeStatus(input?.status ?? "ready");
  const limit = normalizeLimit(input?.limit ?? 50);
  const query = normalizeMediaSearchQuery(input?.query);
  const searchPattern = `%${escapeLikePattern(query.toLowerCase())}%`;
  const site = await loadSite(env, siteSlug);

  const rows = await env.DB.prepare(
    `SELECT id, r2_key, public_url, title, tags_json, notes, alt, caption, width, height, mime_type, size_bytes, status, created_at, updated_at
     FROM media_assets
     WHERE site_id = ?
       AND (? = 'all' OR status = ?)
       AND (
         ? = ''
         OR LOWER(
           COALESCE(title, '') || ' ' ||
           COALESCE(tags_json, '') || ' ' ||
           COALESCE(notes, '') || ' ' ||
           COALESCE(alt, '') || ' ' ||
           COALESCE(caption, '') || ' ' ||
           COALESCE(public_url, '')
         ) LIKE ? ESCAPE '!'
       )
     ORDER BY updated_at DESC, id ASC
     LIMIT ?`,
  )
    .bind(site.id, status, status, query, searchPattern, limit)
    .all();

  const assets = (rows.results ?? []).map(serializeAsset);
  return {
    site: site.slug,
    status,
    query,
    count: assets.length,
    assets,
  };
}

export async function updateMediaAsset(env, input) {
  const siteSlug = requiredPattern(input?.site, "site", SLUG_PATTERN);
  const assetId = requiredPattern(input?.assetId, "assetId", ID_PATTERN);
  const actor = requiredString(input?.actor || "mcp");
  const metadataKeys = ["title", "tags", "notes"];
  if (!metadataKeys.some((key) => hasOwn(input, key))) {
    throw new Error("At least one media metadata field is required.");
  }

  const site = await loadSite(env, siteSlug);
  const asset = await loadMediaAsset(env, site.id, assetId);
  const before = serializeAsset(asset);
  const title = hasOwn(input, "title")
    ? normalizeOptionalText(input.title, { maxLength: 120, name: "title" }) || null
    : before.title;
  const tags = hasOwn(input, "tags") ? normalizeMediaTags(input.tags) : before.tags;
  const notes = hasOwn(input, "notes")
    ? normalizeOptionalText(input.notes, { maxLength: 1000, name: "notes" }) || null
    : before.notes;

  if (title === before.title && notes === before.notes && JSON.stringify(tags) === JSON.stringify(before.tags)) {
    throw new Error("Media metadata is unchanged.");
  }

  await env.DB.prepare(
    `UPDATE media_assets
     SET title = ?, tags_json = ?, notes = ?, updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(title, JSON.stringify(tags), notes, asset.id)
    .run();

  const after = {
    ...before,
    title,
    tags,
    notes,
  };

  await insertChangeLog(env, {
    siteId: site.id,
    actor,
    action: "update_media_asset",
    target: `media/${asset.id}/metadata`,
    before,
    after,
  });

  return {
    site: site.slug,
    asset: after,
    published: asset.status === "ready",
  };
}

export async function setMediaAssetArchived(env, input) {
  const siteSlug = requiredPattern(input?.site, "site", SLUG_PATTERN);
  const assetId = requiredPattern(input?.assetId, "assetId", ID_PATTERN);
  const actor = requiredString(input?.actor || "mcp");
  const archived = normalizeBoolean(input?.archived, "archived");
  const site = await loadSite(env, siteSlug);
  const asset = await loadMediaAsset(env, site.id, assetId);
  const before = serializeAsset(asset);
  const targetStatus = archived ? "archived" : "ready";

  if (asset.status === targetStatus) {
    throw new Error(`Media asset is already ${targetStatus}.`);
  }

  const usage = await env.DB.prepare(
    `SELECT COUNT(*) AS usage_count
     FROM media_usages
     WHERE asset_id = ?`,
  )
    .bind(asset.id)
    .first();
  const usageCount = Number(usage?.usage_count ?? 0);

  if (archived) {
    if (asset.status !== "ready") {
      throw new Error("Only ready media assets can be archived.");
    }
    if (usageCount > 0) {
      throw new Error(`Media asset is still in use at ${usageCount} path(s).`);
    }
  } else if (asset.status !== "archived") {
    throw new Error("Only archived media assets can be restored.");
  }

  await env.DB.prepare(
    `UPDATE media_assets
     SET status = ?, updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(targetStatus, asset.id)
    .run();

  const after = {
    ...before,
    status: targetStatus,
  };

  await insertChangeLog(env, {
    siteId: site.id,
    actor,
    action: archived ? "archive_media_asset" : "restore_media_asset",
    target: `media/${asset.id}/status`,
    before,
    after,
  });

  return {
    site: site.slug,
    asset: after,
    archived,
    usageCount,
    published: targetStatus === "ready",
  };
}

export async function deleteMediaAsset(env, input) {
  if (input?.confirm !== true) {
    throw new Error("Explicit confirmation is required to permanently delete a media asset.");
  }

  const siteSlug = requiredPattern(input?.site, "site", SLUG_PATTERN);
  const assetId = requiredPattern(input?.assetId, "assetId", ID_PATTERN);
  const actor = requiredString(input?.actor || "mcp");
  const site = await loadSite(env, siteSlug);
  const asset = await loadMediaAsset(env, site.id, assetId);

  if (asset.status !== "archived") {
    throw new Error("Only archived media assets can be permanently deleted.");
  }

  const usage = await env.DB.prepare(
    `SELECT COUNT(*) AS usage_count
     FROM media_usages
     WHERE asset_id = ?`,
  )
    .bind(asset.id)
    .first();
  const usageCount = Number(usage?.usage_count ?? 0);
  if (usageCount > 0) {
    throw new Error(`Media asset is still in use at ${usageCount} path(s).`);
  }

  const r2Key = String(asset.r2_key ?? "").trim();
  if (!r2Key) {
    throw new Error("Media asset has no managed R2 object and cannot be permanently deleted.");
  }
  if (!r2Key.startsWith(`${site.slug}/`)) {
    throw new Error("Media asset R2 object is outside the site storage namespace.");
  }
  if (typeof env.MEDIA_BUCKET?.delete !== "function") {
    throw new Error("Media bucket binding is not configured.");
  }
  if (typeof env.DB?.batch !== "function") {
    throw new Error("D1 batch support is required for permanent media deletion.");
  }

  const before = serializeAsset(asset);
  try {
    await env.MEDIA_BUCKET.delete(r2Key);
  } catch (error) {
    throw new Error(`Media R2 deletion failed: ${error?.message || "unknown error"}`);
  }

  const changeId = crypto.randomUUID();
  const eligibilitySql = `id = ? AND site_id = ? AND status = 'archived'
       AND NOT EXISTS (
         SELECT 1 FROM media_usages WHERE asset_id = ?
       )`;
  const auditStatement = env.DB.prepare(
    `INSERT INTO change_log (
       id, site_id, actor, action, target, before_json, after_json, created_at
     )
     SELECT ?, ?, ?, ?, ?, ?, ?, datetime('now')
     WHERE EXISTS (
       SELECT 1 FROM media_assets
       WHERE ${eligibilitySql}
     )`,
  ).bind(
    changeId,
    site.id,
    actor,
    "delete_media_asset",
    `media/${asset.id}`,
    JSON.stringify(before),
    null,
    asset.id,
    site.id,
    asset.id,
  );
  const deleteStatement = env.DB.prepare(
    `DELETE FROM media_assets
     WHERE ${eligibilitySql}`,
  ).bind(asset.id, site.id, asset.id);

  let results;
  try {
    results = await env.DB.batch([auditStatement, deleteStatement]);
  } catch (error) {
    throw new Error(`Media D1 cleanup failed after R2 deletion: ${error?.message || "unknown error"}`);
  }

  const deletedCount = Number(results?.[1]?.meta?.changes ?? results?.[1]?.changes ?? 0);
  if (deletedCount < 1) {
    throw new Error("Media asset changed during deletion; its archived D1 record was retained for a safe retry.");
  }

  return {
    site: site.slug,
    assetId: asset.id,
    deleted: true,
    r2ObjectDeleted: true,
    deletedAsset: before,
  };
}

export async function updateImageAlt(env, input) {
  const siteSlug = requiredPattern(input?.site, "site", SLUG_PATTERN);
  const assetId = requiredPattern(input?.assetId, "assetId", ID_PATTERN);
  const actor = requiredString(input?.actor || "mcp");
  const alt = normalizeAltText(input?.alt);
  const site = await loadSite(env, siteSlug);
  const asset = await loadMediaAsset(env, site.id, assetId);

  const before = serializeAsset(asset);

  await env.DB.prepare(
    `UPDATE media_assets
     SET alt = ?, updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(alt, asset.id)
    .run();

  const after = {
    ...before,
    alt,
  };

  await insertChangeLog(env, {
    siteId: site.id,
    actor,
    action: "update_image_alt",
    target: `media/${asset.id}/alt`,
    before,
    after,
  });

  return {
    site: site.slug,
    asset: after,
    published: true,
  };
}

export async function replaceImage(env, input) {
  return writeImageReference(env, input, "replace_image");
}

export async function attachImageToSection(env, input) {
  const siteSlug = requiredPattern(input?.site, "site", SLUG_PATTERN);
  const pageSlug = requiredPattern(input?.page, "page", SLUG_PATTERN);
  const sectionKey = requiredPattern(input?.sectionId, "sectionId", SECTION_KEY_PATTERN);
  const path = requiredPattern(input?.path, "path", IMAGE_PATH_PATTERN);
  const assetId = requiredPattern(input?.assetId, "assetId", ID_PATTERN);
  const actor = requiredString(input?.actor || "mcp");

  const { site, page, section } = await loadSection(env, siteSlug, pageSlug, sectionKey);
  const field = resolveEditableField(page.slug, section, path);
  if (!field || field.kind !== "media_asset_list") {
    throw new Error(`Field is not editable with attach_image_to_section: ${path}`);
  }

  const asset = await loadMediaAsset(env, site.id, assetId);
  if (asset.status !== "ready") {
    throw new Error(`Media asset is not ready: ${assetId}`);
  }

  const assetPublicUrl = normalizeMediaPublicUrl(asset.public_url);
  const before = serializeSection(section);
  const data = cloneJsonObject(before.data);
  const images = readArrayAtPath(data, path);
  const itemIndex = images.length;
  const imagePath = `${path}[${itemIndex}]`;
  const assetField = resolveEditableField(page.slug, section, `${imagePath}.assetId`);
  if (!assetField || assetField.kind !== "media_asset") {
    throw new Error(`Field is not editable with attach_image_to_section: ${imagePath}.assetId`);
  }

  const decorative = hasOwn(input, "decorative")
    ? normalizeBoolean(input.decorative, "decorative")
    : false;
  const alt = decorative ? "" : normalizeImageAltForReplacement(input, asset);
  const captionField = resolveEditableField(page.slug, section, `${imagePath}.caption`);
  const captionMaxLength = captionField?.maxLength ?? 120;
  const caption = hasOwn(input, "caption")
    ? normalizeOptionalText(input.caption, { maxLength: captionMaxLength, name: "caption" })
    : normalizeOptionalText(asset.caption, { maxLength: captionMaxLength, name: "caption" });
  const variant = normalizeImageVariant(input, page, section, imagePath);

  const nextImage = {
    assetId: asset.id,
    src: assetPublicUrl,
    alt,
    width: positiveInteger(asset.width, "width"),
    height: positiveInteger(asset.height, "height"),
  };

  if (caption) nextImage.caption = caption;
  if (variant) nextImage.variant = variant;
  if (decorative) nextImage.decorative = true;

  images.push(nextImage);

  const revisionId = crypto.randomUUID();
  const after = {
    ...before,
    data,
  };

  await env.DB.prepare(
    `UPDATE page_sections
     SET data = ?, updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(JSON.stringify(data), section.id)
    .run();

  await env.DB.prepare(
    `INSERT INTO media_usages (
       id, asset_id, page_id, section_id, path, created_at, updated_at
     )
     VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(page_id, section_id, path) DO UPDATE SET
       asset_id = excluded.asset_id,
       updated_at = datetime('now')`,
  )
    .bind(crypto.randomUUID(), asset.id, page.id, section.id, imagePath)
    .run();

  await env.DB.prepare(
    `INSERT INTO section_revisions (
       id, section_id, actor, action, before_json, after_json, created_at
     )
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
  )
    .bind(revisionId, section.id, actor, "attach_image_to_section", JSON.stringify(before), JSON.stringify(after))
    .run();

  await insertChangeLog(env, {
    siteId: site.id,
    actor,
    action: "attach_image_to_section",
    target: `pages/${page.slug}/sections/${section.section_key}/${imagePath}`,
    before,
    after,
  });

  return {
    site: site.slug,
    page: page.slug,
    sectionId: section.section_key,
    path,
    imagePath,
    itemIndex,
    asset: serializeAsset(asset),
    image: nextImage,
    revisionId,
    published: true,
    previewUrl: page.slug === "home" ? "/" : `/${page.slug}`,
  };
}

export async function removeImageFromSection(env, input) {
  const siteSlug = requiredPattern(input?.site, "site", SLUG_PATTERN);
  const pageSlug = requiredPattern(input?.page, "page", SLUG_PATTERN);
  const sectionKey = requiredPattern(input?.sectionId, "sectionId", SECTION_KEY_PATTERN);
  const rawPath = requiredPattern(input?.path, "path", IMAGE_PATH_PATTERN);
  const actor = requiredString(input?.actor || "mcp");
  const path = normalizeImageObjectPath(rawPath);
  const { arrayPath, itemIndex } = splitArrayItemPath(path);

  const { site, page, section } = await loadSection(env, siteSlug, pageSlug, sectionKey);
  const field = resolveEditableField(page.slug, section, arrayPath);
  if (!field || field.kind !== "media_asset_list") {
    throw new Error(`Field is not editable with remove_image_from_section: ${rawPath}`);
  }

  const before = serializeSection(section);
  const data = cloneJsonObject(before.data);
  const images = readArrayAtPath(data, arrayPath);
  if (itemIndex >= images.length || !isObjectRecord(images[itemIndex])) {
    throw new Error(`Path does not contain an image object: ${path}`);
  }

  const [removedImage] = images.splice(itemIndex, 1);
  const revisionId = crypto.randomUUID();
  const after = {
    ...before,
    data,
  };

  await env.DB.prepare(
    `UPDATE page_sections
     SET data = ?, updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(JSON.stringify(data), section.id)
    .run();

  await syncSectionMediaUsages(env, page.id, section.id, data);

  await env.DB.prepare(
    `INSERT INTO section_revisions (
       id, section_id, actor, action, before_json, after_json, created_at
     )
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
  )
    .bind(revisionId, section.id, actor, "remove_image_from_section", JSON.stringify(before), JSON.stringify(after))
    .run();

  await insertChangeLog(env, {
    siteId: site.id,
    actor,
    action: "remove_image_from_section",
    target: `pages/${page.slug}/sections/${section.section_key}/${path}`,
    before,
    after,
  });

  return {
    site: site.slug,
    page: page.slug,
    sectionId: section.section_key,
    path,
    arrayPath,
    itemIndex,
    removedImage,
    remainingCount: images.length,
    revisionId,
    published: true,
    previewUrl: page.slug === "home" ? "/" : `/${page.slug}`,
  };
}

export async function reorderImagesInSection(env, input) {
  const siteSlug = requiredPattern(input?.site, "site", SLUG_PATTERN);
  const pageSlug = requiredPattern(input?.page, "page", SLUG_PATTERN);
  const sectionKey = requiredPattern(input?.sectionId, "sectionId", SECTION_KEY_PATTERN);
  const path = requiredPattern(input?.path, "path", IMAGE_PATH_PATTERN);
  const actor = requiredString(input?.actor || "mcp");

  const { site, page, section } = await loadSection(env, siteSlug, pageSlug, sectionKey);
  const field = resolveEditableField(page.slug, section, path);
  if (!field || field.kind !== "media_asset_list") {
    throw new Error(`Field is not editable with reorder_images_in_section: ${path}`);
  }

  const before = serializeSection(section);
  const data = cloneJsonObject(before.data);
  const images = readArrayAtPath(data, path);
  const order = normalizeImageOrder(input?.order, images.length);
  if (order.every((itemIndex, index) => itemIndex === index)) {
    throw new Error("Image order is unchanged.");
  }

  const reorderedImages = order.map((itemIndex) => images[itemIndex]);
  images.splice(0, images.length, ...reorderedImages);
  const revisionId = crypto.randomUUID();
  const after = {
    ...before,
    data,
  };

  await env.DB.prepare(
    `UPDATE page_sections
     SET data = ?, updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(JSON.stringify(data), section.id)
    .run();

  await syncSectionMediaUsages(env, page.id, section.id, data);

  await env.DB.prepare(
    `INSERT INTO section_revisions (
       id, section_id, actor, action, before_json, after_json, created_at
     )
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
  )
    .bind(revisionId, section.id, actor, "reorder_images_in_section", JSON.stringify(before), JSON.stringify(after))
    .run();

  await insertChangeLog(env, {
    siteId: site.id,
    actor,
    action: "reorder_images_in_section",
    target: `pages/${page.slug}/sections/${section.section_key}/${path}`,
    before,
    after,
  });

  return {
    site: site.slug,
    page: page.slug,
    sectionId: section.section_key,
    path,
    order,
    count: images.length,
    images,
    revisionId,
    published: true,
    previewUrl: page.slug === "home" ? "/" : `/${page.slug}`,
  };
}

export async function updateImageCaption(env, input) {
  const siteSlug = requiredPattern(input?.site, "site", SLUG_PATTERN);
  const pageSlug = requiredPattern(input?.page, "page", SLUG_PATTERN);
  const sectionKey = requiredPattern(input?.sectionId, "sectionId", SECTION_KEY_PATTERN);
  const rawPath = requiredPattern(input?.path, "path", IMAGE_PATH_PATTERN);
  const actor = requiredString(input?.actor || "mcp");
  const path = normalizeCaptionImageObjectPath(rawPath);
  const captionPath = `${path}.caption`;

  if (!hasOwn(input, "caption") || typeof input.caption !== "string") {
    throw new Error("Missing caption.");
  }

  const { site, page, section } = await loadSection(env, siteSlug, pageSlug, sectionKey);
  const field = resolveEditableField(page.slug, section, captionPath);
  if (!field || field.kind !== "plain_text") {
    throw new Error(`Field is not editable with update_image_caption: ${rawPath}`);
  }

  const caption = normalizeOptionalText(input.caption, {
    maxLength: field.maxLength ?? 120,
    name: "caption",
  });
  const before = serializeSection(section);
  const data = cloneJsonObject(before.data);
  const currentImage = readObjectAtPath(data, path);
  const nextImage = {
    ...currentImage,
  };

  if (caption) nextImage.caption = caption;
  else delete nextImage.caption;

  setValueAtPath(data, path, nextImage);

  const revisionId = crypto.randomUUID();
  const after = {
    ...before,
    data,
  };

  await env.DB.prepare(
    `UPDATE page_sections
     SET data = ?, updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(JSON.stringify(data), section.id)
    .run();

  await env.DB.prepare(
    `INSERT INTO section_revisions (
       id, section_id, actor, action, before_json, after_json, created_at
     )
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
  )
    .bind(revisionId, section.id, actor, "update_image_caption", JSON.stringify(before), JSON.stringify(after))
    .run();

  await insertChangeLog(env, {
    siteId: site.id,
    actor,
    action: "update_image_caption",
    target: `pages/${page.slug}/sections/${section.section_key}/${path}/caption`,
    before,
    after,
  });

  return {
    site: site.slug,
    page: page.slug,
    sectionId: section.section_key,
    path,
    caption: caption || null,
    image: nextImage,
    revisionId,
    published: true,
    previewUrl: page.slug === "home" ? "/" : `/${page.slug}`,
  };
}

export async function setImageFocalPoint(env, input) {
  const siteSlug = requiredPattern(input?.site, "site", SLUG_PATTERN);
  const pageSlug = requiredPattern(input?.page, "page", SLUG_PATTERN);
  const sectionKey = requiredPattern(input?.sectionId, "sectionId", SECTION_KEY_PATTERN);
  const rawPath = requiredPattern(input?.path, "path", IMAGE_PATH_PATTERN);
  const actor = requiredString(input?.actor || "mcp");
  const path = normalizeFocalPointImageObjectPath(rawPath);
  const focalPath = `${path}.focalPoint`;
  const x = normalizeFocalPercent(input?.x, "x");
  const y = normalizeFocalPercent(input?.y, "y");

  const { site, page, section } = await loadSection(env, siteSlug, pageSlug, sectionKey);
  const field = resolveEditableField(page.slug, section, focalPath);
  if (!field || field.kind !== "focal_point") {
    throw new Error(`Field is not editable with set_image_focal_point: ${rawPath}`);
  }

  const before = serializeSection(section);
  const data = cloneJsonObject(before.data);
  const storedImage = readValueAtPath(data, path);
  if (storedImage != null && !isObjectRecord(storedImage)) {
    throw new Error(`Path does not contain an image object: ${path}`);
  }

  const nextImage = {
    ...(storedImage ?? {}),
    focalPoint: { x, y },
  };

  setValueAtPath(data, path, nextImage);

  const revisionId = crypto.randomUUID();
  const after = {
    ...before,
    data,
  };

  await env.DB.prepare(
    `UPDATE page_sections
     SET data = ?, updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(JSON.stringify(data), section.id)
    .run();

  await env.DB.prepare(
    `INSERT INTO section_revisions (
       id, section_id, actor, action, before_json, after_json, created_at
     )
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
  )
    .bind(revisionId, section.id, actor, "set_image_focal_point", JSON.stringify(before), JSON.stringify(after))
    .run();

  await insertChangeLog(env, {
    siteId: site.id,
    actor,
    action: "set_image_focal_point",
    target: `pages/${page.slug}/sections/${section.section_key}/${path}/focalPoint`,
    before,
    after,
  });

  return {
    site: site.slug,
    page: page.slug,
    sectionId: section.section_key,
    path,
    focalPoint: { x, y },
    image: nextImage,
    revisionId,
    published: true,
    previewUrl: page.slug === "home" ? "/" : `/${page.slug}`,
  };
}

export async function setImageVisibility(env, input) {
  const siteSlug = requiredPattern(input?.site, "site", SLUG_PATTERN);
  const pageSlug = requiredPattern(input?.page, "page", SLUG_PATTERN);
  const sectionKey = requiredPattern(input?.sectionId, "sectionId", SECTION_KEY_PATTERN);
  const rawPath = requiredPattern(input?.path, "path", IMAGE_PATH_PATTERN);
  const actor = requiredString(input?.actor || "mcp");
  const enabled = normalizeBoolean(input?.enabled, "enabled");
  const path = normalizeVisibilityImageObjectPath(rawPath);
  const enabledPath = `${path}.enabled`;

  const { site, page, section } = await loadSection(env, siteSlug, pageSlug, sectionKey);
  const field = resolveEditableField(page.slug, section, enabledPath);
  if (!field || field.kind !== "boolean") {
    throw new Error(`Field is not editable with set_image_visibility: ${rawPath}`);
  }

  const before = serializeSection(section);
  const data = cloneJsonObject(before.data);
  const currentImage = readObjectAtPath(data, path);
  const nextImage = {
    ...currentImage,
    enabled,
  };

  setValueAtPath(data, path, nextImage);

  const revisionId = crypto.randomUUID();
  const after = {
    ...before,
    data,
  };

  await env.DB.prepare(
    `UPDATE page_sections
     SET data = ?, updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(JSON.stringify(data), section.id)
    .run();

  await env.DB.prepare(
    `INSERT INTO section_revisions (
       id, section_id, actor, action, before_json, after_json, created_at
     )
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
  )
    .bind(revisionId, section.id, actor, "set_image_visibility", JSON.stringify(before), JSON.stringify(after))
    .run();

  await insertChangeLog(env, {
    siteId: site.id,
    actor,
    action: "set_image_visibility",
    target: `pages/${page.slug}/sections/${section.section_key}/${path}/enabled`,
    before,
    after,
  });

  return {
    site: site.slug,
    page: page.slug,
    sectionId: section.section_key,
    path,
    enabled,
    image: nextImage,
    revisionId,
    published: true,
    previewUrl: page.slug === "home" ? "/" : `/${page.slug}`,
  };
}

async function writeImageReference(env, input, action) {
  const siteSlug = requiredPattern(input?.site, "site", SLUG_PATTERN);
  const pageSlug = requiredPattern(input?.page, "page", SLUG_PATTERN);
  const sectionKey = requiredPattern(input?.sectionId, "sectionId", SECTION_KEY_PATTERN);
  const rawPath = requiredPattern(input?.path, "path", IMAGE_PATH_PATTERN);
  const assetId = requiredPattern(input?.assetId, "assetId", ID_PATTERN);
  const actor = requiredString(input?.actor || "mcp");
  const path = normalizeImageObjectPath(rawPath);
  const assetPath = `${path}.assetId`;

  const { site, page, section } = await loadSection(env, siteSlug, pageSlug, sectionKey);
  const field = resolveEditableField(page.slug, section, assetPath);
  if (!field || field.kind !== "media_asset") {
    throw new Error(`Field is not editable with ${action}: ${rawPath}`);
  }

  const asset = await loadMediaAsset(env, site.id, assetId);
  if (asset.status !== "ready") {
    throw new Error(`Media asset is not ready: ${assetId}`);
  }

  const assetPublicUrl = normalizeMediaPublicUrl(asset.public_url);
  const before = serializeSection(section);
  const data = cloneJsonObject(before.data);
  const currentImage = readObjectAtPath(data, path);
  const decorative = hasOwn(input, "decorative")
    ? normalizeBoolean(input.decorative, "decorative")
    : currentImage.decorative === true;
  const alt = decorative ? "" : normalizeImageAltForReplacement(input, asset);
  const caption = hasOwn(input, "caption")
    ? normalizeOptionalText(input.caption, { maxLength: 120, name: "caption" })
    : normalizeOptionalText(asset.caption, { maxLength: 120, name: "caption" });

  const nextImage = {
    ...currentImage,
    assetId: asset.id,
    src: assetPublicUrl,
    alt,
    width: positiveInteger(asset.width, "width"),
    height: positiveInteger(asset.height, "height"),
  };

  if (caption) nextImage.caption = caption;
  if (decorative) nextImage.decorative = true;
  if (!decorative && hasOwn(nextImage, "decorative")) nextImage.decorative = false;

  setValueAtPath(data, path, nextImage);

  const revisionId = crypto.randomUUID();
  const after = {
    ...before,
    data,
  };

  await env.DB.prepare(
    `UPDATE page_sections
     SET data = ?, updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(JSON.stringify(data), section.id)
    .run();

  await env.DB.prepare(
    `INSERT INTO media_usages (
       id, asset_id, page_id, section_id, path, created_at, updated_at
     )
     VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(page_id, section_id, path) DO UPDATE SET
       asset_id = excluded.asset_id,
       updated_at = datetime('now')`,
  )
    .bind(crypto.randomUUID(), asset.id, page.id, section.id, path)
    .run();

  await env.DB.prepare(
    `INSERT INTO section_revisions (
       id, section_id, actor, action, before_json, after_json, created_at
     )
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
  )
    .bind(revisionId, section.id, actor, action, JSON.stringify(before), JSON.stringify(after))
    .run();

  await insertChangeLog(env, {
    siteId: site.id,
    actor,
    action,
    target: `pages/${page.slug}/sections/${section.section_key}/${path}`,
    before,
    after,
  });

  return {
    site: site.slug,
    page: page.slug,
    sectionId: section.section_key,
    path,
    asset: serializeAsset(asset),
    image: nextImage,
    revisionId,
    published: true,
    previewUrl: page.slug === "home" ? "/" : `/${page.slug}`,
  };
}

async function loadSite(env, siteSlug) {
  if (!env?.DB) {
    throw new Error("D1 binding DB is not configured.");
  }

  const site = await env.DB.prepare("SELECT id, slug FROM sites WHERE slug = ?")
    .bind(siteSlug)
    .first();

  if (!site) {
    throw new Error(`Site not found: ${siteSlug}`);
  }

  return site;
}

async function loadSection(env, siteSlug, pageSlug, sectionKey) {
  const site = await loadSite(env, siteSlug);
  const page = await env.DB.prepare("SELECT id, slug, title FROM pages WHERE site_id = ? AND slug = ?")
    .bind(site.id, pageSlug)
    .first();

  if (!page) {
    throw new Error(`Page not found: ${pageSlug}`);
  }

  const section = await env.DB.prepare(
    `SELECT id, section_key, type, section_order, enabled, data
     FROM page_sections
     WHERE page_id = ? AND section_key = ?`,
  )
    .bind(page.id, sectionKey)
    .first();

  if (!section) {
    throw new Error(`Section not found: ${pageSlug}/${sectionKey}`);
  }

  return { site, page, section };
}

async function loadMediaAsset(env, siteId, assetId) {
  const asset = await env.DB.prepare(
    `SELECT id, r2_key, public_url, title, tags_json, notes, alt, caption, width, height, mime_type, size_bytes, status, created_at, updated_at
     FROM media_assets
     WHERE site_id = ? AND id = ?
     LIMIT 1`,
  )
    .bind(siteId, assetId)
    .first();

  if (!asset) {
    throw new Error(`Media asset not found: ${assetId}`);
  }

  return asset;
}

async function loadReadyMediaAssetByPublicPath(env, publicPath, assetId) {
  return await env.DB.prepare(
    `SELECT id, r2_key, public_url, title, tags_json, notes, alt, caption, width, height, mime_type, size_bytes, status, created_at, updated_at
     FROM media_assets
     WHERE public_url = ? AND id = ? AND status = 'ready'
     LIMIT 1`,
  )
    .bind(publicPath, assetId)
    .first();
}
async function loadMediaUpload(env, siteId, uploadId) {
  const upload = await env.DB.prepare(
    `SELECT
       u.id AS upload_id,
       u.status AS upload_status,
       u.r2_key AS upload_r2_key,
       u.filename AS upload_filename,
       u.mime_type AS upload_mime_type,
       u.size_bytes AS upload_size_bytes,
       u.expires_at AS upload_expires_at,
       a.id AS asset_id,
       a.r2_key AS asset_r2_key,
       a.public_url AS asset_public_url,
       a.alt AS asset_alt,
       a.caption AS asset_caption,
       a.width AS asset_width,
       a.height AS asset_height,
       a.mime_type AS asset_mime_type,
       a.size_bytes AS asset_size_bytes,
       a.status AS asset_status,
       a.created_at AS asset_created_at,
       a.updated_at AS asset_updated_at
     FROM media_uploads u
     JOIN media_assets a ON a.id = u.asset_id
     WHERE u.site_id = ? AND u.id = ?
     LIMIT 1`,
  )
    .bind(siteId, uploadId)
    .first();

  if (!upload) {
    throw new Error(`Media upload not found: ${uploadId}`);
  }

  return upload;
}

async function loadMediaUploadById(env, uploadId) {
  const upload = await env.DB.prepare(
    `SELECT id, site_id, asset_id, r2_key, filename, mime_type, size_bytes, upload_token_hash, status, expires_at
     FROM media_uploads
     WHERE id = ?
     LIMIT 1`,
  )
    .bind(uploadId)
    .first();

  return upload ?? null;
}

async function insertChangeLog(env, options) {
  await env.DB.prepare(
    `INSERT INTO change_log (
       id, site_id, actor, action, target, before_json, after_json, created_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  )
    .bind(
      crypto.randomUUID(),
      options.siteId,
      options.actor,
      options.action,
      options.target,
      options.before == null ? null : JSON.stringify(options.before),
      options.after == null ? null : JSON.stringify(options.after),
    )
    .run();
}

function serializeSection(section) {
  return {
    id: section.id,
    sectionId: section.section_key,
    type: section.type,
    order: Number(section.section_order),
    enabled: Number(section.enabled) === 1,
    data: safeJson(section.data) ?? {},
  };
}

function serializeAsset(asset) {
  return {
    id: asset.id,
    r2Key: asset.r2_key ?? null,
    publicUrl: asset.public_url,
    title: asset.title ?? null,
    tags: parseMediaTags(asset.tags_json),
    notes: asset.notes ?? null,
    alt: asset.alt ?? "",
    caption: asset.caption ?? null,
    width: Number(asset.width),
    height: Number(asset.height),
    mimeType: asset.mime_type,
    sizeBytes: Number(asset.size_bytes),
    status: asset.status,
    createdAt: asset.created_at ?? null,
    updatedAt: asset.updated_at ?? null,
  };
}

function serializeUploadAsset(upload) {
  return {
    id: upload.asset_id,
    r2Key: upload.asset_r2_key,
    publicUrl: upload.asset_public_url,
    alt: upload.asset_alt ?? "",
    caption: upload.asset_caption ?? null,
    width: Number(upload.asset_width),
    height: Number(upload.asset_height),
    mimeType: upload.asset_mime_type,
    sizeBytes: Number(upload.asset_size_bytes),
    status: upload.asset_status,
    createdAt: upload.asset_created_at ?? null,
    updatedAt: upload.asset_updated_at ?? null,
  };
}

function normalizeStatus(value) {
  const status = requiredString(value);
  if (!MEDIA_STATUSES.has(status)) {
    throw new Error("Invalid media status.");
  }
  return status;
}

function normalizeLimit(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 100) {
    throw new Error("Invalid limit.");
  }
  return number;
}

function normalizeStoredObjectSize(value) {
  const sizeBytes = Number(value);
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1) {
    throw new Error("R2 did not return a valid stored image size.");
  }
  return sizeBytes;
}

function normalizeMediaSearchQuery(value) {
  if (value == null) return "";
  if (typeof value !== "string") {
    throw new Error("Invalid media search query.");
  }

  const query = value.trim().replace(/\s+/g, " ");
  if ([...query].length > 120) {
    throw new Error("Media search query exceeds max length 120.");
  }
  return query;
}

function escapeLikePattern(value) {
  return value
    .replaceAll("!", "!!")
    .replaceAll("%", "!%")
    .replaceAll("_", "!_");
}

function normalizeMediaTags(value) {
  if (!Array.isArray(value) || value.length > 20) {
    throw new Error("Media tags must be an array with at most 20 items.");
  }

  const tags = [];
  const seen = new Set();
  for (const item of value) {
    const tag = normalizeText(item, { maxLength: 40, name: "tag" });
    const key = tag.toLocaleLowerCase("it");
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

function parseMediaTags(value) {
  const tags = Array.isArray(value) ? value : safeJson(value);
  return Array.isArray(tags) ? tags.filter((tag) => typeof tag === "string") : [];
}

function normalizeUploadFilename(value, mimeType) {
  const raw = requiredString(value);
  const base = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!base) {
    throw new Error("Invalid filename.");
  }

  return `${base}.${ALLOWED_IMAGE_MIME_TYPES.get(mimeType)}`;
}

function normalizeHeaderContentType(value) {
  return String(value ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
}

function isExpiredUpload(value) {
  const expiresAt = Date.parse(String(value ?? ""));
  return !Number.isFinite(expiresAt) || Date.now() > expiresAt;
}

function normalizeImageObjectPath(path) {
  return path.endsWith(".assetId") ? path.slice(0, -".assetId".length) : path;
}

function normalizeFocalPointImageObjectPath(path) {
  if (path.endsWith(".focalPoint")) return path.slice(0, -".focalPoint".length);
  return normalizeImageObjectPath(path);
}

function normalizeVisibilityImageObjectPath(path) {
  if (path.endsWith(".enabled")) return path.slice(0, -".enabled".length);
  return normalizeImageObjectPath(path);
}

function normalizeCaptionImageObjectPath(path) {
  if (path.endsWith(".caption")) return path.slice(0, -".caption".length);
  return normalizeImageObjectPath(path);
}

function splitArrayItemPath(path) {
  const separatorIndex = path.lastIndexOf(".");
  const prefix = separatorIndex === -1 ? "" : `${path.slice(0, separatorIndex)}.`;
  const finalPart = separatorIndex === -1 ? path : path.slice(separatorIndex + 1);
  const match = /^([A-Za-z][A-Za-z0-9_]*)\[((?:0|[1-9]\d*))\]$/.exec(finalPart);
  if (!match || isDangerousKey(match[1])) {
    throw new Error(`Path is not an image array item: ${path}`);
  }

  return {
    arrayPath: `${prefix}${match[1]}`,
    itemIndex: Number(match[2]),
  };
}

function normalizeImageAltForReplacement(input, asset) {
  if (hasOwn(input, "alt")) return normalizeAltText(input.alt);
  if (String(asset.alt ?? "").trim()) return normalizeAltText(asset.alt);
  throw new Error("Alt text is required for non-decorative images.");
}

function normalizeImageVariant(input, page, section, imagePath) {
  if (!hasOwn(input, "variant") || input.variant == null || input.variant === "") {
    return "";
  }

  const variant = requiredString(input.variant);
  const field = resolveEditableField(page.slug, section, `${imagePath}.variant`);
  if (!field || field.kind !== "enum" || !field.values?.includes(variant)) {
    throw new Error("Invalid image variant.");
  }
  return variant;
}

function normalizeImageOrder(value, imageCount) {
  if (!Array.isArray(value) || value.length !== imageCount || imageCount < 1) {
    throw new Error("Image order must include every current image index exactly once.");
  }

  const order = value.map((item) => Number(item));
  const uniqueIndexes = new Set(order);
  const isValid = order.every(
    (itemIndex) => Number.isInteger(itemIndex) && itemIndex >= 0 && itemIndex < imageCount,
  );
  if (!isValid || uniqueIndexes.size !== imageCount) {
    throw new Error("Image order must include every current image index exactly once.");
  }

  return order;
}

function normalizeFocalPercent(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 100) {
    throw new Error(`Invalid focal point ${name}.`);
  }
  return number;
}

function normalizeAltText(value) {
  return normalizeText(value, { maxLength: 180, name: "alt" });
}

function normalizeOptionalText(value, options) {
  if (value == null || value === "") return "";
  return normalizeText(value, options);
}

function normalizeText(value, options) {
  if (typeof value !== "string") {
    throw new Error(`Missing ${options.name}.`);
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`Missing ${options.name}.`);
  }

  if (/<\/?[A-Za-z][^>]*>/.test(normalized)) {
    throw new Error("HTML is not allowed in media text.");
  }

  if (options.maxLength && [...normalized].length > options.maxLength) {
    throw new Error(`${options.name} exceeds max length ${options.maxLength}.`);
  }

  return normalized;
}

function normalizeMediaPublicUrl(value) {
  const normalized = String(value ?? "").trim();
  if (normalized.startsWith("/assets/")) return normalized.slice(1);
  if (normalized.startsWith("assets/")) return normalized;
  if (normalized.startsWith("/media/")) return normalized.slice(1);
  if (normalized.startsWith("media/")) return normalized;
  throw new Error("Invalid media public URL.");
}

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`Invalid media ${name}.`);
  }
  return number;
}

function normalizeBoolean(value, name) {
  if (typeof value !== "boolean") {
    throw new Error(`Invalid ${name}.`);
  }
  return value;
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

function cloneJsonObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid section data.");
  }

  return JSON.parse(JSON.stringify(value));
}

function readObjectAtPath(data, path) {
  const value = readValueAtPath(data, path);
  if (!isObjectRecord(value)) {
    throw new Error(`Path does not contain an image object: ${path}`);
  }
  return value;
}

function readArrayAtPath(data, path) {
  const value = readValueAtPath(data, path);
  if (!Array.isArray(value)) {
    throw new Error(`Path does not contain an image array: ${path}`);
  }
  return value;
}

function readValueAtPath(data, path) {
  const segments = parsePath(path);
  let current = data;

  for (const segment of segments) {
    current = readSegmentValue(current, segment, path);
  }

  return current;
}

function setValueAtPath(data, path, value) {
  const segments = parsePath(path);
  let current = data;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const isLast = index === segments.length - 1;

    if (isLast) {
      setSegmentValue(current, segment, value, path);
      return;
    }

    current = readSegmentValue(current, segment, path);
  }
}

async function syncSectionMediaUsages(env, pageId, sectionId, data) {
  const usages = collectMediaAssetUsages(data);

  await env.DB.prepare(
    `DELETE FROM media_usages
     WHERE page_id = ? AND section_id = ?`,
  )
    .bind(pageId, sectionId)
    .run();

  for (const usage of usages) {
    await env.DB.prepare(
      `INSERT INTO media_usages (
         id, asset_id, page_id, section_id, path, created_at, updated_at
       )
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    )
      .bind(crypto.randomUUID(), usage.assetId, pageId, sectionId, usage.path)
      .run();
  }
}

function collectMediaAssetUsages(data) {
  const usagesByPath = new Map();

  function walk(value, path) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (path) walk(item, `${path}[${index}]`);
      });
      return;
    }

    if (!isObjectRecord(value)) return;

    const assetId = typeof value.assetId === "string" ? value.assetId.trim() : "";
    if (assetId && path) usagesByPath.set(path, assetId);

    for (const [key, child] of Object.entries(value)) {
      if (key === "assetId" || !/^[A-Za-z][A-Za-z0-9_]*$/.test(key) || isDangerousKey(key)) continue;
      walk(child, path ? `${path}.${key}` : key);
    }
  }

  walk(data, "");
  return [...usagesByPath.entries()].map(([path, assetId]) => ({ path, assetId }));
}

function parsePath(path) {
  return path.split(".").map((part) => {
    const match = /^([A-Za-z][A-Za-z0-9_]*)(?:\[((?:0|[1-9]\d*))\])?$/.exec(part);
    if (!match || isDangerousKey(match[1])) {
      throw new Error(`Invalid path: ${path}`);
    }

    return {
      key: match[1],
      index: match[2] === undefined ? null : Number(match[2]),
    };
  });
}

function readSegmentValue(current, segment, path) {
  if (!isObjectRecord(current)) {
    throw new Error(`Path does not exist: ${path}`);
  }

  const next = current[segment.key];
  if (segment.index === null) {
    return next;
  }

  if (!Array.isArray(next) || segment.index >= next.length) {
    throw new Error(`Path does not exist: ${path}`);
  }

  return next[segment.index];
}

function setSegmentValue(current, segment, value, path) {
  if (!isObjectRecord(current)) {
    throw new Error(`Path does not exist: ${path}`);
  }

  if (segment.index === null) {
    current[segment.key] = value;
    return;
  }

  const array = current[segment.key];
  if (!Array.isArray(array) || segment.index >= array.length) {
    throw new Error(`Path does not exist: ${path}`);
  }

  array[segment.index] = value;
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isDangerousKey(value) {
  return value === "__proto__" || value === "constructor" || value === "prototype";
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(Object(object), key);
}

function buildMediaUploadPageUrl(env, uploadId, uploadToken) {
  const path = `/media/uploads/${encodeURIComponent(uploadId)}/form#token=${encodeURIComponent(uploadToken)}`;
  const rootDomain = String(env?.ROOT_DOMAIN ?? "").trim();
  if (!rootDomain) return path;
  return `https://api.${rootDomain}${path}`;
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
function safeJson(value) {
  if (value == null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function timingSafeHashEqual(token, expectedHash) {
  const actualHash = await sha256Hex(token);
  if (actualHash.length !== String(expectedHash ?? "").length) return false;

  let diff = 0;
  for (let index = 0; index < actualHash.length; index += 1) {
    diff |= actualHash.charCodeAt(index) ^ String(expectedHash).charCodeAt(index);
  }
  return diff === 0;
}

function html(payload, status = 200, options = {}) {
  return new Response(options.head ? null : payload, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
