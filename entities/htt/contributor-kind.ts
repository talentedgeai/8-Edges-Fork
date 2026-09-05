

/** Subset of a `htt.client_identities` row used for classification. */
export interface ClientIdentityRow {
  repo_id: string | null; // null = applies to every repo for the client
  github_login: string | null;
  git_email: string | null;
}

/**
 * Lowercased owner git_emails for `repoId` (global rows + this repo's rows).
 * Used to classify self-reported effort_log entries, which carry
 * `contributor_email` (not a github_login).
 */
export function buildOwnerEmailSet(identities: ClientIdentityRow[], repoId: string): Set<string> {
  const set = new Set<string>();
  for (const id of identities) {
    if (id.repo_id !== null && id.repo_id !== repoId) continue;
    if (id.git_email) set.add(id.git_email.toLowerCase());
  }
  return set;
}

/** True if an email belongs to the owner/client (case-insensitive). */
export function isOwnerEmail(email: string | null, ownerEmails: Set<string>): boolean {
  return !!email && ownerEmails.has(email.toLowerCase());
}
