// Which authenticated surface a request is on, for screens that are served on
// two of them. The Revenue section renders the same pages at /admin/revenue and
// /team/revenue, so its links, redirects and cache refreshes must follow the
// surface the viewer is on rather than hardcode /admin.
//
// This file is dependency-free so middleware (edge), server components and
// client components can all import it.

export type Surface = "admin" | "team";

// Set by middleware on every /admin and /team request; read by surfaceBase().
export const SURFACE_HEADER = "x-e8-surface";

export function surfaceOf(pathname: string): Surface {
  return pathname === "/team" || pathname.startsWith("/team/") ? "team" : "admin";
}

export function baseOf(surface: Surface): "/admin" | "/team" {
  return surface === "team" ? "/team" : "/admin";
}
