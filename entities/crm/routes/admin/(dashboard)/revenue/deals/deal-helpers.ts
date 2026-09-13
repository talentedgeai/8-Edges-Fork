// The two write-path steps that both pairs of deal actions share. They live
// beside actions.ts rather than in it because that file is "use server", where
// every export must be an async server action — and because a helper this
// file-local is easier to read next to its two callers than inline in four.

import { companyOs, type CompanyOsInsert } from "@/kernel/data/supabase";
import { upsertFxRates } from "@/entities/finance";
import { getLead, recordTransition } from "@/entities/crm/lib/lifecycle";
import { convertToUsdCents } from "@/kernel/data/fx";

type Result = { ok: true } | { ok: false; error: string };

// Reporting/list views always show USD (amount_cents/currency stay the original
// transaction), so both write paths stamp the same three columns from one FX
// lookup. A flaky rate must never block the save, which is why the whole thing
// sits inside one try. `cacheRate` is the difference between the two callers:
// the full deal edit also refreshes the shared fx_rates row that the database
// trigger for orders/products/bookings reads, the stage move does not.
export async function applyUsdConversion(
  updates: Record<string, unknown>,
  dealId: string,
  amountCents: number,
  currency: string,
  opts: { cacheRate: boolean },
): Promise<void> {
  try {
    const fx = await convertToUsdCents(amountCents, currency);
    updates.amount_usd_cents = fx.amountUsdCents;
    updates.fx_rate = fx.rate;
    updates.fx_rate_fetched_at = new Date().toISOString();
    if (opts.cacheRate) {
      // Keep the shared fx_rates table fresh from real usage, so the trigger that
      // normalizes orders/products/bookings (company_os.set_amount_usd_cents) uses a
      // current rate too. Best-effort — never block the deal save.
      // The rate cache is an optimisation; a failed refresh must not lose the
      // conversion already applied to `updates` above.
      const { error: fxErr } = await upsertFxRates({ currency: currency.toLowerCase(), rate_to_usd: fx.rate, updated_at: new Date().toISOString() }, { onConflict: "currency" });
      if (fxErr) console.error("caching fx rate failed:", fxErr.message);
    }
  } catch (err) {
    console.error(`FX conversion failed for deal ${dealId}:`, err);
  }
}

// Put a person back in the SDR queue at 'connected' — they had a real
// conversation, so there is no fresh SLA clock to start — and record the
// transition. Shared by the demote and handoff-reject paths, which differ only
// in whether a stale disqualification is cleared and in whether a failed upsert
// stops the action or is merely logged. Returns a failure Result the caller
// must propagate, or null when the caller should carry on.
export async function reopenLeadAsConnected(input: {
  personId: string;
  clearDisqualifiedReason: boolean;
  transitionReason: string;
  note: string | null | undefined;
  onUpsertError: "return" | "log";
}): Promise<Result | null> {
  const lookup = await getLead(input.personId);
  if (!lookup.ok) {
    if (input.onUpsertError === "return") return { ok: false, error: lookup.error };
    console.error("handoff-reject lead lookup failed:", lookup.error);
  }
  const lead = lookup.ok ? lookup.lead : null;
  const row: CompanyOsInsert<"lead"> = {
    person_id: input.personId,
    status: "connected",
    sla_due_at: null,
    ...(input.clearDisqualifiedReason ? { disqualified_reason: null } : {}),
    updated_at: new Date().toISOString(),
  };
  const { error: lErr } = await companyOs.from("lead").upsert(row, { onConflict: "person_id" });
  if (lErr) {
    if (input.onUpsertError === "return") return { ok: false, error: lErr.message };
    console.error("handoff-reject lead sync failed:", lErr.message);
  }

  await recordTransition({
    personId: input.personId,
    fromStatus: lead?.status ?? null,
    toStatus: "connected",
    reason: input.transitionReason,
    note: input.note,
  });
  return null;
}
