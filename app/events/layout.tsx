// Route file: the body lives in entities/retreats/routes/events/layout.tsx (ME-06).
// The names are listed one by one rather than `export *` because Next reads a
// route file's export names statically: the metadata-route loader turns a star
// re-export into `export { , runtime }`, which does not parse.
// The stylesheets stay at the composition root: they sit under app/styles, which
// the kernel owns but has not moved yet, and an entity may not import app/.
import "@/app/styles/site-components.css";
import "@/app/styles/utilities.css";
export { default } from "@/entities/retreats/routes/events/layout";
