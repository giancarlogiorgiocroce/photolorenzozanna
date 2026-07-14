import assert from "node:assert/strict";
import test from "node:test";

import { listSectionPresets } from "../src/section-presets.mjs";

test("listSectionPresets exposes safe structured presets without HTML editing", () => {
  const result = listSectionPresets();
  const presetIds = result.presets.map((preset) => preset.id);
  const faq = result.presets.find((preset) => preset.id === "faq");
  const imageText = result.presets.find((preset) => preset.id === "image_text");

  assert.deepEqual(presetIds, ["faq", "text", "cta", "gallery", "image_text"]);
  assert.equal(faq.type, "faq");
  assert.equal(faq.styleContract, "common.faq");
  assert.equal(faq.allowsHtml, false);
  assert.equal(faq.addTool, "add_faq_section");
  assert.deepEqual(
    faq.editableFields.map((field) => field.path),
    ["title", "intro", "items[].question", "items[].answer"],
  );
  assert.equal(imageText.addable, false);
  assert.match(imageText.note, /renderer/);
});
