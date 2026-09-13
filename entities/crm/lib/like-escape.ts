/**
 * Escapes the LIKE/ILIKE wildcards in a literal, so it can only match itself.
 *
 * The portal sign-in-link flow looks a contact up with `.ilike("email", …)` on
 * the address the visitor typed. ILIKE reads `%` as "any run of characters" and
 * `_` as "any one character", so without this, `%@example.com` matches every
 * address at that domain and resolves to somebody else's portal membership.
 * The backslash is escaped first — otherwise an input could smuggle in an
 * escape of its own and leave a live wildcard behind.
 *
 * It sits in its own file rather than inside portal-invite.ts so it can be
 * covered directly, without importing that module's Supabase and email
 * dependencies.
 */
export function escapeLikeLiteral(value: string): string {
  return value.replace(/([%_\\])/g, "\\$1");
}
