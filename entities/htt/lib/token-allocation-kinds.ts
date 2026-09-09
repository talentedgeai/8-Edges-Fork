// Why a Bought figure was set. Mirrors the check constraint on
// htt.token_allocations.kind. Browser-safe: the admin's Set bought form renders
// the list, so it is exported through the client door as well as the index.
export const TOKEN_ALLOCATION_KINDS = [
  "purchased",
  "referral_credit",
  "retreat",
  "complimentary",
  "invoiced",
  "correction",
] as const;
export type TokenAllocationKind = (typeof TOKEN_ALLOCATION_KINDS)[number];

export const TOKEN_ALLOCATION_KIND_LABELS: Record<TokenAllocationKind, string> = {
  purchased: "Purchased",
  referral_credit: "Referral credit",
  retreat: "Retreat",
  complimentary: "Complimentary",
  invoiced: "Invoiced",
  correction: "Correction",
};
