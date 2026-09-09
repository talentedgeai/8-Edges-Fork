// Route file: the body lives in entities/retreats/api/my-retreat/access/route.ts (ME-06).
// The names are listed one by one rather than `export *` because Next reads a
// route file's export names statically: the metadata-route loader turns a star
// re-export into `export { , runtime }`, which does not parse.
export { POST } from "@/entities/retreats/api/my-retreat/access/route";
