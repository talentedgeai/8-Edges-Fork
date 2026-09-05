// The site entity's public surface. Everything outside entities/site reaches the
// public marketing site through this file (multi-entity design §3, rules 1 and 2):
// the root layout mounts the site chrome, and two retreats pages reuse the site's
// reveal observer and video carousel.
//
// It is a server-only barrel (design §3, "two doors"): the content helpers at
// the bottom touch Supabase, the filesystem and Resend. A "use client" component
// imports ./client.ts instead, which carries only browser-safe code.
export { default as SiteFrame } from "./ui/SiteFrame";
export { default as RevealObserver } from "./ui/RevealObserver";
export { VideoCarousel } from "./ui/VideoCarousel";

// --- Content helpers other entities read (ME-13) ---------------------------
// Until ME-13 these resolved through one-line shims at their old lib/ paths;
// the shims are gone and the callers come here. Everything below touches
// Supabase, the filesystem or Resend, which is why this door is server-only
// and a "use client" component takes the gallery vocabulary from ./client.ts.
export { BLOG_CACHE_TAG, getAllPublishedPosts, postTag } from "./lib/blog";
export { categories, type PostMeta } from "./lib/postData";
export { faqPageSchema, jsonLd } from "./lib/seo";
export { sendMarketingEmail } from "./lib/marketing-email";
export {
  addPhotoTag,
  collageAvatars,
  deleteGalleryPhoto,
  listGalleryPhotos,
  randomGalleryPhotos,
  recordGalleryPhoto,
  removePhotoTag,
  signedGalleryUpload,
  taggablePeople,
  updateGalleryPhoto,
  type CollageAvatar,
  type GalleryPhoto,
  type Result,
} from "./lib/gallery";

// --- retreats: the shared Open Graph card renderer (CommonJS, Node runtime) --
// Twelve retreats opengraph-image routes render their share card with it; every
// such route declares `runtime = "nodejs"` in app/, which the renderer's fs
// reads require.
export { CARDS, OG_SIZE, renderCard } from "./lib/ogRender";
