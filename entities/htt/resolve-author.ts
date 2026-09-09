// Ported from the Human Token Tracker (lib/sync/resolve-author.ts), re-pointed
// to the edge8 identity spine: the RPCs are the htt-schema resolvers that map to
// company_os.people.id (person_id), not to a tracker auth user id.
// SQL definitions: supabase/migrations/20260826120000_htt_phase4_ingestion.sql.
import { htt } from "@/kernel/data/supabase";

/**
 * Sentinel the PR fetcher stores as `authorLogin` when GitHub returns no user
 * for a PR (deleted account, or a PR opened by an app). It is not a login and
 * must never be sent to the resolver.
 */
const UNKNOWN_LOGIN = "unknown";

// Resolves a PR-author email to a company_os.people.id via the
// htt.resolve_team_member SQL function. Returns null when unresolvable:
// the caller records the PR as "unattributed" rather than failing the sync.
export async function resolveAuthorPersonId(
  email: string | null | undefined,
): Promise<string | null> {
  if (!email) return null;
  const { data, error } = await htt.rpc("resolve_team_member", { p_email: email });
  if (error || !data) return null;
  return data as string;
}

/**
 * Resolves a PR-author GitHub login to a company_os.people.id via
 * htt.resolve_team_member_by_login (people.github_login). This is the path that
 * covers the vast majority of PRs, whose body carries no author block. An RPC
 * error or no match returns null so an unresolvable author records an
 * unattributed PR instead of failing the sync.
 */
export async function resolveAuthorPersonIdByLogin(
  login: string | null | undefined,
): Promise<string | null> {
  if (!login || !login.trim()) return null;
  if (login.trim().toLowerCase() === UNKNOWN_LOGIN) return null;
  const { data, error } = await htt.rpc("resolve_team_member_by_login", {
    p_github_login: login,
  });
  if (error || !data) return null;
  return data as string;
}

/**
 * Combined PR-author resolution: email first, login as the fallback. Email
 * stays first because it is the more specific signal (an explicit author block
 * is a deliberate statement, and it is the only path that honours
 * person_git_emails). The login fallback runs when the block is absent AND when
 * it is present but does not resolve.
 */
export async function resolvePrAuthorPersonId(author: {
  email?: string | null;
  login?: string | null;
}): Promise<string | null> {
  const byEmail = await resolveAuthorPersonId(author.email);
  if (byEmail) return byEmail;
  return resolveAuthorPersonIdByLogin(author.login);
}
