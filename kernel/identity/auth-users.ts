// Supabase auth-user lookups shared by everything that provisions or signs in
// a person: the admin portal-invite engine, the admin team actions, the portal
// login and the team sign-in link. They read auth.users through the
// service-role client and nothing else, which makes them identity rather than
// any one product's concern; ME-11 moved them here out of
// lib/admin/portal-invite so the team entity stops importing that module
// (it carries the admin session guard along with these two helpers).
import { supabase } from "@/kernel/data/supabase";

export async function findAuthUserByEmail(email: string): Promise<{ id: string } | null> {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error || !data?.users) return null;
  const match = data.users.find((u) => (u.email ?? "").trim().toLowerCase() === email);
  return match ? { id: match.id } : null;
}

// Supabase's ban is a timestamp; a ban in the past is no ban at all.
export function bannedUntil(user: unknown): string | null {
  const v = (user as { banned_until?: string | null } | null)?.banned_until;
  return v && new Date(v).getTime() > Date.now() ? v : null;
}
