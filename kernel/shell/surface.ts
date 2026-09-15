// Server half of the two-surface helpers (see surface-shared.ts).

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { SURFACE_HEADER, baseOf, type Surface } from "./surface-shared";

// The surface of the current request, from the header middleware stamps. A
// request middleware did not see (a cron, a script) reads as admin, which is
// where every shared screen lived before it had a second surface.
export function currentSurface(): Surface {
  try {
    return headers().get(SURFACE_HEADER) === "team" ? "team" : "admin";
  } catch {
    return "admin";
  }
}

// "/admin" or "/team", to prefix a link: `${surfaceBase()}/revenue/deals`.
export function surfaceBase(): "/admin" | "/team" {
  return baseOf(currentSurface());
}

// A write made from either surface must refresh the page on both, or the
// other surface keeps serving the stale render. `path` starts after the
// surface, for instance "/revenue/deals".
export function revalidateSurfaces(path: string, type?: "page" | "layout"): void {
  revalidatePath(`/admin${path}`, type);
  revalidatePath(`/team${path}`, type);
}
