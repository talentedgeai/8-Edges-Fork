import { companyOs } from "@/lib/supabase";
import { computeAmountCents, num } from "@/lib/admin/contractors";

// Month-end roll-up: accepted (completed) work → one contractor_payments row
// per contractor per month. Shared by the Vercel cron (1st of the month, for
// the previous month) and the manual "run roll-up" admin action. Idempotent:
// re-runs pick up newly accepted work and recompute a still-pending payment;
// decided (paid/rejected) payments are never touched — stragglers are
// reported instead.

export type RollupSummary = {
  period: string; // YYYY-MM-01
  created: number;
  updated: number;
  requestsLinked: number;
  skipped: string[]; // human-readable reasons
};

function monthBounds(period: string): { start: string; end: string } {
  const start = new Date(`${period}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

// First day of the month `offset` months from now (UTC). offset -1 = previous month.
export function periodMonth(offset: number): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + offset;
  const norm = new Date(Date.UTC(y, m, 1));
  return norm.toISOString().slice(0, 10);
}

export async function rollupContractorPayments(period: string): Promise<RollupSummary | { error: string }> {
  if (!/^\d{4}-\d{2}-01$/.test(period)) return { error: `Invalid period: ${period}` };
  const { start, end } = monthBounds(period);
  const summary: RollupSummary = { period, created: 0, updated: 0, requestsLinked: 0, skipped: [] };

  // Eligible work: completed, unlinked, accepted inside the period.
  const { data: reqs, error: rErr } = await companyOs
    .from("contractor_work_requests")
    .select("id, person_id, actual_hours, actual_overtime_hours, people!person_id(full_name, email)")
    .eq("status", "completed")
    .is("payment_id", null)
    .gte("accepted_at", start)
    .lt("accepted_at", end);
  if (rErr) return { error: rErr.message };
  if (!reqs || reqs.length === 0) return summary;

  const byPerson = new Map<string, typeof reqs>();
  for (const r of reqs) {
    const list = byPerson.get(r.person_id) ?? [];
    list.push(r);
    byPerson.set(r.person_id, list);
  }

  for (const [personId, items] of byPerson) {
    const people = items[0].people;
    const person = Array.isArray(people) ? people[0] ?? null : people;
    const who = person?.full_name || person?.email || personId;

    // Current rates via team_members → compensation.
    const { data: tm } = await companyOs
      .from("team_members")
      .select("id")
      .eq("person_id", personId)
      .maybeSingle();
    if (!tm) {
      summary.skipped.push(`${who}: no team_members row`);
      continue;
    }
    const { data: comps } = await companyOs
      .from("compensation_sensitive")
      .select("comp_type, amount_cents, currency")
      .eq("team_member_id", tm.id)
      .in("comp_type", ["hourly", "overtime"])
      .eq("is_current", true);
    const hourly = comps?.find((c) => c.comp_type === "hourly");
    const overtime = comps?.find((c) => c.comp_type === "overtime");
    if (!hourly) {
      summary.skipped.push(`${who}: no current hourly rate — work left unlinked`);
      continue;
    }
    const hourlyCents = num(hourly.amount_cents);
    const overtimeCents = num(overtime?.amount_cents ?? hourly.amount_cents);
    const currency = hourly.currency || "usd";

    // Existing payment for this person+month?
    const { data: existing } = await companyOs
      .from("contractor_payments")
      .select("id, status")
      .eq("person_id", personId)
      .eq("period_month", period)
      .maybeSingle();
    if (existing && existing.status !== "pending") {
      summary.skipped.push(`${who}: payment for ${period} already ${existing.status} — new work left unlinked`);
      continue;
    }

    let paymentId = existing?.id ?? null;
    if (!paymentId) {
      const { data: created, error: cErr } = await companyOs
        .from("contractor_payments")
        .insert({ person_id: personId, period_month: period, status: "pending", currency })
        .select("id")
        .single();
      if (cErr) {
        summary.skipped.push(`${who}: payment insert failed (${cErr.message})`);
        continue;
      }
      paymentId = created.id;
      summary.created += 1;
    } else {
      summary.updated += 1;
    }

    // Link the new work to the payment...
    const ids = items.map((i) => i.id);
    const { error: linkErr } = await companyOs
      .from("contractor_work_requests")
      .update({ payment_id: paymentId, updated_at: new Date().toISOString() })
      .in("id", ids);
    if (linkErr) {
      summary.skipped.push(`${who}: linking failed (${linkErr.message})`);
      continue;
    }
    summary.requestsLinked += ids.length;

    // ...then recompute totals from EVERYTHING linked (handles re-runs).
    const { data: linked } = await companyOs
      .from("contractor_work_requests")
      .select("actual_hours, actual_overtime_hours")
      .eq("payment_id", paymentId);
    const regular = (linked ?? []).reduce((s, r) => s + num(r.actual_hours), 0);
    const ot = (linked ?? []).reduce((s, r) => s + num(r.actual_overtime_hours), 0);
    const amount = computeAmountCents(regular, ot, hourlyCents, overtimeCents);

    await companyOs
      .from("contractor_payments")
      .update({
        total_regular_hours: regular,
        total_overtime_hours: ot,
        amount_cents: amount,
        currency,
        summary: `${(linked ?? []).length} accepted work request${(linked ?? []).length === 1 ? "" : "s"} · ${regular}h @ ${hourlyCents / 100} + ${ot}h OT @ ${overtimeCents / 100} (${currency.toUpperCase()})`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentId);
  }

  return summary;
}
