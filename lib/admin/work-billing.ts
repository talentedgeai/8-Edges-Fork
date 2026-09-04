import { companyOs } from "@/lib/supabase";
import { createQboInvoice, sendQboInvoice } from "@/lib/qbo";
import { sendTransactionalEmail } from "@/lib/email";
import { notifyOps } from "@/lib/lark";

// Client billing for portal-origin contractor work requests: on acceptance,
// invoice the client in QuickBooks at the contractor's BILLABLE rate
// (compensation comp_type 'billable' — default 100% markup on internal
// hourly). Never throws and never blocks acceptance: every failure path
// degrades to a billing_status flag + accountant email + ops Lark so a human
// can invoice manually. Contractor pay (contractor_payments roll-up at the
// internal rate) is untouched by any of this.
// Plan: docs/plans/2026-07-18-client-work-requests.md

export type BillingOutcome =
  | { status: "skipped"; reason: string }
  | { status: "invoiced"; docNumber: string | null; amountCents: number }
  | { status: "manual_required" | "failed"; reason: string };

const ACCOUNTING_EMAIL = process.env.ACCOUNTING_EMAIL;

type BillableRequest = {
  id: string;
  person_id: string;
  title: string;
  status: string;
  origin: string;
  client_company_id: string | null;
  billing_status: string | null;
  actual_hours: number | string | null;
  actual_overtime_hours: number | string | null;
};

const toNum = (v: number | string | null): number => {
  const n = typeof v === "string" ? Number(v) : v ?? 0;
  return Number.isFinite(n) ? n : 0;
};

async function addSystemEvent(requestId: string, body: string, meta: Record<string, unknown> = {}) {
  const { error } = await companyOs.from("contractor_work_events").insert({
    request_id: requestId,
    actor_type: "system",
    actor: null,
    type: "message",
    body,
    meta,
  });
  if (error) console.error("[work-billing] event insert failed:", error.message);
}

async function flagManual(
  req: BillableRequest,
  status: "manual_required" | "failed",
  reason: string,
  details: string[],
): Promise<BillingOutcome> {
  await companyOs
    .from("contractor_work_requests")
    .update({ billing_status: status, billing_error: reason, updated_at: new Date().toISOString() })
    .eq("id", req.id);
  await addSystemEvent(req.id, `Client invoicing needs a hand: ${reason}`, { billing_status: status });

  const lines = [
    `Work request "${req.title}" was accepted but could not be invoiced automatically.`,
    `Reason: ${reason}`,
    ...details,
    `Review: https://www.edge8.ai/admin/operations/contractor-requests?open=${req.id}`,
  ];
  if (ACCOUNTING_EMAIL) {
    await sendTransactionalEmail({
      to: ACCOUNTING_EMAIL,
      subject: `Manual invoice needed: ${req.title}`,
      html: lines.map((l) => `<p>${l}</p>`).join("\n"),
      replyTo: "dave@edge8.co",
    });
  }
  await notifyOps(`⚠️ Client invoicing ${status === "failed" ? "failed" : "needs manual handling"}: "${req.title}" — ${reason}`);
  return { status, reason };
}

// Resolve the contractor's current client-billable rate (USD cents) via
// team_members → compensation.
async function billableRateCents(personId: string): Promise<number | null> {
  const { data: tm } = await companyOs
    .from("team_members")
    .select("id")
    .eq("person_id", personId)
    .maybeSingle();
  if (!tm) return null;
  const { data: comp } = await companyOs
    .from("compensation_sensitive")
    .select("amount_cents")
    .eq("team_member_id", tm.id)
    .eq("comp_type", "billable")
    .eq("is_current", true)
    .maybeSingle();
  const cents = comp?.amount_cents;
  return typeof cents === "number" && cents > 0 ? cents : cents ? Number(cents) : null;
}

export async function runWorkRequestBilling(requestId: string): Promise<BillingOutcome> {
  try {
    return await runBilling(requestId);
  } catch (err) {
    // Belt and braces: acceptance must never fail because billing blew up.
    console.error("[work-billing] unexpected failure:", err);
    return { status: "failed", reason: err instanceof Error ? err.message : "unexpected error" };
  }
}

async function runBilling(requestId: string): Promise<BillingOutcome> {
  const { data } = await companyOs
    .from("contractor_work_requests")
    .select("id, person_id, title, status, origin, client_company_id, billing_status, actual_hours, actual_overtime_hours")
    .eq("id", requestId)
    .maybeSingle();
  const req = data as BillableRequest | null;
  if (!req) return { status: "skipped", reason: "request not found" };

  // Only portal-origin (client) requests are billed; internal admin requests
  // have no client to invoice.
  if (req.origin !== "portal") return { status: "skipped", reason: "admin-origin request" };
  if (req.status !== "completed") return { status: "skipped", reason: "not completed" };
  if (req.billing_status !== null) return { status: "skipped", reason: "already billed" };

  const hours = Math.round((toNum(req.actual_hours) + toNum(req.actual_overtime_hours)) * 100) / 100;
  if (hours <= 0) return flagManual(req, "manual_required", "No billable hours on the request.", []);

  if (!req.client_company_id)
    return flagManual(req, "manual_required", "No client company on the request.", []);

  const rateCents = await billableRateCents(req.person_id);
  if (!rateCents)
    return flagManual(req, "manual_required", "The contractor has no billable rate set (Operations → Contractors).", [
      `Hours delivered: ${hours}`,
    ]);

  const amountCents = Math.round(hours * rateCents);

  const { data: company } = await companyOs
    .from("companies")
    .select("id, name, metadata")
    .eq("id", req.client_company_id)
    .maybeSingle();
  const qboIds = ((company?.metadata as Record<string, unknown> | null)?.qbo_customer_ids ?? []) as string[];
  const customerId = Array.isArray(qboIds) && qboIds.length > 0 ? String(qboIds[0]) : null;
  if (!customerId)
    return flagManual(req, "manual_required", `${company?.name ?? "The client company"} has no QuickBooks customer mapping.`, [
      `Hours: ${hours} × $${(rateCents / 100).toFixed(2)}/h = $${(amountCents / 100).toFixed(2)}`,
    ]);

  const description = `Contractor work: ${req.title}`;
  const created = await createQboInvoice({
    customerId,
    hours,
    rateCents,
    description,
    memo: `work_request:${req.id}`,
  });
  if (!created.ok)
    return flagManual(req, "failed", created.error, [
      `Customer: ${company?.name ?? customerId}`,
      `Hours: ${hours} × $${(rateCents / 100).toFixed(2)}/h = $${(amountCents / 100).toFixed(2)}`,
    ]);

  const inv = created.invoice;

  // Mirror into the synced ledger so the portal invoices page shows it
  // immediately; the weekly QBO sync then updates this same row (unique on
  // source + external_id).
  const { data: ledgerRow, error: ledgerErr } = await companyOs
    .from("invoices")
    .upsert(
      {
        company_id: req.client_company_id,
        source: "quickbooks",
        external_id: inv.id,
        doc_number: inv.docNumber,
        txn_date: inv.txnDate,
        due_date: inv.dueDate,
        currency: inv.currency,
        amount_cents: inv.totalCents,
        balance_cents: inv.totalCents,
        status: "open",
        lines: [
          {
            description,
            quantity: hours,
            rate: rateCents / 100,
            amount: inv.totalCents / 100,
            item_name: "Contractor Services",
          },
        ],
        synced_at: new Date().toISOString(),
      },
      { onConflict: "source,external_id" },
    )
    .select("id")
    .maybeSingle();
  if (ledgerErr) console.error("[work-billing] invoice ledger upsert failed:", ledgerErr.message);

  // Stamp the request. A crash between QBO create and this stamp leaves a
  // real invoice unstamped — the accountant email below carries the doc
  // number, and the weekly sync lands the ledger row regardless.
  await companyOs
    .from("contractor_work_requests")
    .update({
      billing_status: "invoiced",
      billing_error: null,
      billed_invoice_id: ledgerRow?.id ?? null,
      billed_amount_cents: inv.totalCents,
      billed_rate_cents: rateCents,
      billed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", req.id);

  // QBO emails the client their invoice; a send failure is non-fatal (the
  // invoice exists — accountant just resends from QBO).
  const sent = await sendQboInvoice(inv.id);

  const amountLabel = `$${(inv.totalCents / 100).toFixed(2)}`;
  await addSystemEvent(
    req.id,
    `Invoice ${inv.docNumber ? `#${inv.docNumber}` : inv.id} created for ${amountLabel} (${hours}h × $${(rateCents / 100).toFixed(2)}/h)${sent.ok ? " and emailed to the client" : " — QBO email send failed, resend from QuickBooks"}.`,
    { qbo_invoice_id: inv.id, amount_cents: inv.totalCents },
  );
  if (ACCOUNTING_EMAIL) {
    await sendTransactionalEmail({
      to: ACCOUNTING_EMAIL,
      subject: `Invoice created: ${req.title} (${amountLabel})`,
      html: [
        `<p>Contractor work "${req.title}" was accepted by the client and invoiced automatically.</p>`,
        `<p>QuickBooks invoice ${inv.docNumber ? `#${inv.docNumber}` : inv.id} — ${amountLabel} (${hours}h × $${(rateCents / 100).toFixed(2)}/h, 100% markup rate) for ${company?.name ?? "the client"}.</p>`,
        sent.ok ? `<p>QBO has emailed it to the client.</p>` : `<p><strong>QBO could not email it — please send it from QuickBooks.</strong></p>`,
        `<p>Request: https://www.edge8.ai/admin/operations/contractor-requests?open=${req.id}</p>`,
      ].join("\n"),
      replyTo: "dave@edge8.co",
    });
  }
  await notifyOps(
    `🧾 Invoice ${inv.docNumber ? `#${inv.docNumber}` : inv.id} created: "${req.title}" — ${amountLabel} for ${company?.name ?? "client"}${sent.ok ? ", emailed via QBO" : " (QBO email failed — resend manually)"}.`,
  );

  return { status: "invoiced", docNumber: inv.docNumber, amountCents: inv.totalCents };
}
