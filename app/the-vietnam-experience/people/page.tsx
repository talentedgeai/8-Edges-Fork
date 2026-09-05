// Route file: the body lives in entities/retreats/routes/the-vietnam-experience/people/page.tsx (ME-06).
// The names are listed one by one rather than `export *` because Next reads a
// route file's export names statically: the metadata-route loader turns a star
// re-export into `export { , runtime }`, which does not parse.
export { default, metadata } from "@/entities/retreats/routes/the-vietnam-experience/people/page";
