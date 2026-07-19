import { resolveEditableField } from "./page-contracts.mjs";

const SLUG_PATTERN = /^[a-z0-9-]{1,80}$/;
const SECTION_KEY_PATTERN = /^[a-z0-9_-]{1,80}$/;
const ID_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;
const IMAGE_PATH_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(?:\[(?:0|[1-9]\d*)\])?(?:\.[A-Za-z][A-Za-z0-9_]*(?:\[(?:0|[1-9]\d*)\])?)*$/;
const MEDIA_STATUSES = new Set(["draft", "ready", "archived", "all"]);
const ALLOWED_IMAGE_MIME_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
]);
const MAX_UPLOAD_SIZE_BYTES = 12 * 1024 * 1024;
const UPLOAD_TTL_MS = 15 * 60 * 1000;

export async function createImageUpload(env, input) {
  const siteSlug = requiredPattern(input?.site, "site", SLUG_PATTERN);
  const actor = requiredString(input?.actor || "mcp");
  const mimeType = normalizeImageMimeType(input?.mimeType);
  const sizeBytes = normalizeUploadSize(input?.sizeBytes);
  const width = positiveInteger(input?.width, "width");
  const height = positiveInteger(input?.height, "height");
  const alt = normalizeAltText(input?.alt);
  const caption = normalizeOptionalText(input?.caption, { maxLength: 120, name: "caption" }) || null;
  const filename = normalizeUploadFilename(input?.filename, mimeType);
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
      uploadToken,
      headers: {
        authorization: `Bearer ${uploadToken}`,
        "content-type": mimeType,
      },
      r2Key,
      expiresAt,
      maxSizeBytes: MAX_UPLOAD_SIZE_BYTES,
    },
    asset: serializeAsset(asset),
  };
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
  if (segments.length !== 3 || segments[1] !== "uploads") {
    return json({ error: "not_found", message: "Media route not found." }, 404);
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

  const uploadId = String(segments[2] ?? "").trim();
  if (!ID_PATTERN.test(uploadId)) {
    return json({ error: "invalid_upload", message: "Invalid upload id." }, 400);
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

  const contentType = normalizeHeaderContentType(request.headers.get("content-type"));
  if (contentType !== upload.mime_type) {
    return json({ error: "invalid_content_type", message: "Upload content type does not match the session." }, 415);
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (!Number.isInteger(contentLength) || contentLength !== Number(upload.size_bytes)) {
    return json({ error: "invalid_upload_size", message: "Upload size does not match the session." }, 413);
  }

  if (!request.body) {
    return json({ error: "missing_upload_body", message: "Upload body is required." }, 400);
  }

  await env.MEDIA_BUCKET.put(upload.r2_key, request.body, {
    httpMetadata: {
      contentType,
    },
    customMetadata: {
      uploadId: upload.id,
      assetId: upload.asset_id,
      siteId: upload.site_id,
    },
  });

  return json({
    uploadId: upload.id,
    status: "stored",
    r2Key: upload.r2_key,
  });
}

export async function listMediaAssets(env, input) {
  const siteSlug = requiredPattern(input?.site, "site", SLUG_PATTERN);
  const status = normalizeStatus(input?.status ?? "ready");
  const limit = normalizeLimit(input?.limit ?? 50);
  const site = await loadSite(env, siteSlug);

  const rows = status === "all"
    ? await env.DB.prepare(
      `SELECT id, r2_key, public_url, alt, caption, width, height, mime_type, size_bytes, status, created_at, updated_at
       FROM media_assets
       WHERE site_id = ?
       ORDER BY updated_at DESC, id ASC
       LIMIT ?`,
    )
      .bind(site.id, limit)
      .all()
    : await env.DB.prepare(
      `SELECT id, r2_key, public_url, alt, caption, width, height, mime_type, size_bytes, status, created_at, updated_at
       FROM media_assets
       WHERE site_id = ? AND status = ?
       ORDER BY updated_at DESC, id ASC
       LIMIT ?`,
    )
      .bind(site.id, status, limit)
      .all();

  const assets = (rows.results ?? []).map(serializeAsset);
  return {
    site: site.slug,
    status,
    count: assets.length,
    assets,
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

export async function setImageFocalPoint(env, input) {
  const siteSlug = requiredPattern(input?.site, "site", SLUG_PATTERN);
  const pageSlug = requiredPattern(input?.page, "page", SLUG_PATTERN);
  const sectionKey = requiredPattern(input?.sectionId, "sectionId", SECTION_KEY_PATTERN);
  const rawPath = requiredPattern(input?.path, "path", IMAGE_PATH_PATTERN);
  const actor = requiredString(input?.actor || "mcp");
  const path = normalizeImageObjectPath(rawPath);
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
  const currentImage = readObjectAtPath(data, path);
  const nextImage = {
    ...currentImage,
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
    `SELECT id, r2_key, public_url, alt, caption, width, height, mime_type, size_bytes, status, created_at, updated_at
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

function normalizeImageMimeType(value) {
  const mimeType = requiredString(value).toLowerCase();
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error("Unsupported image format.");
  }
  return mimeType;
}

function normalizeUploadSize(value) {
  const sizeBytes = Number(value);
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1) {
    throw new Error("Invalid upload size.");
  }

  if (sizeBytes > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error(`Image upload exceeds max size ${MAX_UPLOAD_SIZE_BYTES}.`);
  }

  return sizeBytes;
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

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
