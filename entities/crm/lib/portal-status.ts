import { supabase } from "@/kernel/data/supabase";

// Portal access has three states, distinguished by the auth account:
//   none    — no auth_user_id linked yet (never invited)
//   invited — linked, but the person has never signed in (last_sign_in_at null)
//   active  — linked and has signed in at least once
export type PortalStatus = "none" | "invited" | "active";

// The subset of the given auth_user_ids that have signed in at least once.
// Uses the service-role admin API (last_sign_in_at isn't exposed to PostgREST).
// The company is small, so one listUsers page usually covers it; the loop is a
// safety net.
export async function getSignedInAuthUserIds(ids: string[]): Promise<Set<string>> {
  const wanted = new Set(ids.filter(Boolean));
  const signedIn = new Set<string>();
  if (wanted.size === 0) return signedIn;

  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error || !data) break;
    for (const u of data.users) {
      if (wanted.has(u.id) && u.last_sign_in_at) signedIn.add(u.id);
    }
    if (data.users.length < perPage) break;
    page++;
  }
  return signedIn;
}

export function portalStatusOf(
  authUserId: string | null | undefined,
  signedIn: Set<string>,
): PortalStatus {
  if (!authUserId) return "none";
  return signedIn.has(authUserId) ? "active" : "invited";
}
