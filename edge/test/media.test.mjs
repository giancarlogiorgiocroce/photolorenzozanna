import assert from "node:assert/strict";
import test from "node:test";

import {
  attachImageToSection,
  deleteMediaAsset,
  listMediaAssets,
  removeImageFromSection,
  reorderImagesInSection,
  replaceImage,
  setImageFocalPoint,
  setMediaAssetArchived,
  setImageVisibility,
  updateImageAlt,
  updateImageCaption,
  updateMediaAsset,
  uploadImageFile,
} from "../src/media.mjs";

test("uploadImageFile streams a validated ChatGPT file into a ready catalog asset", async () => {
  const db = createMediaDb();
  const bucket = new FakeMediaBucket({});
  const bytes = directPngHeader(640, 480);
  const fetchCalls = [];

  const result = await uploadImageFile(
    { DB: db, MEDIA_BUCKET: bucket },
    {
      site: "ph",
      file: {
        download_url: "https://files.openai.example/download/signed",
        file_id: "file_direct_png",
        mime_type: "image/png",
        file_name: "Nuovo Ritratto.PNG",
      },
      alt: "Ritratto caricato direttamente dalla chat",
      caption: "Upload diretto",
      actor: "tdd-suite",
    },
    {
      fetchImpl: async (url, init) => {
        fetchCalls.push({ url, init });
        return new Response(bytes, {
          headers: {
            "content-type": "image/png",
            "content-length": String(bytes.byteLength),
          },
        });
      },
    },
  );

  assert.equal(result.site, "ph");
  assert.equal(result.source.fileId, "file_direct_png");
  assert.equal(result.asset.status, "ready");
  assert.equal(result.asset.mimeType, "image/png");
  assert.equal(result.asset.width, 640);
  assert.equal(result.asset.height, 480);
  assert.equal(result.asset.sizeBytes, bytes.byteLength);
  assert.match(result.asset.publicUrl, /^media\/assets\/asset_.*\/nuovo-ritratto\.png$/);
  assert.deepEqual(result.nextAction.tools, ["attach_image_to_section", "replace_image"]);
  assert.equal(fetchCalls.length, 1);
  assert.equal(bucket.puts.length, 1);
  assert.deepEqual(bucket.puts[0].body, bytes);
  assert.equal(bucket.puts[0].options.httpMetadata.contentType, "image/png");
  assert.equal(db.mediaUploads.length, 0);

  const asset = db.mediaAssets.find((item) => item.id === result.asset.id);
  assert.equal(asset.status, "ready");
  assert.equal(asset.width, 640);
  assert.equal(asset.height, 480);
  assert.equal(db.changeLog[0].action, "upload_image_file");
  assert.equal(db.changeLog[0].target, `media/${result.asset.id}`);
  assert.doesNotMatch(db.changeLog[0].after_json, /download_url|files\.openai/);
});

test("uploadImageFile removes the R2 object when the atomic D1 write fails", async () => {
  const db = createMediaDb();
  db.batch = async () => {
    throw new Error("D1 unavailable");
  };
  const bucket = new FakeMediaBucket({});
  const bytes = directPngHeader(320, 240);

  await assert.rejects(
    () => uploadImageFile(
      { DB: db, MEDIA_BUCKET: bucket },
      {
        site: "ph",
        file: {
          download_url: "https://files.openai.example/download/cleanup",
          file_id: "file_cleanup",
          mime_type: "image/png",
          file_name: "cleanup.png",
        },
        alt: "Immagine da ripulire",
        actor: "tdd-suite",
      },
      {
        fetchImpl: async () => new Response(bytes, {
          headers: {
            "content-type": "image/png",
            "content-length": String(bytes.byteLength),
          },
        }),
      },
    ),
    /D1 unavailable/,
  );

  assert.equal(bucket.puts.length, 1);
  assert.deepEqual(bucket.deletedKeys, [bucket.puts[0].key]);
  assert.equal(bucket.objects[bucket.puts[0].key], undefined);
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

test("listMediaAssets searches editorial metadata without exposing other statuses", async () => {
  const db = createMediaDb();
  const portrait = db.mediaAssets.find((asset) => asset.id === "asset_ready_portrait");
  portrait.title = "Ritratto tra i rami";
  portrait.tags_json = JSON.stringify(["ritratto", "riflessi"]);
  portrait.notes = "Selezione editoriale per la pagina Chi sono.";

  const result = await listMediaAssets(
    { DB: db },
    {
      site: "ph",
      query: "riflessi",
    },
  );

  assert.equal(result.query, "riflessi");
  assert.equal(result.count, 1);
  assert.equal(result.assets[0].id, "asset_ready_portrait");
  assert.equal(result.assets[0].title, "Ritratto tra i rami");
  assert.deepEqual(result.assets[0].tags, ["ritratto", "riflessi"]);
  assert.equal(result.assets[0].notes, "Selezione editoriale per la pagina Chi sono.");
});

test("updateMediaAsset updates title, tags and notes with an audited change", async () => {
  const db = createMediaDb();

  const result = await updateMediaAsset(
    { DB: db },
    {
      site: "ph",
      assetId: "asset_ready_portrait",
      title: "Ritratto tra i rami",
      tags: ["Ritratto", "riflessi", "ritratto"],
      notes: "Usare come possibile copertina.",
      actor: "tdd-suite",
    },
  );

  assert.equal(result.site, "ph");
  assert.equal(result.asset.title, "Ritratto tra i rami");
  assert.deepEqual(result.asset.tags, ["Ritratto", "riflessi"]);
  assert.equal(result.asset.notes, "Usare come possibile copertina.");

  const asset = db.mediaAssets.find((item) => item.id === "asset_ready_portrait");
  assert.equal(asset.title, "Ritratto tra i rami");
  assert.equal(asset.tags_json, JSON.stringify(["Ritratto", "riflessi"]));
  assert.equal(asset.notes, "Usare come possibile copertina.");
  assert.equal(db.changeLog[0].action, "update_media_asset");
  assert.equal(db.changeLog[0].target, "media/asset_ready_portrait/metadata");
});

test("updateMediaAsset rejects empty changes and unsafe metadata", async () => {
  await assert.rejects(
    () =>
      updateMediaAsset(
        { DB: createMediaDb() },
        {
          site: "ph",
          assetId: "asset_ready_portrait",
          actor: "tdd-suite",
        },
      ),
    /At least one media metadata field is required/,
  );

  await assert.rejects(
    () =>
      updateMediaAsset(
        { DB: createMediaDb() },
        {
          site: "ph",
          assetId: "asset_ready_portrait",
          title: "<strong>Non sicuro</strong>",
          actor: "tdd-suite",
        },
      ),
    /HTML is not allowed/,
  );
});

test("setMediaAssetArchived archives and restores an unused ready asset with audit", async () => {
  const db = createMediaDb();

  const archived = await setMediaAssetArchived(
    { DB: db },
    {
      site: "ph",
      assetId: "asset_ready_portrait",
      archived: true,
      actor: "tdd-suite",
    },
  );

  assert.equal(archived.asset.status, "archived");
  assert.equal(archived.usageCount, 0);
  assert.equal(db.changeLog[0].action, "archive_media_asset");
  assert.equal((await listMediaAssets({ DB: db }, { site: "ph" })).count, 1);
  assert.deepEqual(
    (await listMediaAssets({ DB: db }, { site: "ph", status: "archived" })).assets.map((asset) => asset.id),
    ["asset_ready_portrait"],
  );

  const restored = await setMediaAssetArchived(
    { DB: db },
    {
      site: "ph",
      assetId: "asset_ready_portrait",
      archived: false,
      actor: "tdd-suite",
    },
  );

  assert.equal(restored.asset.status, "ready");
  assert.equal(db.changeLog[1].action, "restore_media_asset");
});

test("setMediaAssetArchived blocks assets that still have usages", async () => {
  const db = createMediaDb();
  db.mediaUsages.push({
    id: "usage_1",
    asset_id: "asset_ready_portrait",
    page_id: "page_portfolio",
    section_id: "section_portfolio_gallery",
    path: "items[0].images[0]",
  });

  await assert.rejects(
    () =>
      setMediaAssetArchived(
        { DB: db },
        {
          site: "ph",
          assetId: "asset_ready_portrait",
          archived: true,
          actor: "tdd-suite",
        },
      ),
    /still in use at 1 path/,
  );

  assert.equal(db.mediaAssets.find((asset) => asset.id === "asset_ready_portrait").status, "ready");
  assert.equal(db.changeLog.length, 0);
});

test("deleteMediaAsset permanently removes an archived unused R2 asset with audit", async () => {
  const db = createMediaDb();
  const asset = db.mediaAssets.find((item) => item.id === "asset_ready_portrait");
  asset.status = "archived";
  db.mediaUploads.push({
    id: "upload_portrait",
    site_id: "site_ph",
    asset_id: asset.id,
    r2_key: asset.r2_key,
    status: "uploaded",
  });
  const bucket = new FakeMediaBucket({
    [asset.r2_key]: {
      size: asset.size_bytes,
      contentType: asset.mime_type,
    },
  });

  const result = await deleteMediaAsset(
    { DB: db, MEDIA_BUCKET: bucket },
    {
      site: "ph",
      assetId: asset.id,
      confirm: true,
      actor: "tdd-suite",
    },
  );

  assert.equal(result.deleted, true);
  assert.equal(result.assetId, "asset_ready_portrait");
  assert.equal(result.r2ObjectDeleted, true);
  assert.deepEqual(bucket.deletedKeys, ["ph/originals/portrait.jpg"]);
  assert.equal(db.mediaAssets.some((item) => item.id === asset.id), false);
  assert.equal(db.mediaUploads.some((upload) => upload.asset_id === asset.id), false);
  assert.equal(db.changeLog[0].action, "delete_media_asset");
  assert.equal(db.changeLog[0].target, "media/asset_ready_portrait");
  assert.equal(JSON.parse(db.changeLog[0].before_json).status, "archived");
  assert.equal(db.changeLog[0].after_json, null);
});

test("deleteMediaAsset enforces confirmation, archived state, zero usages, managed R2, and R2 success", async () => {
  const db = createMediaDb();
  const asset = db.mediaAssets.find((item) => item.id === "asset_ready_portrait");
  const bucket = new FakeMediaBucket({
    [asset.r2_key]: {
      size: asset.size_bytes,
      contentType: asset.mime_type,
    },
  });

  await assert.rejects(
    () =>
      deleteMediaAsset(
        { DB: db, MEDIA_BUCKET: bucket },
        { site: "ph", assetId: asset.id, confirm: false, actor: "tdd-suite" },
      ),
    /Explicit confirmation is required/,
  );

  await assert.rejects(
    () =>
      deleteMediaAsset(
        { DB: db, MEDIA_BUCKET: bucket },
        { site: "ph", assetId: asset.id, confirm: true, actor: "tdd-suite" },
      ),
    /Only archived media assets can be permanently deleted/,
  );

  asset.status = "archived";
  db.mediaUsages.push({
    id: "usage_delete_blocker",
    asset_id: asset.id,
    page_id: "page_portfolio",
    section_id: "section_portfolio_gallery",
    path: "items[0].images[0]",
  });
  await assert.rejects(
    () =>
      deleteMediaAsset(
        { DB: db, MEDIA_BUCKET: bucket },
        { site: "ph", assetId: asset.id, confirm: true, actor: "tdd-suite" },
      ),
    /still in use at 1 path/,
  );

  db.mediaUsages = [];
  asset.r2_key = null;
  await assert.rejects(
    () =>
      deleteMediaAsset(
        { DB: db, MEDIA_BUCKET: bucket },
        { site: "ph", assetId: asset.id, confirm: true, actor: "tdd-suite" },
      ),
    /managed R2 object/,
  );

  asset.r2_key = "ph/originals/portrait.jpg";

  bucket.deleteError = new Error("simulated R2 failure");
  await assert.rejects(
    () =>
      deleteMediaAsset(
        { DB: db, MEDIA_BUCKET: bucket },
        { site: "ph", assetId: asset.id, confirm: true, actor: "tdd-suite" },
      ),
    /simulated R2 failure/,
  );

  bucket.deleteError = null;
  db.batch = async () => {
    throw new Error("simulated D1 failure");
  };
  await assert.rejects(
    () =>
      deleteMediaAsset(
        { DB: db, MEDIA_BUCKET: bucket },
        { site: "ph", assetId: asset.id, confirm: true, actor: "tdd-suite" },
      ),
    /D1 cleanup failed after R2 deletion: simulated D1 failure/,
  );
  assert.deepEqual(bucket.deletedKeys, ["ph/originals/portrait.jpg"]);
  assert.equal(bucket.objects["ph/originals/portrait.jpg"], undefined);

  assert.equal(db.mediaAssets.some((item) => item.id === asset.id), true);
  assert.equal(db.changeLog.length, 0);
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

test("removeImageFromSection removes one use, reindexes media usages, and records history", async () => {
  const db = createMediaDb();
  const section = db.pageSections.find((item) => item.section_key === "gallery");
  const data = JSON.parse(section.data);
  data.items[0].images = [
    {
      assetId: "asset_ready_portrait",
      src: "assets/images/media/portrait.jpg",
      alt: "Primo ritratto",
      width: 1600,
      height: 1200,
    },
    {
      assetId: "asset_empty_alt",
      src: "assets/images/media/no-alt.jpg",
      alt: "Secondo ritratto",
      width: 1600,
      height: 1200,
    },
    {
      src: "assets/images/static.jpg",
      alt: "Immagine statica",
      width: 800,
      height: 600,
    },
  ];
  section.data = JSON.stringify(data);
  db.mediaUsages.push(
    {
      id: "usage_ready",
      asset_id: "asset_ready_portrait",
      page_id: "page_portfolio",
      section_id: "section_portfolio_gallery",
      path: "items[0].images[0]",
    },
    {
      id: "usage_empty",
      asset_id: "asset_empty_alt",
      page_id: "page_portfolio",
      section_id: "section_portfolio_gallery",
      path: "items[0].images[1]",
    },
  );

  const result = await removeImageFromSection(
    { DB: db },
    {
      site: "ph",
      page: "portfolio",
      sectionId: "gallery",
      path: "items[0].images[0]",
      actor: "tdd-suite",
    },
  );

  const images = JSON.parse(section.data).items[0].images;
  assert.equal(result.path, "items[0].images[0]");
  assert.equal(result.arrayPath, "items[0].images");
  assert.equal(result.itemIndex, 0);
  assert.equal(result.removedImage.assetId, "asset_ready_portrait");
  assert.equal(result.remainingCount, 2);
  assert.equal(images[0].assetId, "asset_empty_alt");
  assert.equal(images[1].src, "assets/images/static.jpg");

  assert.equal(db.mediaUsages.length, 1);
  assert.equal(db.mediaUsages[0].asset_id, "asset_empty_alt");
  assert.equal(db.mediaUsages[0].path, "items[0].images[0]");
  assert.equal(db.sectionRevisions[0].action, "remove_image_from_section");
  assert.equal(db.changeLog[0].action, "remove_image_from_section");
  assert.equal(db.changeLog[0].target, "pages/portfolio/sections/gallery/items[0].images[0]");
});

test("removeImageFromSection rejects array paths and missing image indexes", async () => {
  await assert.rejects(
    () =>
      removeImageFromSection(
        { DB: createMediaDb() },
        {
          site: "ph",
          page: "portfolio",
          sectionId: "gallery",
          path: "items[0].images",
          actor: "tdd-suite",
        },
      ),
    /Path is not an image array item/,
  );

  await assert.rejects(
    () =>
      removeImageFromSection(
        { DB: createMediaDb() },
        {
          site: "ph",
          page: "portfolio",
          sectionId: "gallery",
          path: "items[0].images[9]",
          actor: "tdd-suite",
        },
      ),
    /Path does not contain an image object/,
  );
});

test("reorderImagesInSection reorders a contracted array and reindexes media usages", async () => {
  const db = createMediaDb();
  const section = db.pageSections.find((item) => item.section_key === "gallery");
  const data = JSON.parse(section.data);
  data.items[0].images = [
    {
      assetId: "asset_ready_portrait",
      src: "assets/images/media/portrait.jpg",
      alt: "Prima",
      width: 1600,
      height: 1200,
    },
    {
      assetId: "asset_empty_alt",
      src: "assets/images/media/no-alt.jpg",
      alt: "Seconda",
      width: 1600,
      height: 1200,
    },
    {
      src: "assets/images/static.jpg",
      alt: "Statica",
      width: 800,
      height: 600,
    },
  ];
  section.data = JSON.stringify(data);
  db.mediaUsages.push(
    {
      id: "usage_ready",
      asset_id: "asset_ready_portrait",
      page_id: "page_portfolio",
      section_id: "section_portfolio_gallery",
      path: "items[0].images[0]",
    },
    {
      id: "usage_empty",
      asset_id: "asset_empty_alt",
      page_id: "page_portfolio",
      section_id: "section_portfolio_gallery",
      path: "items[0].images[1]",
    },
  );

  const result = await reorderImagesInSection(
    { DB: db },
    {
      site: "ph",
      page: "portfolio",
      sectionId: "gallery",
      path: "items[0].images",
      order: [2, 0, 1],
      actor: "tdd-suite",
    },
  );

  const images = JSON.parse(section.data).items[0].images;
  assert.deepEqual(result.order, [2, 0, 1]);
  assert.equal(result.count, 3);
  assert.equal(images[0].src, "assets/images/static.jpg");
  assert.equal(images[1].assetId, "asset_ready_portrait");
  assert.equal(images[2].assetId, "asset_empty_alt");
  assert.deepEqual(
    db.mediaUsages.map((usage) => [usage.asset_id, usage.path]),
    [
      ["asset_ready_portrait", "items[0].images[1]"],
      ["asset_empty_alt", "items[0].images[2]"],
    ],
  );
  assert.equal(db.sectionRevisions[0].action, "reorder_images_in_section");
  assert.equal(db.changeLog[0].target, "pages/portfolio/sections/gallery/items[0].images");
});

test("reorderImagesInSection rejects incomplete, duplicate, and unchanged orders", async () => {
  await assert.rejects(
    () =>
      reorderImagesInSection(
        { DB: createMediaDb() },
        {
          site: "ph",
          page: "portfolio",
          sectionId: "gallery",
          path: "items[0].images",
          order: [0, 0],
          actor: "tdd-suite",
        },
      ),
    /every current image index exactly once/,
  );

  await assert.rejects(
    () =>
      reorderImagesInSection(
        { DB: createMediaDb() },
        {
          site: "ph",
          page: "portfolio",
          sectionId: "gallery",
          path: "items[0].images",
          order: [0],
          actor: "tdd-suite",
        },
      ),
    /Image order is unchanged/,
  );
});

test("updateImageCaption updates and clears one image-use caption", async () => {
  const db = createMediaDb();

  const result = await updateImageCaption(
    { DB: db },
    {
      site: "ph",
      page: "portfolio",
      sectionId: "gallery",
      path: "items[0].images[0]",
      caption: "Didascalia aggiornata",
      actor: "tdd-suite",
    },
  );

  let section = db.pageSections.find((item) => item.section_key === "gallery");
  let image = JSON.parse(section.data).items[0].images[0];
  assert.equal(result.caption, "Didascalia aggiornata");
  assert.equal(image.caption, "Didascalia aggiornata");
  assert.equal(db.sectionRevisions[0].action, "update_image_caption");
  assert.equal(db.changeLog[0].target, "pages/portfolio/sections/gallery/items[0].images[0]/caption");

  const cleared = await updateImageCaption(
    { DB: db },
    {
      site: "ph",
      page: "portfolio",
      sectionId: "gallery",
      path: "items[0].images[0].caption",
      caption: "",
      actor: "tdd-suite",
    },
  );

  section = db.pageSections.find((item) => item.section_key === "gallery");
  image = JSON.parse(section.data).items[0].images[0];
  assert.equal(cleared.caption, null);
  assert.equal(Object.hasOwn(image, "caption"), false);
  assert.equal(db.sectionRevisions[1].action, "update_image_caption");
});

test("updateImageCaption rejects unsupported paths and HTML", async () => {
  await assert.rejects(
    () =>
      updateImageCaption(
        { DB: createMediaDb() },
        {
          site: "ph",
          page: "portfolio",
          sectionId: "gallery",
          path: "items[0].title",
          caption: "Path non valido",
          actor: "tdd-suite",
        },
      ),
    /Field is not editable with update_image_caption/,
  );

  await assert.rejects(
    () =>
      updateImageCaption(
        { DB: createMediaDb() },
        {
          site: "ph",
          page: "portfolio",
          sectionId: "gallery",
          path: "items[0].images[0]",
          caption: "<strong>Non sicura</strong>",
          actor: "tdd-suite",
        },
      ),
    /HTML is not allowed/,
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

test("setImageFocalPoint materializes a missing contracted contact hero image", async () => {
  const db = createMediaDb();
  db.pages.push({
    id: "page_contatti",
    site_id: "site_ph",
    slug: "contatti",
    title: "Contatti",
  });
  db.pageSections.push({
    id: "section_contatti_hero",
    page_id: "page_contatti",
    section_key: "hero",
    type: "hero",
    section_order: 10,
    enabled: 1,
    data: JSON.stringify({
      title: "Contatti",
      intro: "Scrivi per un ritratto.",
    }),
  });

  const result = await setImageFocalPoint(
    { DB: db },
    {
      site: "ph",
      page: "contatti",
      sectionId: "hero",
      path: "image.focalPoint",
      x: 47,
      y: 61,
      actor: "tdd-suite",
    },
  );

  const section = db.pageSections.find((item) => item.id === "section_contatti_hero");
  assert.equal(result.path, "image");
  assert.deepEqual(result.focalPoint, { x: 47, y: 61 });
  assert.deepEqual(JSON.parse(section.data).image, {
    focalPoint: { x: 47, y: 61 },
  });
  assert.equal(db.changeLog[0].target, "pages/contatti/sections/hero/image/focalPoint");
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

test("setImageVisibility hides a contracted image object and records history", async () => {
  const db = createMediaDb();

  const result = await setImageVisibility(
    { DB: db },
    {
      site: "ph",
      page: "portfolio",
      sectionId: "gallery",
      path: "items[0].images[0]",
      enabled: false,
      actor: "tdd-suite",
    },
  );

  assert.equal(result.site, "ph");
  assert.equal(result.page, "portfolio");
  assert.equal(result.sectionId, "gallery");
  assert.equal(result.path, "items[0].images[0]");
  assert.equal(result.enabled, false);
  assert.equal(result.image.enabled, false);

  const section = db.pageSections.find((item) => item.section_key === "gallery");
  const image = JSON.parse(section.data).items[0].images[0];
  assert.equal(image.enabled, false);

  assert.equal(db.sectionRevisions.length, 1);
  assert.equal(db.sectionRevisions[0].action, "set_image_visibility");
  assert.equal(JSON.parse(db.sectionRevisions[0].before_json).data.items[0].images[0].enabled, undefined);
  assert.equal(JSON.parse(db.sectionRevisions[0].after_json).data.items[0].images[0].enabled, false);

  assert.equal(db.changeLog.length, 1);
  assert.equal(db.changeLog[0].action, "set_image_visibility");
  assert.equal(db.changeLog[0].target, "pages/portfolio/sections/gallery/items[0].images[0]/enabled");
});

test("setImageVisibility rejects non-contracted paths and invalid booleans", async () => {
  await assert.rejects(
    () =>
      setImageVisibility(
        { DB: createMediaDb() },
        {
          site: "ph",
          page: "portfolio",
          sectionId: "gallery",
          path: "items[0].images[0].src",
          enabled: false,
          actor: "tdd-suite",
        },
      ),
    /Field is not editable with set_image_visibility/,
  );

  await assert.rejects(
    () =>
      setImageVisibility(
        { DB: createMediaDb() },
        {
          site: "ph",
          page: "portfolio",
          sectionId: "gallery",
          path: "items[0].images[0]",
          enabled: "false",
          actor: "tdd-suite",
        },
      ),
    /Invalid enabled/,
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

function directPngHeader(width, height) {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  bytes.set([0, 0, 0, 13, 73, 72, 68, 82], 8);
  bytes.set([(width >>> 24) & 0xff, (width >>> 16) & 0xff, (width >>> 8) & 0xff, width & 0xff], 16);
  bytes.set([(height >>> 24) & 0xff, (height >>> 16) & 0xff, (height >>> 8) & 0xff, height & 0xff], 20);
  return bytes;
}

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
    title: options.title ?? null,
    tags_json: options.tags_json ?? JSON.stringify(options.tags ?? []),
    notes: options.notes ?? null,
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

  async batch(statements) {
    const results = [];
    for (const statement of statements) {
      results.push(await statement.run());
    }
    return results;
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

    if (query.includes("COUNT(*) AS usage_count") && query.includes("FROM media_usages")) {
      return {
        results: [{
          usage_count: this.mediaUsages.filter((usage) => usage.asset_id === params[0]).length,
        }],
      };
    }

    if (query.includes("FROM media_assets") && query.includes("AND id = ?")) {
      return {
        results: this.mediaAssets.filter((asset) => asset.site_id === params[0] && asset.id === params[1]),
      };
    }
    if (query.includes("FROM media_assets") && query.includes("LIKE ?")) {
      const [siteId, statusFilter, statusValue, queryValue, searchPattern, limit] = params;
      const needle = String(queryValue ?? "").toLowerCase();
      return {
        results: this.mediaAssets
          .filter((asset) => asset.site_id === siteId)
          .filter((asset) => statusFilter === "all" || asset.status === statusValue)
          .filter((asset) => {
            if (!needle) return true;
            const searchable = [
              asset.title,
              asset.tags_json,
              asset.notes,
              asset.alt,
              asset.caption,
            ].join(" ").toLowerCase();
            return searchable.includes(needle) && Boolean(searchPattern);
          })
          .slice(0, limit),
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
        status: status ?? (query.includes("'ready'") ? "ready" : status),
        created_at: "2026-07-15 00:00:01",
        updated_at: "2026-07-15 00:00:01",
      });
      return { success: true };
    }

    if (query.includes("UPDATE media_assets")) {
      if (query.includes("title = ?")) {
        const [title, tagsJson, notes, assetId] = params;
        const asset = this.mediaAssets.find((item) => item.id === assetId);
        asset.title = title;
        asset.tags_json = tagsJson;
        asset.notes = notes;
        asset.updated_at = "2026-07-15 00:00:01";
        return { success: true };
      }

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

    if (query.includes("UPDATE page_sections")) {
      const [data, sectionId] = params;
      const section = this.pageSections.find((item) => item.id === sectionId);
      section.data = data;
      section.updated_at = "2026-07-15 00:00:01";
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

    if (query.includes("DELETE FROM media_assets")) {
      const [assetId, siteId, usageAssetId] = params;
      const asset = this.mediaAssets.find(
        (item) => item.id === assetId && item.site_id === siteId && item.status === "archived",
      );
      const hasUsages = this.mediaUsages.some((usage) => usage.asset_id === usageAssetId);
      if (!asset || hasUsages) {
        return { success: true, meta: { changes: 0 } };
      }

      this.mediaAssets = this.mediaAssets.filter((item) => item.id !== assetId);
      const deletedUploadCount = this.mediaUploads.filter((upload) => upload.asset_id === assetId).length;
      this.mediaUploads = this.mediaUploads.filter((upload) => upload.asset_id !== assetId);
      return { success: true, meta: { changes: 1 + deletedUploadCount } };
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
    this.puts = [];
    this.deletedKeys = [];
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
    this.puts.push({ key, body: bytes, options });
    this.objects[key] = {
      size: bytes.byteLength,
      contentType: options?.httpMetadata?.contentType,
      body: bytes,
    };
    return { key, size: bytes.byteLength };
  }

  async delete(key) {
    if (this.deleteError) throw this.deleteError;
    this.deletedKeys.push(key);
    delete this.objects[key];
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
