import assert from "node:assert/strict";
import test from "node:test";

import { resolveEditableField, resolveSectionContract } from "../src/page-contracts.mjs";

test("resolveSectionContract maps page-specific sections to style contracts", () => {
  const hero = resolveSectionContract("portfolio", {
    section_key: "hero",
    type: "hero",
  });
  const gallery = resolveSectionContract("portfolio", {
    section_key: "gallery",
    type: "gallery",
  });
  const faq = resolveSectionContract("portfolio", {
    section_key: "faq",
    type: "faq",
  });

  assert.equal(hero.styleContract, "portfolio.page_hero");
  assert.deepEqual(
    hero.editableFields.map((field) => field.path),
    ["eyebrow", "title", "intro"],
  );
  assert.equal(hero.editableFields.find((field) => field.path === "intro").kind, "rich_text");

  assert.equal(gallery.styleContract, "portfolio.gallery");
  assert.equal(gallery.editableFields.find((field) => field.path === "items[].images[].alt").kind, "plain_text");
  assert.equal(gallery.editableFields.find((field) => field.path === "items[].images[].enabled").kind, "boolean");

  assert.equal(faq.styleContract, "common.faq");
  assert.equal(faq.editableFields.find((field) => field.path === "items[].answer").kind, "rich_text");
});

test("home selected work exposes its Portfolio source instead of stale local shot fields", () => {
  const contract = resolveSectionContract("home", {
    section_key: "text_2",
    type: "text",
  });

  assert.equal(contract.styleContract, "home.selected_work");
  assert.deepEqual(
    contract.editableFields.map((field) => field.path),
    ["kicker", "title", "intro"],
  );
  assert.equal(
    resolveEditableField(
      "home",
      {
        section_key: "text_2",
        type: "text",
      },
      "shots[0].caption",
    ),
    null,
  );

  const dependency = contract.contentDependencies[0];
  assert.equal(dependency.role, "portfolio_shortcuts");
  assert.equal(dependency.sourcePage, "portfolio");
  assert.equal(dependency.sourceSectionId, "gallery");
  assert.equal(dependency.coverImagePath, "items[].images[0]");
  assert.deepEqual(
    dependency.selectedItems.map((item) => item.href),
    ["/portfolio#ritratti", "/portfolio#natura", "/portfolio#strada"],
  );
  assert.deepEqual(
    dependency.editableFields.map((field) => [field.path, field.tool]),
    [
      ["items[].title", "update_text"],
      ["items[].images[0].assetId", "replace_image"],
      ["items[].images[0].focalPoint", "set_image_focal_point"],
      ["items[].images[0].alt", "update_text"],
      ["items[].images[0].enabled", "update_text"],
    ],
  );
});

test("resolveSectionContract falls back to generic text for legacy text sections", () => {
  const contract = resolveSectionContract("portfolio", {
    section_key: "text_2",
    type: "text",
  });

  assert.equal(contract.styleContract, "portfolio.series_text");
  assert.equal(contract.editableFields.find((field) => field.path === "subsections[].paragraphs").kind, "rich_text");
});

test("resolveSectionContract exposes the contact band as an editable contact contract", () => {
  const contract = resolveSectionContract("contatti", {
    section_key: "contact-band",
    type: "text",
  });

  assert.equal(contract.styleContract, "contact.band");
  assert.deepEqual(
    contract.editableFields.map((field) => field.path),
    ["channels[].label", "channels[].value", "channels[].href", "channels[].enabled"],
  );

  const channelValue = resolveEditableField(
    "contatti",
    {
      section_key: "contact-band",
      type: "text",
    },
    "channels[0].value",
  );
  const channelHref = resolveEditableField(
    "contatti",
    {
      section_key: "contact-band",
      type: "text",
    },
    "channels[1].href",
  );

  assert.equal(channelValue.kind, "plain_text");
  assert.equal(channelHref.kind, "link");
  assert.equal(channelHref.nullable, true);
  assert.equal(
    resolveEditableField(
      "contatti",
      {
        section_key: "contact-band",
        type: "text",
      },
      "channels[2].enabled",
    ).kind,
    "boolean",
  );
});

test("resolveEditableField matches concrete paths against section wildcard contracts", () => {
  const faqQuestion = resolveEditableField(
    "portfolio",
    {
      section_key: "faq",
      type: "faq",
    },
    "items[0].question",
  );
  const galleryCaption = resolveEditableField(
    "portfolio",
    {
      section_key: "gallery",
      type: "gallery",
    },
    "items[1].images[2].caption",
  );

  assert.equal(faqQuestion.path, "items[].question");
  assert.equal(faqQuestion.kind, "plain_text");
  assert.equal(galleryCaption.path, "items[].images[].caption");
  assert.equal(galleryCaption.kind, "plain_text");
  assert.equal(galleryCaption.tool, "update_image_caption");
  assert.equal(galleryCaption.fallbackTool, "update_text");
  assert.equal(
    resolveEditableField(
      "portfolio",
      {
        section_key: "faq",
        type: "faq",
      },
      "items[0].href",
    ),
    null,
  );
});

test("resolveEditableField exposes image asset fields without allowing free src edits", () => {
  const homeHeroAsset = resolveEditableField(
    "home",
    {
      section_key: "hero",
      type: "hero",
    },
    "image.assetId",
  );
  const galleryAsset = resolveEditableField(
    "portfolio",
    {
      section_key: "gallery",
      type: "gallery",
    },
    "items[1].images[2].assetId",
  );
  const galleryImages = resolveEditableField(
    "portfolio",
    {
      section_key: "gallery",
      type: "gallery",
    },
    "items[1].images",
  );
  const galleryFocalPoint = resolveEditableField(
    "portfolio",
    {
      section_key: "gallery",
      type: "gallery",
    },
    "items[1].images[2].focalPoint",
  );
  const galleryEnabled = resolveEditableField(
    "portfolio",
    {
      section_key: "gallery",
      type: "gallery",
    },
    "items[1].images[2].enabled",
  );
  const gallerySrc = resolveEditableField(
    "portfolio",
    {
      section_key: "gallery",
      type: "gallery",
    },
    "items[1].images[2].src",
  );

  assert.equal(homeHeroAsset.kind, "media_asset");
  assert.equal(homeHeroAsset.tool, "replace_image");
  assert.equal(galleryImages.kind, "media_asset_list");
  assert.equal(galleryImages.tool, "attach_image_to_section");
  assert.equal(galleryImages.removeTool, "remove_image_from_section");
  assert.equal(galleryImages.reorderTool, "reorder_images_in_section");
  assert.equal(galleryAsset.kind, "media_asset");
  assert.equal(galleryAsset.tool, "replace_image");
  assert.equal(galleryFocalPoint.kind, "focal_point");
  assert.equal(galleryFocalPoint.tool, "set_image_focal_point");
  assert.equal(galleryEnabled.kind, "boolean");
  assert.equal(galleryEnabled.tool, "update_text");
  assert.equal(
    resolveEditableField(
      "portfolio",
      {
        section_key: "gallery",
        type: "gallery",
      },
      "items[1].images[2].variant",
    ).tool,
    "update_text",
  );
  assert.equal(gallerySrc, null);
});

test("resolveEditableField exposes transitional paths for current structured page data", () => {
  const aboutValue = resolveEditableField(
    "chi-sono",
    {
      section_key: "text_3",
      type: "text",
    },
    "subsections[0].title",
  );
  const contactAvailability = resolveEditableField(
    "contatti",
    {
      section_key: "text_2",
      type: "text",
    },
    "subsections[1].paragraphs",
  );

  assert.equal(aboutValue.kind, "plain_text");
  assert.equal(aboutValue.path, "subsections[].title");
  assert.equal(contactAvailability.kind, "rich_text");
  assert.equal(contactAvailability.path, "subsections[].paragraphs");
});
