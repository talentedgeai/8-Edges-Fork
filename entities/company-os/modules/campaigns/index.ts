// The campaigns module's door (ME-12; AR-28 lands inside this module): the
// marketing engine, campaigns, calendar, broadcasts, brand profiles, blog
// publishing and the brand and campaign AI prompts.
// Sibling modules and the rest of the entity reach campaigns only through this file —
// the generated ESLint zones enforce it for siblings — so the module can change
// its files without the rest of the company-os entity noticing.
export * from "./ai/brand-image";
export * from "./ai/brand-writer";
export * from "./ai/campaign-seo";
export * from "./ai/entry-copy";
export * from "./blog-publish";
export * from "./books";
export * from "./brand-profiles";
export * from "./brand-sites";
export * from "./broadcasts";
export * from "./markdown";
export * from "./marketing";
export * from "./marketing-calendar";
export * from "./marketing-campaigns";
export * from "./marketing-engine";
export * from "./marketing-images";
export * from "./publish-editor/system-prompt";
export * from "./publish-editor/tools";
export * from "./seo";
export * from "./style-catalogues";
