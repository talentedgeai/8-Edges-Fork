// The paths the edge middleware lets through without a session (middleware.ts).
//
// Every page under an `(auth)` route group — login, verify, callback,
// reset-password, change-password — must be reachable session-less: invite and
// recovery links carry the session in the URL *hash*, which never reaches the
// server, and the verify interstitials redeem an emailed token_hash for people
// who have no session yet. Bouncing any of them to login strands the user
// (PR #1022 fixed /verify; the bug-hunt of 2026-09-05 found /admin/reset-password
// had the same fault on production). The list lives here, not inline, so
// kernel/identity/sessionless-paths.test.ts can hold it against the `(auth)`
// groups on disk: a new auth page that is not listed fails the test.
//
// Edge-safe: no imports, so middleware.ts can use it.
export const SESSIONLESS_PREFIXES: readonly string[] = [
  "/admin/login",
  "/admin/reset-password",
  "/admin/verify",
  "/team/callback",
  "/team/change-password",
  "/team/login",
  "/team/verify",
  "/portal/callback",
  "/portal/change-password",
  "/portal/login",
  "/portal/verify",
  "/api/auth",
];

export function isSessionlessPath(pathname: string): boolean {
  return SESSIONLESS_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
