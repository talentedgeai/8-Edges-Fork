// Client-facing work requests. Same discipline as lib/portal/invoices.ts:
// every read/write is scoped to the actor's own companyScope, and the column
// list matters — `access_token` is the CONTRACTOR's bearer credential for
// /work/[token], so it is never selected here; leaking it would let a client
// act as the contractor. Contractor emails are also withheld (names only).
//
// Portal clients drive the same state machine as admins (lib/work-requests.ts)
// with actorType 'client': they create requests, approve/decline estimates,
// and accept finished work. Admin stays a visible backstop, not a gate.
// Plan: docs/plans/2026-07-18-client-work-requests.md

import { companyOs } from "@/lib/supabase";
import type { PortalActor } from "@/lib/portal-auth";
import { isPortalAdmin, canContribute, ROLE_DENIED } from "@/lib/portal/roles";
import {
  addWorkEvent,
  applyCancel,
  applyEstimateDecision,
  applyScopeAddition,
  applyWorkDecision,
  loadWorkRequest,
  type WorkDecider,
  type WorkRequestResult,
} from "@/lib/work-requests";
import { newTicketCode } from "@/lib/events-server";
import { getSiteOrigin } from "@/lib/site-origin";
import { workRequestPath } from "@/lib/admin/contractors";
import { pingOps, sendWorkRequestEmail } from "@/lib/contractor-notify";
import { recordAudit } from "@/lib/admin/audit";
import { notifyOps } from "@/lib/lark";
import { one } from "@/lib/embedded";

export type PortalWorkRequest = {
  id: string;
  title: string;
  brief: string;
  status: string;
  contractorName: string | null;
  clientCompanyId: string | null;
  estimatedHours: number | string | null;
  planText: string | null;
  estimateSubmittedAt: string | null;
  actualHours: number | string | null;
  actualOvertimeHours: number | string | null;
  workSummary: string | null;
  workLink: string | null;
  workSubmittedAt: string | null;
  acceptedAt: string | null;
  createdAt: string;
};

export type PortalWorkEvent = {
  id: string;
  actorType: string;
  type: string;
  body: string | null;
  createdAt: string;
};

// No access_token, no contractor email, no client emails from events.
const PORTAL_REQUEST_SELECT =
  "id, title, brief, status, estimated_hours, plan_text, estimate_submitted_at, actual_hours, actual_overtime_hours, work_summary, work_link, work_submitted_at, accepted_at, created_at, client_company_id, people!person_id(full_name)";

type Row = {
  id: string;
  title: string;
  brief: string;
  status: string;
  estimated_hours: number | string | null;
  plan_text: string | null;
  estimate_submitted_at: string | null;
  actual_hours: number | string | null;
  actual_overtime_hours: number | string | null;
  work_summary: string | null;
  work_link: string | null;
  work_submitted_at: string | null;
  accepted_at: string | null;
  created_at: string;
  client_company_id: string | null;
  people: { full_name: string | null } | { full_name: string | null }[] | null;
};

function toPortalRequest(r: Row): PortalWorkRequest {
  return {
    id: r.id,
    title: r.title,
    brief: r.brief,
    status: r.status,
    contractorName: one(r.people)?.full_name ?? null,
    clientCompanyId: r.client_company_id,
    estimatedHours: r.estimated_hours,
    planText: r.plan_text,
    estimateSubmittedAt: r.estimate_submitted_at,
    actualHours: r.actual_hours,
    actualOvertimeHours: r.actual_overtime_hours,
    workSummary: r.work_summary,
    workLink: r.work_link,
    workSubmittedAt: r.work_submitted_at,
    acceptedAt: r.accepted_at,
    createdAt: r.created_at,
  };
}

export async function listWorkRequestsForActor(actor: PortalActor): Promise<PortalWorkRequest[]> {
  if (actor.companyScope.length === 0) return [];
  const { data } = await companyOs
    .from("contractor_work_requests")
    .select(PORTAL_REQUEST_SELECT)
    .in("client_company_id", actor.companyScope)
    .order("created_at", { ascending: false });
  return ((data ?? []) as Row[]).map(toPortalRequest);
}

// IDOR guard: the id must belong to one of the actor's companies.
export async function getWorkRequestForActor(
  actor: PortalActor,
  id: string,
): Promise<{ request: PortalWorkRequest; events: PortalWorkEvent[] } | null> {
  if (actor.companyScope.length === 0) return null;
  const { data } = await companyOs
    .from("contractor_work_requests")
    .select(PORTAL_REQUEST_SELECT)
    .eq("id", id)
    .in("client_company_id", actor.companyScope)
    .maybeSingle();
  if (!data) return null;

  const { data: events } = await companyOs
    .from("contractor_work_events")
    .select("id, actor_type, type, body, created_at")
    .eq("request_id", id)
    .order("created_at", { ascending: true });

  return {
    request: toPortalRequest(data as Row),
    events: ((events ?? []) as Array<{ id: string; actor_type: string; type: string; body: string | null; created_at: string }>).map(
      (e) => ({ id: e.id, actorType: e.actor_type, type: e.type, body: e.body, createdAt: e.created_at }),
    ),
  };
}

// The pickable roster: all active contractors (it's a handful of people).
// Future refinement: filter by staff_assignments for the actor's companies.
export async function listActiveContractors(): Promise<Array<{ personId: string; name: string }>> {
  const { data } = await companyOs
    .from("team_members")
    .select("person_id, people!person_id(full_name, email)")
    .eq("employment_type", "contract")
    .eq("status", "active");
  return ((data ?? []) as Array<{ person_id: string; people: { full_name: string | null; email: string } | { full_name: string | null; email: string }[] | null }>)
    .map((r) => {
      const p = one(r.people);
      return { personId: r.person_id, name: p?.full_name || p?.email || "Contractor" };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function decider(actor: PortalActor): WorkDecider {
  return {
    actorType: "client",
    email: actor.email,
    assumedBy: actor.impersonation?.adminEmail ?? null,
  };
}

// Role gates (lib/portal/roles.ts): creating requests needs contributor or
// admin; deciding estimates/work is admin-only. Viewers are read-only.
function auditActor(actor: PortalActor): string {
  return actor.impersonation ? `${actor.impersonation.adminEmail} (assume: ${actor.email})` : actor.email;
}

export async function createWorkRequestForActor(
  actor: PortalActor,
  input: { companyId: string; contractorPersonId: string; title: string; brief: string },
): Promise<WorkRequestResult & { id?: string }> {
  const title = input.title?.trim();
  const brief = input.brief?.trim();
  if (!actor.companyScope.includes(input.companyId)) return { ok: false, error: "Not your company." };
  if (!canContribute(actor, input.companyId)) return { ok: false, error: ROLE_DENIED };
  if (!input.contractorPersonId) return { ok: false, error: "Pick a contractor." };
  if (!title) return { ok: false, error: "Title is required." };
  if (!brief) return { ok: false, error: "Describe the project." };

  // Same active-contractor check as the admin flow.
  const { data: tm } = await companyOs
    .from("team_members")
    .select("id, status, employment_type")
    .eq("person_id", input.contractorPersonId)
    .maybeSingle();
  if (!tm || tm.employment_type !== "contract" || tm.status !== "active") {
    return { ok: false, error: "That contractor is not available." };
  }

  const token = newTicketCode(16);
  const { data, error } = await companyOs
    .from("contractor_work_requests")
    .insert({
      person_id: input.contractorPersonId,
      title,
      brief,
      access_token: token,
      status: "awaiting_estimate",
      created_by: actor.email,
      origin: "portal",
      client_company_id: input.companyId,
      requested_by_person_id: actor.personId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: "Couldn't create the request. Please try again." };

  await addWorkEvent(data.id, {
    actor_type: "client",
    actor: actor.email,
    type: "created",
    body: brief,
    meta: actor.impersonation ? { assumed_by: actor.impersonation.adminEmail } : {},
  });
  await recordAudit({
    table: "contractor_work_requests",
    recordId: data.id,
    operation: "insert",
    actor: auditActor(actor),
    newData: { person_id: input.contractorPersonId, title, status: "awaiting_estimate", origin: "portal" },
  });

  const { data: person } = await companyOs
    .from("people")
    .select("full_name, email")
    .eq("id", input.contractorPersonId)
    .maybeSingle();
  if (person?.email) {
    await sendWorkRequestEmail({
      to: person.email,
      name: person.full_name,
      title,
      brief,
      url: `${getSiteOrigin()}${workRequestPath(token)}`,
    });
  }

  const companyName = actor.memberships.find((m) => m.companyId === input.companyId)?.companyName ?? "client";
  await pingOps(
    `🧑‍💼 Client work request: "${title}" — ${companyName} → ${person?.full_name ?? "contractor"}. Review: https://www.edge8.ai/admin/operations/contractor-requests?open=${data.id}`,
  );

  return { ok: true, id: data.id };
}

async function loadOwnedRequest(actor: PortalActor, id: string) {
  const req = await loadWorkRequest(id);
  if (!req || !req.client_company_id || !actor.companyScope.includes(req.client_company_id)) return null;
  return req;
}

export async function decideEstimateForActor(
  actor: PortalActor,
  id: string,
  decision: "approved" | "rejected" | "changes_requested",
  note: string,
): Promise<WorkRequestResult> {
  const req = await loadOwnedRequest(actor, id);
  if (!req) return { ok: false, error: "Request not found." };
  if (!isPortalAdmin(actor, req.client_company_id!)) return { ok: false, error: ROLE_DENIED };
  const r = await applyEstimateDecision(req, decision, decider(actor), note);
  if (r.ok) {
    await recordAudit({
      table: "contractor_work_requests",
      recordId: id,
      operation: "update",
      actor: auditActor(actor),
      newData: { status: decision, via: "portal" },
    });
  }
  return r;
}

export async function decideWorkForActor(
  actor: PortalActor,
  id: string,
  decision: "accepted" | "revision",
  note: string,
): Promise<WorkRequestResult> {
  const req = await loadOwnedRequest(actor, id);
  if (!req) return { ok: false, error: "Request not found." };
  if (!isPortalAdmin(actor, req.client_company_id!)) return { ok: false, error: ROLE_DENIED };
  const r = await applyWorkDecision(req, decision, decider(actor), note);
  if (r.ok) {
    await recordAudit({
      table: "contractor_work_requests",
      recordId: id,
      operation: "update",
      actor: auditActor(actor),
      newData: { status: decision === "accepted" ? "completed" : "approved", via: "portal" },
    });
  }
  return r;
}

// Add scope to an in-progress (approved) request. Shared state machine sends
// it back to the contractor to re-estimate; billing still waits for the client
// to accept the finished work.
export async function addScopeForActor(
  actor: PortalActor,
  id: string,
  scope: string,
): Promise<WorkRequestResult> {
  const req = await loadOwnedRequest(actor, id);
  if (!req) return { ok: false, error: "Request not found." };
  const r = await applyScopeAddition(req, decider(actor), scope);
  if (r.ok) {
    await recordAudit({
      table: "contractor_work_requests",
      recordId: id,
      operation: "update",
      actor: auditActor(actor),
      newData: { status: "scope_added", via: "portal" },
    });
  }
  return r;
}

// Clients can cancel only before work is approved — once the contractor may
// be mid-work, cancellation goes through Edge8 (admin backstop).
const CLIENT_CANCELLABLE = ["awaiting_estimate", "estimate_submitted", "changes_requested"];

export async function cancelWorkRequestForActor(
  actor: PortalActor,
  id: string,
  note: string,
): Promise<WorkRequestResult> {
  const req = await loadOwnedRequest(actor, id);
  if (!req) return { ok: false, error: "Request not found." };
  if (!CLIENT_CANCELLABLE.includes(req.status)) {
    return { ok: false, error: "Work is already underway — reply to your Edge8 contact to cancel this request." };
  }
  const r = await applyCancel(req, decider(actor), note);
  if (r.ok) {
    await recordAudit({
      table: "contractor_work_requests",
      recordId: id,
      operation: "update",
      actor: auditActor(actor),
      newData: { status: "cancelled", via: "portal" },
    });
  }
  return r;
}

// ── General requests (CRM inquiries) ─────────────────────────────────────────

// A general ask lands in the CRM inquiries pipeline like the public contact
// form — but the person already exists (the actor) and they're already a
// customer, so no getOrCreatePerson and no lead promotion.
export async function createPortalInquiryForActor(
  actor: PortalActor,
  input: { subject: string; message: string },
): Promise<WorkRequestResult> {
  const subject = input.subject?.trim();
  const message = input.message?.trim();
  if (!subject) return { ok: false, error: "Add a short subject." };
  if (!message) return { ok: false, error: "Describe what you need." };

  const { error } = await companyOs.from("inquiries").insert({
    person_id: actor.personId,
    type: "consultation",
    subject,
    message,
    source: "portal",
    source_site: "edge8.ai",
    status: "new_lead",
    metadata: {
      origin: "portal",
      company_id: actor.companyScope[0] ?? null,
      name: actor.displayName,
      email: actor.email,
      ...(actor.impersonation ? { assumed_by: actor.impersonation.adminEmail } : {}),
    },
  });
  if (error) return { ok: false, error: "Couldn't send your request. Please try again." };

  const companyName = actor.memberships[0]?.companyName ?? "client";
  await notifyOps(
    `🧑‍💼 Portal general request from ${actor.displayName} (${companyName}): "${subject}". Review: https://www.edge8.ai/admin/revenue/inquiries`,
  );
  return { ok: true };
}

export async function listPortalInquiriesForActor(
  actor: PortalActor,
): Promise<Array<{ id: string; subject: string | null; status: string; createdAt: string }>> {
  const { data } = await companyOs
    .from("inquiries")
    .select("id, subject, status, created_at")
    .eq("person_id", actor.personId)
    .eq("source", "portal")
    .order("created_at", { ascending: false })
    .limit(5);
  return ((data ?? []) as Array<{ id: string; subject: string | null; status: string; created_at: string }>).map((r) => ({
    id: r.id,
    subject: r.subject,
    status: r.status,
    createdAt: r.created_at,
  }));
}
