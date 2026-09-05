// Pure, client-safe slice of the reviews domain: types and label maps with no
// server imports. lib/reviews.ts pulls in team-auth and the service-role
// Supabase client, so anything a Client Component needs (e.g. the shared
// ReviewHistoryTable) must live here instead, or the server code would be
// dragged into the browser bundle. lib/reviews re-exports all of these, so
// server callers keep importing from "@/entities/team/lib/reviews" unchanged.

export type ReviewType = "probation" | "midyear" | "renewal" | "adhoc" | "annual";
export type RaterKind = "self" | "manager";

export const REVIEW_TYPE_LABEL: Record<ReviewType, string> = {
  probation: "Probation review",
  midyear: "Mid-year check-in",
  renewal: "Renewal review",
  adhoc: "Review",
  annual: "Annual review",
};

// Survey decision labels -> stored enum.
export const DECISION_BY_LABEL: Record<string, string> = {
  "Continue to contract": "continue_to_contract",
  "Extend probation 30 days": "extend_probation",
  Discontinue: "discontinue",
  Renew: "renew",
  "Renew with changes": "renew_with_changes",
  "Do not renew": "do_not_renew",
};

export const DECISION_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(DECISION_BY_LABEL).map(([label, value]) => [value, label]),
);

// One review cycle collapsed to a single history row (self ✓ / manager ✓).
export type MemberReviewCycle = {
  cycleLabel: string | null;
  reviewType: ReviewType;
  date: string | null; // latest submitted_at across the cycle's rows
  hasSelf: boolean;
  hasManager: boolean;
  status: string; // most-advanced status across the cycle
  decision: string | null;
  keeper: boolean | null;
  // A row id to link the detail page at (prefer the manager row).
  linkId: string;
};
