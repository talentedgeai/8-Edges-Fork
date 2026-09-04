// Readable application URLs: <folded-name>-<short-code>, e.g. "nguyen-thi-mai-a7dfed24".
// The short code is the first 8 hex of the application's uuid, so there is no slug
// column and no uniqueness to maintain — the page resolves the code back to the row.
// Pure and client-safe: imported by the list/board (client components) to build links,
// and by the detail page (server) to resolve and canonicalize them.

// The uuid's first dash-group is exactly its first 8 hex characters.
const SHORT_LEN = 8;

// Fold a display name to an ASCII slug segment. NFD decomposes accented Latin
// (including Vietnamese ơ/ư/â/ê and the tone marks) into base letter + combining
// marks, which we strip; đ/Đ do NOT decompose, so they are replaced explicitly.
// "Nguyễn Thị Mai" -> "nguyen-thi-mai". Same folding as lib/slug.ts#slugify, kept
// separate because application slugs cap at 60 and are paired with a short code.
export function foldName(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d") // đ
    .replace(/Đ/g, "d") // Đ
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// The 8-hex code for an application id.
export function shortCode(id: string): string {
  return id.slice(0, SHORT_LEN);
}

// The canonical slug for an application. A blank/empty name collapses to just the
// short code, which still resolves.
export function appSlug(name: string | null | undefined, id: string): string {
  return [foldName(name || ""), shortCode(id)].filter(Boolean).join("-");
}

// The canonical detail path.
export function appPath(name: string | null | undefined, id: string): string {
  return `/admin/talent/applications/${appSlug(name, id)}`;
}

// Deals share the same name+short-code scheme. The "name" is the deal's own
// label (title, else contact/company), folded the same way. Resolution on the
// detail route reuses shortOf/shortCodeRange/isUuid below, exactly as
// applications do — there is no slug column to maintain.
export function dealSlug(label: string | null | undefined, id: string): string {
  return [foldName(label || ""), shortCode(id)].filter(Boolean).join("-");
}

// The canonical deal detail path.
export function dealPath(label: string | null | undefined, id: string): string {
  return `/admin/revenue/deals/${dealSlug(label, id)}`;
}

// The trailing hyphen group of a slug — the candidate short code by construction.
export function shortOf(slug: string): string {
  return slug.slice(slug.lastIndexOf("-") + 1).toLowerCase();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHORT_RE = /^[0-9a-f]{8}$/;

export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

export function isShortCode(s: string): boolean {
  return SHORT_RE.test(s);
}

// The inclusive uuid bounds that select every id whose first 8 hex match `short`.
// PostgREST cannot ILIKE a uuid column, so resolution uses this range instead.
export function shortCodeRange(short: string): { lo: string; hi: string } {
  return {
    lo: `${short}-0000-0000-0000-000000000000`,
    hi: `${short}-ffff-ffff-ffff-ffffffffffff`,
  };
}
