const RICH_TEXT_TOOLS = {
  plainTextTool: "update_text",
  richTextTool: "update_rich_text",
};

const FIELD = {
  eyebrow: { path: "eyebrow", kind: "plain_text", maxLength: 60 },
  kicker: { path: "kicker", kind: "plain_text", maxLength: 60 },
  title: { path: "title", kind: "plain_text", maxLength: 90 },
  intro: { path: "intro", kind: "rich_text", maxLength: 700, ...RICH_TEXT_TOOLS },
  text: { path: "text", kind: "rich_text", maxLength: 900, ...RICH_TEXT_TOOLS },
  paragraphs: { path: "paragraphs", kind: "rich_text", maxLength: 1200, ...RICH_TEXT_TOOLS },
  subsectionsTitle: { path: "subsections[].title", kind: "plain_text", maxLength: 90 },
  subsectionsParagraphs: {
    path: "subsections[].paragraphs",
    kind: "rich_text",
    maxLength: 900,
    ...RICH_TEXT_TOOLS,
  },
  cta: { path: "cta", kind: "link" },
  primaryCta: { path: "primaryCta", kind: "link" },
  secondaryCta: { path: "secondaryCta", kind: "link" },
  imageAsset: { path: "image.assetId", kind: "media_asset", tool: "replace_image" },
  imageFocalPoint: { path: "image.focalPoint", kind: "focal_point", tool: "set_image_focal_point" },
  imageAlt: { path: "image.alt", kind: "plain_text", maxLength: 180 },
  faqQuestion: { path: "items[].question", kind: "plain_text", maxLength: 160 },
  faqAnswer: { path: "items[].answer", kind: "rich_text", maxLength: 700, ...RICH_TEXT_TOOLS },
  galleryGroupTitle: { path: "items[].title", kind: "plain_text", maxLength: 90 },
  galleryImageAsset: { path: "items[].images[].assetId", kind: "media_asset", tool: "replace_image" },
  galleryImageFocalPoint: {
    path: "items[].images[].focalPoint",
    kind: "focal_point",
    tool: "set_image_focal_point",
  },
  galleryImageAlt: { path: "items[].images[].alt", kind: "plain_text", maxLength: 180 },
  galleryImageCaption: { path: "items[].images[].caption", kind: "plain_text", maxLength: 120 },
  contactChannelLabel: { path: "channels[].label", kind: "plain_text", maxLength: 40 },
  contactChannelValue: { path: "channels[].value", kind: "plain_text", maxLength: 120 },
  contactChannelHref: { path: "channels[].href", kind: "link", nullable: true },
  contactChannelEnabled: { path: "channels[].enabled", kind: "boolean", tool: "update_contact_channel" },
  listItems: { path: "items[]", kind: "plain_text", maxLength: 180 },
};

const CONTRACTS = {
  "home.hero": {
    styleContract: "home.hero",
    editableFields: [
      FIELD.eyebrow,
      FIELD.title,
      FIELD.intro,
      FIELD.primaryCta,
      FIELD.secondaryCta,
      FIELD.imageAsset,
      FIELD.imageFocalPoint,
      FIELD.imageAlt,
    ],
  },
  "home.selected_work": {
    styleContract: "home.selected_work",
    editableFields: [
      FIELD.kicker,
      FIELD.title,
      FIELD.intro,
      { path: "shots[].assetId", kind: "media_asset", tool: "replace_image" },
      { path: "shots[].focalPoint", kind: "focal_point", tool: "set_image_focal_point" },
      { path: "shots[].caption", kind: "plain_text", maxLength: 80 },
      { path: "shots[].alt", kind: "plain_text", maxLength: 180 },
      { path: "shots[].variant", kind: "enum", values: ["standard", "wide"] },
    ],
  },
  "home.split_section": {
    styleContract: "home.split_section",
    editableFields: [FIELD.kicker, FIELD.title, FIELD.text, FIELD.cta],
  },
  "about.hero": {
    styleContract: "about.hero",
    editableFields: [FIELD.eyebrow, FIELD.title, FIELD.intro, FIELD.imageAsset, FIELD.imageFocalPoint, FIELD.imageAlt],
  },
  "about.manifesto": {
    styleContract: "about.manifesto",
    editableFields: [FIELD.kicker, FIELD.title, FIELD.paragraphs],
  },
  "about.values_grid": {
    styleContract: "about.values_grid",
    editableFields: [
      { path: "items[].title", kind: "plain_text", maxLength: 90 },
      { path: "items[].text", kind: "rich_text", maxLength: 500, ...RICH_TEXT_TOOLS },
      FIELD.subsectionsTitle,
      FIELD.subsectionsParagraphs,
    ],
  },
  "contact.hero": {
    styleContract: "contact.hero",
    editableFields: [FIELD.eyebrow, FIELD.title, FIELD.intro, FIELD.imageAsset, FIELD.imageFocalPoint, FIELD.imageAlt],
  },
  "contact.band": {
    styleContract: "contact.band",
    editableFields: [
      FIELD.contactChannelLabel,
      FIELD.contactChannelValue,
      FIELD.contactChannelHref,
      FIELD.contactChannelEnabled,
    ],
  },
  "contact.availability": {
    styleContract: "contact.availability",
    editableFields: [FIELD.kicker, FIELD.title, FIELD.listItems, FIELD.subsectionsTitle, FIELD.subsectionsParagraphs],
  },
  "portfolio.page_hero": {
    styleContract: "portfolio.page_hero",
    editableFields: [FIELD.eyebrow, FIELD.title, FIELD.intro],
  },
  "portfolio.series_text": {
    styleContract: "portfolio.series_text",
    editableFields: [FIELD.title, FIELD.paragraphs, FIELD.subsectionsTitle, FIELD.subsectionsParagraphs],
  },
  "portfolio.gallery": {
    styleContract: "portfolio.gallery",
    editableFields: [
      FIELD.galleryGroupTitle,
      FIELD.galleryImageAsset,
      FIELD.galleryImageFocalPoint,
      FIELD.galleryImageAlt,
      FIELD.galleryImageCaption,
    ],
  },
  "common.faq": {
    styleContract: "common.faq",
    editableFields: [FIELD.title, FIELD.intro, FIELD.faqQuestion, FIELD.faqAnswer],
  },
  "common.cta": {
    styleContract: "common.cta",
    editableFields: [FIELD.kicker, FIELD.title, FIELD.text, FIELD.primaryCta],
  },
  "generic.text": {
    styleContract: "generic.text",
    editableFields: [FIELD.title, FIELD.paragraphs, FIELD.subsectionsTitle, FIELD.subsectionsParagraphs],
  },
};

const SECTION_CONTRACTS = new Map([
  ["home/hero", "home.hero"],
  ["home/text_2", "home.selected_work"],
  ["home/text_3", "home.split_section"],
  ["chi-sono/hero", "about.hero"],
  ["chi-sono/text_2", "about.manifesto"],
  ["chi-sono/text_3", "about.values_grid"],
  ["contatti/hero", "contact.hero"],
  ["contatti/contact-band", "contact.band"],
  ["contatti/text_2", "contact.availability"],
  ["portfolio/hero", "portfolio.page_hero"],
  ["portfolio/text_2", "portfolio.series_text"],
  ["portfolio/gallery", "portfolio.gallery"],
]);

const TYPE_CONTRACTS = new Map([
  ["faq", "common.faq"],
  ["cta", "common.cta"],
  ["text", "generic.text"],
]);

export function resolveSectionContract(pageSlug, section) {
  const sectionKey = section?.section_key ?? section?.sectionId ?? "";
  const type = section?.type ?? "";
  const contractName = SECTION_CONTRACTS.get(`${pageSlug}/${sectionKey}`)
    ?? TYPE_CONTRACTS.get(type)
    ?? "generic.text";
  return cloneContract(CONTRACTS[contractName] ?? CONTRACTS["generic.text"]);
}

export function resolveEditableField(pageSlug, section, concretePath) {
  const contract = resolveSectionContract(pageSlug, section);
  return contract.editableFields.find((field) => fieldPathMatches(field.path, concretePath)) ?? null;
}

export function listSectionContracts() {
  return Object.fromEntries(
    Object.entries(CONTRACTS).map(([name, contract]) => [name, cloneContract(contract)]),
  );
}

function cloneContract(contract) {
  return {
    styleContract: contract.styleContract,
    editableFields: contract.editableFields.map((field) => ({ ...field })),
  };
}

function fieldPathMatches(contractPath, concretePath) {
  if (contractPath === concretePath) return true;

  const pattern = `^${escapeRegExp(contractPath).replaceAll("\\[\\]", "\\[(?:0|[1-9]\\d*)\\]")}$`;
  return new RegExp(pattern).test(concretePath);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
