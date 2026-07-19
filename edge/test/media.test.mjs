import assert from "node:assert/strict";
import test from "node:test";

import {
  attachImageToSection,
  confirmImageUpload,
  createImageUpload,
  listMediaAssets,
  replaceImage,
  setImageFocalPoint,
  updateImageAlt,
} from "../src/media.mjs";

test("createImageUpload creates a pending upload session and draft media asset", async () => {
  const db = createMediaDb();

  const result = await createImageUpload(
    { DB: db },
    {
      site: "ph",
      filename: "Nuovo Ritratto.JPG",
      mimeType: "image/jpeg",
      sizeBytes: 456789,
      width: 1800,
      height: 1200,
      alt: "Ritratto caricato dalla sessione media",
      caption: "Nuovo ritratto",
      actor: "tdd-suite",
    },
  );

  assert.equal(result.site, "ph");
  assert.match(result.upload.id, /^upload_/);
  assert.equal(result.upload.status, "pending");
  assert.equal(result.upload.method, "PUT");
  assert.match(result.upload.uploadUrl, /^\/media\/uploads\/upload_/);
  assert.match(result.upload.uploadToken, /^mu_/);
  assert.equal(result.upload.headers["content-type"], "image/jpeg");
  assert.equal(result.upload.maxSizeBytes, 12582912);
  assert.equal(result.asset.status, "draft");
  assert.equal(result.asset.publicUrl, `media/assets/${result.asset.id}/nuovo-ritratto.jpg`);
  assert.equal(result.asset.alt, "Ritratto caricato dalla sessione media");

  const upload = db.mediaUploads[0];
  const asset = db.mediaAssets.find((item) => item.id === result.asset.id);
  assert.equal(upload.asset_id, result.asset.id);
  assert.equal(upload.filename, "nuovo-ritratto.jpg");
  assert.equal(upload.mime_type, "image/jpeg");
  assert.equal(upload.size_bytes, 456789);
  assert.equal(upload.status, "pending");
  assert.equal(upload.upload_token_hash.length, 64);
  assert.notEqual(upload.upload_token_hash, result.upload.uploadToken);
  assert.equal(asset.status, "draft");
  assert.equal(asset.r2_key, upload.r2_key);
  assert.equal(db.changeLog[0].action, "create_image_upload");
  assert.equal(db.changeLog[0].target, `media/${result.asset.id}`);
});

test("createImageUpload rejects unsupported formats, oversized files, and missing alt", async () => {
  await assert.rejects(
    () =>
      createImageUpload(
        { DB: createMediaDb() },
        {
          site: "ph",
          filename: "script.svg",
          mimeType: "image/svg+xml",
          sizeBytes: 10,
          width: 100,
          height: 100,
          alt: "Svg",
          actor: "tdd-suite",
        },
      ),
    /Unsupported image format/,
  );

  await assert.rejects(
    () =>
      createImageUpload(
        { DB: createMediaDb() },
        {
          site: "ph",
          filename: "huge.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 12582913,
          width: 100,
          height: 100,
          alt: "Troppo grande",
          actor: "tdd-suite",
        },
      ),
    /exceeds max size/,
  );

  await assert.rejects(
    () =>
      createImageUpload(
        { DB: createMediaDb() },
        {
          site: "ph",
          filename: "no-alt.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 1000,
          width: 100,
          height: 100,
          actor: "tdd-suite",
        },
      ),
    /Missing alt/,
  );
});

test("confirmImageUpload promotes an uploaded R2 object to a ready media asset", async () => {
  const db = createMediaDb();
  const created = await createImageUpload(
    { DB: db },
    {
      site: "ph",
      filename: "ritratto.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 456789,
      width: 1800,
      height: 1200,
      alt: "Ritratto confermato",
      actor: "tdd-suite",
    },
  );
  db.changeLog = [];
  const bucket = new FakeMediaBucket({
    [created.upload.r2Key]: {
      size: 456789,
      contentType: "image/jpeg",
    },
  });

  const result = await confirmImageUpload(
    { DB: db, MEDIA_BUCKET: bucket },
    {
      site: "ph",
      uploadId: created.upload.id,
      actor: "tdd-suite",
    },
  );

  assert.equal(result.site, "ph");
  assert.equal(result.upload.id, created.upload.id);
  assert.equal(result.upload.status, "uploaded");
  assert.equal(result.asset.id, created.asset.id);
  assert.equal(result.asset.status, "ready");
  assert.equal(result.asset.publicUrl, created.asset.publicUrl);

  const upload = db.mediaUploads.find((item) => item.id === created.upload.id);
  const asset = db.mediaAssets.find((item) => item.id === created.asset.id);
  assert.equal(upload.status, "uploaded");
  assert.equal(upload.uploaded_at, "2026-07-15 00:00:01");
  assert.equal(asset.status, "ready");
  assert.equal(db.changeLog[0].action, "confirm_image_upload");
  assert.equal(db.changeLog[0].target, `media/${created.asset.id}`);
});

test("confirmImageUpload rejects missing R2 objects and size mismatches", async () => {
  const db = createMediaDb();
  const created = await createImageUpload(
    { DB: db },
    {
      site: "ph",
      filename: "ritratto.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 456789,
      width: 1800,
      height: 1200,
      alt: "Ritratto",
      actor: "tdd-suite",
    },
  );

  await assert.rejects(
    () =>
      confirmImageUpload(
        { DB: db, MEDIA_BUCKET: new FakeMediaBucket({}) },
        {
          site: "ph",
          uploadId: created.upload.id,
          actor: "tdd-suite",
        },
      ),
    /Uploaded object not found/,
  );

  await assert.rejects(
    () =>
      confirmImageUpload(
        {
          DB: db,
          MEDIA_BUCKET: new FakeMediaBucket({
            [created.upload.r2Key]: {
              size: 123,
              contentType: "image/jpeg",
            },
          }),
        },
        {
          site: "ph",
          uploadId: created.upload.id,
          actor: "tdd-suite",
        },
      ),
    /Uploaded object size mismatch/,
  );
});

test("listMediaAssets returns ready media assets for a site without exposing other statuses", async () => {
  const db = createMediaDb();

  const result = await listMediaAssets(
    { DB: db },
    {
      site: "ph",
    },
  );

  assert.equal(result.site, "ph");
  assert.equal(result.count, 2);
  assert.deepEqual(
    result.assets.map((asset) => asset.id),
    ["asset_ready_portrait", "asset_empty_alt"],
  );
  assert.equal(result.assets[0].publicUrl, "assets/images/media/portrait.jpg");
  assert.equal(result.assets[0].r2Key, "ph/originals/portrait.jpg");
  assert.equal(result.assets[0].mimeType, "image/jpeg");
  assert.equal(result.assets[0].sizeBytes, 345678);
});

test("replaceImage attaches an existing media asset to a contracted image path and records history", async () => {
  const db = createMediaDb();

  const result = await replaceImage(
    { DB: db },
    {
      site: "ph",
      page: "portfolio",
      sectionId: "gallery",
      path: "items[0].images[0]",
      assetId: "asset_ready_portrait",
      alt: "Ritratto sostituito dalla libreria media",
      actor: "tdd-suite",
    },
  );

  assert.equal(result.site, "ph");
  assert.equal(result.page, "portfolio");
  assert.equal(result.sectionId, "gallery");
  assert.equal(result.path, "items[0].images[0]");
  assert.equal(result.asset.id, "asset_ready_portrait");
  assert.equal(result.image.assetId, "asset_ready_portrait");
  assert.equal(result.image.src, "assets/images/media/portrait.jpg");
  assert.equal(result.image.alt, "Ritratto sostituito dalla libreria media");
  assert.equal(result.image.caption, "Ritratto dalla media library");
  assert.equal(result.image.width, 1600);
  assert.equal(result.image.height, 1200);
  assert.equal(result.image.variant, "wide");
  assert.match(result.revisionId, /.+/);

  const section = db.pageSections.find((item) => item.section_key === "gallery");
  const image = JSON.parse(section.data).items[0].images[0];
  assert.equal(image.assetId, "asset_ready_portrait");
  assert.equal(image.src, "assets/images/media/portrait.jpg");
  assert.equal(image.alt, "Ritratto sostituito dalla libreria media");

  assert.equal(db.mediaUsages.length, 1);
  assert.equal(db.mediaUsages[0].asset_id, "asset_ready_portrait");
  assert.equal(db.mediaUsages[0].page_id, "page_portfolio");
  assert.equal(db.mediaUsages[0].section_id, "section_portfolio_gallery");
  assert.equal(db.mediaUsages[0].path, "items[0].images[0]");

  assert.equal(db.sectionRevisions.length, 1);
  assert.equal(db.sectionRevisions[0].actor, "tdd-suite");
  assert.equal(db.sectionRevisions[0].action, "replace_image");
  assert.equal(JSON.parse(db.sectionRevisions[0].before_json).data.items[0].images[0].src, "assets/images/old.jpg");
  assert.equal(JSON.parse(db.sectionRevisions[0].after_json).data.items[0].images[0].assetId, "asset_ready_portrait");

  assert.equal(db.changeLog.length, 1);
  assert.equal(db.changeLog[0].action, "replace_image");
  assert.equal(db.changeLog[0].target, "pages/portfolio/sections/gallery/items[0].images[0]");
});

test("replaceImage rejects non-ready assets, arbitrary src paths, and missing alt text", async () => {
  await assert.rejects(
    () =>
      replaceImage(
        { DB: createMediaDb() },
        {
          site: "ph",
          page: "portfolio",
          sectionId: "gallery",
          path: "items[0].images[0]",
          assetId: "asset_draft",
          alt: "Bozza",
          actor: "tdd-suite",
        },
      ),
    /Media asset is not ready/,
  );

  await assert.rejects(
    () =>
      replaceImage(
        { DB: createMediaDb() },
        {
          site: "ph",
          page: "portfolio",
          sectionId: "gallery",
          path: "items[0].images[0].src",
          assetId: "asset_ready_portrait",
          alt: "Src libero",
          actor: "tdd-suite",
        },
      ),
    /Field is not editable with replace_image/,
  );

  await assert.rejects(
    () =>
      replaceImage(
        { DB: createMediaDb() },
        {
          site: "ph",
          page: "portfolio",
          sectionId: "gallery",
          path: "items[0].images[0]",
          assetId: "asset_empty_alt",
          actor: "tdd-suite",
        },
      ),
    /Alt text is required/,
  );
});

test("attachImageToSection appends a ready asset to a contracted image array", async () => {
  const db = createMediaDb();

  const result = await attachImageToSection(
    { DB: db },
    {
      site: "ph",
      page: "portfolio",
      sectionId: "gallery",
      path: "items[0].images",
      assetId: "asset_ready_portrait",
      alt: "Ritratto aggiunto alla gallery",
      caption: "Nuova immagine in gallery",
      variant: "tall",
      actor: "tdd-suite",
    },
  );

  assert.equal(result.site, "ph");
  assert.equal(result.page, "portfolio");
  assert.equal(result.sectionId, "gallery");
  assert.equal(result.path, "items[0].images");
  assert.equal(result.imagePath, "items[0].images[1]");
  assert.equal(result.itemIndex, 1);
  assert.equal(result.asset.id, "asset_ready_portrait");
  assert.equal(result.image.assetId, "asset_ready_portrait");
  assert.equal(result.image.src, "assets/images/media/portrait.jpg");
  assert.equal(result.image.alt, "Ritratto aggiunto alla gallery");
  assert.equal(result.image.caption, "Nuova immagine in gallery");
  assert.equal(result.image.variant, "tall");

  const section = db.pageSections.find((item) => item.section_key === "gallery");
  const images = JSON.parse(section.data).items[0].images;
  assert.equal(images.length, 2);
  assert.equal(images[1].assetId, "asset_ready_portrait");
  assert.equal(images[1].variant, "tall");

  assert.equal(db.mediaUsages.length, 1);
  assert.equal(db.mediaUsages[0].asset_id, "asset_ready_portrait");
  assert.equal(db.mediaUsages[0].path, "items[0].images[1]");

  assert.equal(db.sectionRevisions.length, 1);
  assert.equal(db.sectionRevisions[0].action, "attach_image_to_section");
  assert.equal(JSON.parse(db.sectionRevisions[0].after_json).data.items[0].images[1].assetId, "asset_ready_portrait");

  assert.equal(db.changeLog.length, 1);
  assert.equal(db.changeLog[0].action, "attach_image_to_section");
  assert.equal(db.changeLog[0].target, "pages/portfolio/sections/gallery/items[0].images[1]");
});

test("attachImageToSection rejects non-array paths, non-ready assets, and unsupported variants", async () => {
  await assert.rejects(
    () =>
      attachImageToSection(
        { DB: createMediaDb() },
        {
          site: "ph",
          page: "portfolio",
          sectionId: "gallery",
          path: "items[0].images[0]",
          assetId: "asset_ready_portrait",
          alt: "Path sbagliato",
          actor: "tdd-suite",
        },
      ),
    /Field is not editable with attach_image_to_section/,
  );

  await assert.rejects(
    () =>
      attachImageToSection(
        { DB: createMediaDb() },
        {
          site: "ph",
          page: "portfolio",
          sectionId: "gallery",
          path: "items[0].images",
          assetId: "asset_draft",
          alt: "Bozza",
          actor: "tdd-suite",
        },
      ),
    /Media asset is not ready/,
  );

  await assert.rejects(
    () =>
      attachImageToSection(
        { DB: createMediaDb() },
        {
          site: "ph",
          page: "portfolio",
          sectionId: "gallery",
          path: "items[0].images",
          assetId: "asset_ready_portrait",
          alt: "Variante sbagliata",
          variant: "panorama",
          actor: "tdd-suite",
        },
      ),
    /Invalid image variant/,
  );
});

test("setImageFocalPoint updates a contracted image object and records history", async () => {
  const db = createMediaDb();

  const result = await setImageFocalPoint(
    { DB: db },
    {
      site: "ph",
      page: "portfolio",
      sectionId: "gallery",
      path: "items[0].images[0]",
      x: 35,
      y: 42,
      actor: "tdd-suite",
    },
  );

  assert.equal(result.site, "ph");
  assert.equal(result.page, "portfolio");
  assert.equal(result.sectionId, "gallery");
  assert.equal(result.path, "items[0].images[0]");
  assert.deepEqual(result.focalPoint, { x: 35, y: 42 });

  const section = db.pageSections.find((item) => item.section_key === "gallery");
  const image = JSON.parse(section.data).items[0].images[0];
  assert.deepEqual(image.focalPoint, { x: 35, y: 42 });

  assert.equal(db.sectionRevisions.length, 1);
  assert.equal(db.sectionRevisions[0].action, "set_image_focal_point");
  assert.equal(JSON.parse(db.sectionRevisions[0].after_json).data.items[0].images[0].focalPoint.x, 35);
  assert.equal(db.changeLog.length, 1);
  assert.equal(db.changeLog[0].target, "pages/portfolio/sections/gallery/items[0].images[0]/focalPoint");
});

test("setImageFocalPoint rejects invalid values and non-image paths", async () => {
  await assert.rejects(
    () =>
      setImageFocalPoint(
        { DB: createMediaDb() },
        {
          site: "ph",
          page: "portfolio",
          sectionId: "gallery",
          path: "items[0].images[0]",
          x: -1,
          y: 50,
          actor: "tdd-suite",
        },
      ),
    /Invalid focal point x/,
  );

  await assert.rejects(
    () =>
      setImageFocalPoint(
        { DB: createMediaDb() },
        {
          site: "ph",
          page: "portfolio",
          sectionId: "gallery",
          path: "items[0].images[0].src",
          x: 50,
          y: 50,
          actor: "tdd-suite",
        },
      ),
    /Field is not editable with set_image_focal_point/,
  );
});

test("updateImageAlt updates media metadata and records a site change", async () => {
  const db = createMediaDb();

  const result = await updateImageAlt(
    { DB: db },
    {
      site: "ph",
      assetId: "asset_ready_portrait",
      alt: "Ritratto con luce laterale",
      actor: "tdd-suite",
    },
  );

  assert.equal(result.site, "ph");
  assert.equal(result.asset.id, "asset_ready_portrait");
  assert.equal(result.asset.alt, "Ritratto con luce laterale");

  const asset = db.mediaAssets.find((item) => item.id === "asset_ready_portrait");
  assert.equal(asset.alt, "Ritratto con luce laterale");
  assert.equal(db.changeLog.length, 1);
  assert.equal(db.changeLog[0].action, "update_image_alt");
  assert.equal(db.changeLog[0].target, "media/asset_ready_portrait/alt");
  assert.equal(JSON.parse(db.changeLog[0].before_json).alt, "Ritratto esistente dalla libreria");
  assert.equal(JSON.parse(db.changeLog[0].after_json).alt, "Ritratto con luce laterale");
});

test("updateImageAlt rejects unsafe text", async () => {
  await assert.rejects(
    () =>
      updateImageAlt(
        { DB: createMediaDb() },
        {
          site: "ph",
          assetId: "asset_ready_portrait",
          alt: "<strong>No</strong>",
          actor: "tdd-suite",
        },
      ),
    /HTML is not allowed/,
  );
});

function createMediaDb() {
  return new FakeMediaD1Database({
    sites: [
      {
        id: "site_ph",
        slug: "ph",
      },
      {
        id: "site_other",
        slug: "other",
      },
    ],
    pages: [
      {
        id: "page_portfolio",
        site_id: "site_ph",
        slug: "portfolio",
        title: "Portfolio",
      },
    ],
    pageSections: [
      {
        id: "section_portfolio_gallery",
        page_id: "page_portfolio",
        section_key: "gallery",
        type: "gallery",
        section_order: 25,
        enabled: 1,
        data: JSON.stringify({
          items: [
            {
              key: "ritratti",
              title: "Ritratti",
              images: [
                {
                  src: "assets/images/old.jpg",
                  alt: "Vecchio alt",
                  caption: "Vecchia caption",
                  width: 800,
                  height: 600,
                  variant: "wide",
                },
              ],
            },
          ],
        }),
      },
    ],
    mediaAssets: [
      mediaAsset({
        id: "asset_ready_portrait",
        r2_key: "ph/originals/portrait.jpg",
        alt: "Ritratto esistente dalla libreria",
        caption: "Ritratto dalla media library",
        status: "ready",
      }),
      mediaAsset({
        id: "asset_empty_alt",
        public_url: "assets/images/media/no-alt.jpg",
        alt: "",
        caption: "Senza alt",
        status: "ready",
      }),
      mediaAsset({
        id: "asset_draft",
        public_url: "assets/images/media/draft.jpg",
        alt: "Bozza non pronta",
        caption: "Bozza",
        status: "draft",
      }),
      mediaAsset({
        id: "asset_other_site",
        site_id: "site_other",
        public_url: "assets/images/media/other.jpg",
        alt: "Alt altro sito",
        caption: "Altro sito",
        status: "ready",
      }),
    ],
    mediaUploads: [],
  });
}

function mediaAsset(options) {
  return {
    id: options.id,
    site_id: options.site_id ?? "site_ph",
    r2_key: options.r2_key ?? `ph/originals/${options.id}.jpg`,
    public_url: options.public_url ?? "assets/images/media/portrait.jpg",
    alt: options.alt,
    caption: options.caption,
    width: options.width ?? 1600,
    height: options.height ?? 1200,
    mime_type: options.mime_type ?? "image/jpeg",
    size_bytes: options.size_bytes ?? 345678,
    status: options.status,
    created_at: "2026-07-15 00:00:00",
    updated_at: "2026-07-15 00:00:00",
  };
}

class FakeMediaD1Database {
  constructor(seed) {
    this.sites = [...seed.sites];
    this.pages = [...seed.pages];
    this.pageSections = [...seed.pageSections];
    this.mediaAssets = [...seed.mediaAssets];
    this.mediaUploads = [...seed.mediaUploads];
    this.mediaUsages = [];
    this.sectionRevisions = [];
    this.changeLog = [];
  }

  prepare(query) {
    return new FakeMediaD1Statement(this, query);
  }

  _first(query, params) {
    const results = this._all(query, params).results;
    return results[0] ?? null;
  }

  _all(query, params) {
    if (query.includes("FROM sites WHERE slug = ?")) {
      return { results: this.sites.filter((site) => site.slug === params[0]) };
    }

    if (query.includes("FROM pages WHERE site_id = ? AND slug = ?")) {
      return {
        results: this.pages.filter((page) => page.site_id === params[0] && page.slug === params[1]),
      };
    }

    if (query.includes("FROM page_sections") && query.includes("page_id = ?") && query.includes("section_key = ?")) {
      return {
        results: this.pageSections.filter(
          (section) => section.page_id === params[0] && section.section_key === params[1],
        ),
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

    throw new Error(`Unhandled fake D1 all/first query: ${query}`);
  }

  _run(query, params) {
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
        created_at: "2026-07-15 00:00:01",
        updated_at: "2026-07-15 00:00:01",
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
        created_at: "2026-07-15 00:00:01",
        updated_at: "2026-07-15 00:00:01",
      });
      return { success: true };
    }

    if (query.includes("UPDATE media_assets")) {
      if (query.includes("status = ?")) {
        const [status, assetId] = params;
        const asset = this.mediaAssets.find((item) => item.id === assetId);
        asset.status = status;
        asset.updated_at = "2026-07-15 00:00:01";
        return { success: true };
      }

      const [alt, assetId] = params;
      const asset = this.mediaAssets.find((item) => item.id === assetId);
      asset.alt = alt;
      asset.updated_at = "2026-07-15 00:00:01";
      return { success: true };
    }

    if (query.includes("UPDATE media_uploads")) {
      const [status, uploadId] = params;
      const upload = this.mediaUploads.find((item) => item.id === uploadId);
      upload.status = status;
      upload.uploaded_at = status === "uploaded" ? "2026-07-15 00:00:01" : upload.uploaded_at;
      upload.updated_at = "2026-07-15 00:00:01";
      return { success: true };
    }

    if (query.includes("UPDATE page_sections")) {
      const [data, sectionId] = params;
      const section = this.pageSections.find((item) => item.id === sectionId);
      section.data = data;
      section.updated_at = "2026-07-15 00:00:01";
      return { success: true };
    }

    if (query.includes("INSERT INTO media_usages")) {
      const [id, assetId, pageId, sectionId, path] = params;
      const existing = this.mediaUsages.find(
        (usage) => usage.page_id === pageId && usage.section_id === sectionId && usage.path === path,
      );
      if (existing) {
        existing.asset_id = assetId;
        existing.updated_at = "2026-07-15 00:00:01";
      } else {
        this.mediaUsages.push({
          id,
          asset_id: assetId,
          page_id: pageId,
          section_id: sectionId,
          path,
          created_at: "2026-07-15 00:00:01",
          updated_at: "2026-07-15 00:00:01",
        });
      }
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
        created_at: "2026-07-15 00:00:01",
      });
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
        created_at: "2026-07-15 00:00:01",
      });
      return { success: true };
    }

    throw new Error(`Unhandled fake D1 run query: ${query}`);
  }
}

class FakeMediaBucket {
  constructor(objects) {
    this.objects = objects;
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
}

class FakeMediaD1Statement {
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
