// Path resolution for the gated private document library.
//
// The 76 internal HTML documents (business models, schemas, client process
// sets) used to live under `public/workflows/private/`, which Next serves
// statically with no gate at all — the access check on the surrounding pages
// was decorative. They now live in `private-docs/`, outside `public/`, and the
// only way to reach them is `app/workflows/private/[...path]/route.ts`, which
// verifies the signed gate cookie first.
//
// Serving files by a URL-supplied path is the classic traversal sink, so the
// resolution is a pure function with its own tests rather than a few lines
// inside the route handler.

import { readFile } from "node:fs/promises";
import path from "node:path";

// The root is relative to the repo, so it is also what
// next.config.mjs `outputFileTracingIncludes` must bundle into the lambda.
export const PRIVATE_DOCS_ROOT_SEGMENTS = ["private-docs", "workflows", "private"] as const;

export function privateDocsRoot(cwd: string): string {
  return path.join(cwd, ...PRIVATE_DOCS_ROOT_SEGMENTS);
}

const EXTENSION_CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

// Anything not on this list 404s rather than being served with a guessed type.
// The library ships only these three extensions today (71 html, 4 webp, 1 svg),
// and an unknown extension under this root is far more likely to be a mistake
// than a new asset kind.
export function contentTypeFor(filePath: string): string | null {
  return EXTENSION_CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? null;
}

/**
 * Resolve URL path segments to an absolute file path inside `root`, or null if
 * the request is not a plain descendant of it.
 *
 * Next has already percent-decoded the catch-all segments by the time they get
 * here, so `..%2F..%2Fpackage.json` arrives as the single segment
 * `../../package.json`. That is why the segment checks run on the decoded
 * strings and why the resolved path is re-checked against the root afterwards:
 * the character rules catch the known shapes, the containment check catches
 * whatever they miss.
 */
export function resolvePrivateDocPath(root: string, segments: string[]): string | null {
  if (segments.length === 0) return null;

  for (const segment of segments) {
    if (!segment) return null;
    if (segment === "." || segment === "..") return null;
    // Path separators (either flavour) and NUL can only appear in a segment if
    // something was encoded to smuggle them past the router.
    if (segment.includes("/") || segment.includes("\\") || segment.includes("\0")) return null;
    // No dotfiles. Nothing in the library starts with a dot, and this closes
    // the door on .env-style probes without depending on the root check.
    if (segment.startsWith(".")) return null;
  }

  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...segments);

  // Compare on a path boundary: a bare startsWith would accept a sibling
  // directory whose name merely extends the root's (…/private-secrets).
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) return null;

  const contentType = contentTypeFor(resolved);
  if (contentType === null) return null;

  return resolved;
}

export interface PrivateDoc {
  body: ArrayBuffer;
  contentType: string;
}

/**
 * Read one document out of the private library, or null if the path is not a
 * plain descendant of the root, carries an extension the library does not ship,
 * or simply does not exist.
 *
 * A rejected path and a missing file are deliberately indistinguishable: a
 * traversal attempt should learn nothing about what is or is not on disk.
 *
 * Callers must verify the gate before serving what this returns. It is shared
 * by the catch-all route and by e8/[slug], which needs it because a `.html`
 * request under e8/ reaches that more specific dynamic segment first.
 */
export async function readPrivateDoc(segments: string[]): Promise<PrivateDoc | null> {
  const filePath = resolvePrivateDocPath(privateDocsRoot(process.cwd()), segments);
  if (filePath === null) return null;

  const contentType = contentTypeFor(filePath);
  if (contentType === null) return null;

  try {
    // Read as bytes, not text: the library ships .webp and .svg alongside the
    // HTML, and decoding those as UTF-8 would corrupt them. Node hands back a
    // Buffer over a pooled ArrayBuffer, so slice out just this file's bytes.
    const file = await readFile(filePath);
    const body = file.buffer.slice(
      file.byteOffset,
      file.byteOffset + file.byteLength,
    ) as ArrayBuffer;
    return { body, contentType };
  } catch {
    return null;
  }
}

// Headers every private document is served with, wherever it is served from.
export const PRIVATE_DOC_HEADERS = {
  "Cache-Control": "no-store, must-revalidate",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

// A slug carrying a file extension is one of the moved static documents, not a
// Supabase Storage object — Storage slugs are extension-less, and the Storage
// route appends ".html" to them itself.
export function looksLikeFileName(slug: string): boolean {
  return path.extname(slug) !== "";
}
