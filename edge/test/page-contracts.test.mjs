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

  assert.equal(faq.styleContract, "common.faq");
  assert.equal(faq.editableFields.find((field) => field.path === "items[].answer").kind, "rich_text");
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
