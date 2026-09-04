// Client-facing referral / affiliate view. A dedicated, reviewed helper in the
// same spirit as lib/portal/invoices.ts. An affiliate can be the actor as a
// PERSON (affiliates.person_id) or as the PRIMARY CONTACT of a company affiliate
// (affiliates.company_id where the actor is person_companies.is_primary). The
// is_primary gate is the ownership boundary — we never widen to all portal
// members of a company, or a non-primary member could redeem the company's
// commissions (IDOR). An affiliate sees only their own referral activity.
//
// Rate is a redemption CHOICE: 20% taken as work credit, or 10% as cash. A
// commission is pending until the affiliate chooses; the choice is what this
// surface lets them make.

import { companyOs } from "@/lib/supabase";
import type { PortalActor } from "@/lib/portal-auth";
import { one, type Embedded } from "@/lib/embedded";

export const WORK_CREDIT_RATE = 0.2;
export const CASH_RATE = 0.1;

export type PortalReferralCommission = {
  id: string;
  sourceLabel: string;
  grossCents: number;
  redemptionChoice: "work_credit" | "cash" | null;
  commissionCents: number | null;
  paidOut: boolean;
  workCreditCents: number; // what they'd get as 20% work credit
  cashCents: number; // what they'd get as 10% cash
  createdAt: string;
};

export type PortalReferredDeal = {
  id: string;
  title: string | null;
  companyName: string | null;
  status: string | null;
};

export type PortalReferrals = {
  code: string | null;
  commissions: PortalReferralCommission[];
  referredDeals: PortalReferredDeal[];
  pendingCount: number;
  workCreditTotalCents: number; // sum of chosen work_credit commissions
  cashTotalCents: number; // sum of chosen cash commissions
  unpaidCents: number; // chosen but not paid out
};

// Companies for which this person is the PRIMARY contact — the ownership set for
// company-affiliate entitlement. Deliberately is_primary only.
async function actorPrimaryCompanyIds(personId: string): Promise<string[]> {
  const { data } = await companyOs
    .from("person_companies")
    .select("company_id")
    .eq("person_id", personId)
    .eq("is_primary", true)
    .not("company_id", "is", null);
  return [...new Set(((data ?? []) as Array<{ company_id: string | null }>).map((r) => r.company_id).filter(Boolean) as string[])];
}

// The affiliate rows this actor owns: their own person codes plus any company
// affiliate they are the primary contact of.
async function actorAffiliateRows(actor: PortalActor): Promise<{ ids: string[]; activeCode: string | null; companyIds: string[] }> {
  const companyIds = await actorPrimaryCompanyIds(actor.personId);
  const orParts = [`person_id.eq.${actor.personId}`];
  if (companyIds.length) orParts.push(`company_id.in.(${companyIds.join(",")})`);
  const { data } = await companyOs.from("affiliates").select("id, code, active").or(orParts.join(","));
  const rows = (data ?? []) as Array<{ id: string; code: string; active: boolean | null }>;
  return {
    ids: rows.map((r) => r.id),
    activeCode: rows.find((r) => r.active)?.code ?? rows[0]?.code ?? null,
    companyIds,
  };
}

export async function getReferralsForActor(actor: PortalActor): Promise<PortalReferrals> {
  const { ids, activeCode, companyIds } = await actorAffiliateRows(actor);

  const dealOrParts = [`referrer_id.eq.${actor.personId}`];
  if (companyIds.length) dealOrParts.push(`referrer_company_id.in.(${companyIds.join(",")})`);
  if (ids.length) dealOrParts.push(`affiliate_id.in.(${ids.join(",")})`);

  const [{ data: commRows }, { data: dealRows }] = await Promise.all([
    ids.length
      ? companyOs
          .from("affiliate_commissions")
          .select("id, source_event, source_ref, gross_cents, commission_cents, redemption_choice, payout_id, created_at")
          .in("affiliate_id", ids)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    companyOs
      .from("deals")
      .select("id, title, status, referrer_id, affiliate_id, companies!company_id(name)")
      .or(dealOrParts.join(","))
      .order("created_at", { ascending: false }),
  ]);

  let pendingCount = 0;
  let workCreditTotalCents = 0;
  let cashTotalCents = 0;
  let unpaidCents = 0;

  const commissions: PortalReferralCommission[] = ((commRows ?? []) as Array<{ id: string; source_event: string; source_ref: string | null; gross_cents: number; commission_cents: number | null; redemption_choice: string | null; payout_id: string | null; created_at: string }>).map((c) => {
    const choice = (c.redemption_choice as "work_credit" | "cash" | null) ?? null;
    if (choice == null) pendingCount += 1;
    else {
      const realized = c.commission_cents ?? 0;
      if (choice === "work_credit") workCreditTotalCents += realized;
      else cashTotalCents += realized;
      if (!c.payout_id) unpaidCents += realized;
    }
    return {
      id: c.id,
      sourceLabel: c.source_ref ? `Invoice ${c.source_ref}` : "Referral",
      grossCents: c.gross_cents,
      redemptionChoice: choice,
      commissionCents: c.commission_cents,
      paidOut: !!c.payout_id,
      workCreditCents: Math.round(c.gross_cents * WORK_CREDIT_RATE),
      cashCents: Math.round(c.gross_cents * CASH_RATE),
      createdAt: c.created_at,
    };
  });

  const referredDeals: PortalReferredDeal[] = ((dealRows ?? []) as Array<{ id: string; title: string | null; status: string | null; companies: Embedded<{ name: string | null }> }>).map((d) => ({
    id: d.id,
    title: d.title,
    companyName: one(d.companies)?.name ?? null,
    status: d.status,
  }));

  return { code: activeCode, commissions, referredDeals, pendingCount, workCreditTotalCents, cashTotalCents, unpaidCents };
}

// Ownership-checked redemption choice for a client's own commission. Confirms
// the commission hangs off one of THIS actor's affiliate codes before writing —
// an affiliate must never redeem another's commission (IDOR). Locked once paid.
export async function chooseRedemptionForActor(
  actor: PortalActor,
  commissionId: string,
  choice: "work_credit" | "cash",
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (choice !== "work_credit" && choice !== "cash") return { ok: false, error: "Invalid choice." };

  const { ids } = await actorAffiliateRows(actor);
  if (ids.length === 0) return { ok: false, error: "No affiliate code on file." };

  const { data: comm } = await companyOs
    .from("affiliate_commissions")
    .select("id, affiliate_id, gross_cents, payout_id")
    .eq("id", commissionId)
    .maybeSingle();
  if (!comm || !ids.includes(comm.affiliate_id as string)) return { ok: false, error: "Commission not found." };
  if (comm.payout_id) return { ok: false, error: "This commission has been paid out and can no longer be changed." };

  const rate = choice === "work_credit" ? WORK_CREDIT_RATE : CASH_RATE;
  const { error } = await companyOs
    .from("affiliate_commissions")
    .update({
      redemption_choice: choice,
      rate,
      commission_cents: Math.round((comm.gross_cents as number) * rate),
      chosen_at: new Date().toISOString(),
    })
    .eq("id", commissionId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
