// Route file: the body lives in entities/retreats/routes/vietnam-adventure-info-form/layout.tsx (ME-06).
// The names are listed one by one rather than `export *` because Next reads a
// route file's export names statically: the metadata-route loader turns a star
// re-export into `export { , runtime }`, which does not parse.
// The stylesheets stay at the composition root — app/styles is kernel-owned but
// has not moved, and an entity may not import app/ — and they keep the order the
// layout imported them in, because the cascade depends on it.
import "@/entities/retreats/routes/vietnam-adventure-info-form/vietnam-adventure-info-form.css";
import "@/app/styles/site-components.css";
import "@/app/styles/utilities.css";
export { default } from "@/entities/retreats/routes/vietnam-adventure-info-form/layout";
