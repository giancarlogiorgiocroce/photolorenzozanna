import { listSectionContracts } from "./page-contracts.mjs";

const PRESETS = [
  {
    id: "faq",
    title: "FAQ",
    type: "faq",
    styleContract: "common.faq",
    defaultSectionId: "faq",
    addable: true,
    addTool: "add_faq_section",
    itemTools: ["add_faq_item", "update_faq_item", "remove_faq_item", "reorder_faq_items"],
    maxItems: 12,
    allowsHtml: false,
  },
  {
    id: "text",
    title: "Text",
    type: "text",
    styleContract: "generic.text",
    defaultSectionId: "text",
    addable: false,
    addTool: "add_section_from_preset",
    allowsHtml: false,
    note: "Definition ready; add_section_from_preset support should be enabled after page-specific ordering rules are finalized.",
  },
  {
    id: "cta",
    title: "CTA",
    type: "cta",
    styleContract: "common.cta",
    defaultSectionId: "cta",
    addable: false,
    addTool: "add_section_from_preset",
    allowsHtml: false,
    note: "Definition ready; add flow should validate link intent and avoid duplicate page CTAs.",
  },
  {
    id: "gallery",
    title: "Gallery",
    type: "gallery",
    styleContract: "portfolio.gallery",
    defaultSectionId: "gallery",
    addable: false,
    addTool: "add_section_from_preset",
    allowsHtml: false,
    note: "Requires the media pipeline before new gallery sections can be added safely.",
  },
  {
    id: "image_text",
    title: "Image + Text",
    type: "text",
    styleContract: "generic.text",
    defaultSectionId: "image_text",
    addable: false,
    addTool: "add_section_from_preset",
    allowsHtml: false,
    note: "Needs a dedicated renderer/style contract before AI clients can add it.",
  },
];

export function listSectionPresets() {
  const contracts = listSectionContracts();

  return {
    version: "section_presets_v1",
    htmlAllowed: false,
    presets: PRESETS.map((preset) => ({
      ...preset,
      editableFields: contracts[preset.styleContract]?.editableFields ?? [],
    })),
  };
}

export function getSectionPreset(id) {
  return listSectionPresets().presets.find((preset) => preset.id === id) ?? null;
}
