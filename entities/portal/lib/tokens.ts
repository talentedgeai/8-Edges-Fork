// Human-token packs. 1 token = 1 hour of skilled work; a pack is 40 tokens at
// $2,000. Same scoping discipline as the other lib/portal helpers: every read
// is the company-scoped sum, nothing wider. Purchasing is a standalone Stripe
// Checkout (entities/portal/routes/(dashboard)/tokens); no draw-down against work-request
// billing yet.
//
// The accounting itself (Bought / Delivered / Balance / Planned / leverage,
// including the latest-seq allocation rule) lives in entities/portal/lib/hub-tokens.ts, shared
// with the admin Client Hub. These wrappers only apply the portal actor's
// company scope; the formula is never duplicated here.

import type { PortalActor } from "@/kernel/identity/portal-auth";
import {
  getTokenBalanceForCompanies,
  getTokenUsageForCompanies,
  type TokenBalance,
  type TokenUsage,
} from "@/entities/portal/lib/hub-tokens";

export type { TokenBalance, TokenUsage } from "@/entities/portal/lib/hub-tokens";

export const PACK_TOKENS = 40;
export const PACK_PRICE_CENTS = 200_000; // $2,000
export const MAX_PACKS = 4;

export async function getTokenBalance(actor: PortalActor): Promise<TokenBalance> {
  return getTokenBalanceForCompanies(actor.companyScope);
}

export async function getTokenUsage(actor: PortalActor): Promise<TokenUsage> {
  return getTokenUsageForCompanies(actor.companyScope);
}
