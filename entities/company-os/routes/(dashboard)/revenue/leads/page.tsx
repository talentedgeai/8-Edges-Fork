import { companyOs } from "@/kernel/data/supabase";
import { PageHead } from "@/kernel/ui/PageHead";
import { MetricCard } from "@/kernel/ui/MetricCard";
import { ACTIVE_LEAD_STATUSES } from "@/entities/company-os/lib/lifecycle";
import { WEEKLY_MEETINGS_GOAL, getMeetingsBookedThisWeek } from "@/entities/company-os/modules/crm/lead-stats";
import { LeadQueue, type QueueRow } from "./LeadQueue";
import { one, type Embedded } from "@/kernel/config/embedded";

export const metadata = {
  title: "Leads",
  description: "The SDR queue for qualifying inbound and booking meetings.",
};

// The SDR workstation. A queue, not a list: system-ordered (SLA first, then
// oldest promotion), worked top to bottom. Rows come from the lead satellite
// (one row per person being worked); nurture/unqualified leads leave the queue
// but stay on /admin/contacts; customers never appear here.

type LeadJoinRow = {
  status: string;
  sla_due_at: string | null;
  attempt_count: number;
  pinned_at: string | null;
  created_at: string;
  people: {
    id: string;
    full_name: string | null;
    email: string;
    phone: string | null;
    source: string | null;
    archived_at: string | null;
    person_companies: { companies: Embedded<{ name: string | null }> }[] | null;
    person_qualifications: Embedded<{
      goal: string | null;
      plan: string | null;
      challenge: string | null;
      timeline: string | null;
      budget: string | null;
      authority: string | null;
    }>;
    inquiries: { subject: string | null; message: string | null; created_at: string }[] | null;
  } | null;
};

function startOfDayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default async function LeadsPage() {
  const nowIso = new Date().toISOString();

  const [queueRes, meetingsBooked, connectsRes] = await Promise.all([
    companyOs
      .from("lead")
      .select(
        "status, sla_due_at, attempt_count, pinned_at, created_at, people!person_id!inner(id, full_name, email, phone, source, archived_at, person_companies(companies(name)), person_qualifications!person_id(goal, plan, challenge, timeline, budget, authority), inquiries(subject, message, created_at))",
      )
      .in("status", ACTIVE_LEAD_STATUSES)
      .is("people.archived_at", null)
      // Pinned leads (manually boosted) sort to the top, most recently pinned
      // first; everyone else keeps the system SLA-first, then-oldest order.
      .order("pinned_at", { ascending: false, nullsFirst: false })
      .order("sla_due_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(200),
    getMeetingsBookedThisWeek(),
    companyOs
      .from("lifecycle_transitions")
      .select("id", { count: "exact", head: true })
      .eq("to_status", "connected")
      .gte("occurred_at", startOfDayIso()),
  ]);

  const rows: QueueRow[] = (((queueRes.data as unknown) as LeadJoinRow[] | null) ?? [])
    .filter((l) => l.people)
    .map((l) => {
      const p = l.people!;
      const qual = one(p.person_qualifications);
      const latestInquiry = (p.inquiries ?? [])
        .slice()
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      return {
        id: p.id,
        name: p.full_name || p.email,
        email: p.email,
        phone: p.phone,
        company: one(p.person_companies?.[0]?.companies ?? null)?.name ?? null,
        source: p.source,
        stage: "lead",
        status: l.status ?? "new",
        slaDueAt: l.sla_due_at,
        attemptCount: l.attempt_count ?? 0,
        pinnedAt: l.pinned_at,
        inquiry: latestInquiry
          ? {
              subject: latestInquiry.subject,
              message: latestInquiry.message,
              createdAt: latestInquiry.created_at,
            }
          : null,
        qual: {
          goal: qual?.goal ?? "",
          plan: qual?.plan ?? "",
          challenge: qual?.challenge ?? "",
          timeline: qual?.timeline ?? "",
          budget: qual?.budget ?? "",
          authority: qual?.authority ?? "",
        },
      };
    });

  const connectsToday = connectsRes.count ?? 0;
  const slaOverdue = rows.filter((r) => r.slaDueAt && r.slaDueAt < nowIso).length;

  return (
    <>
      <PageHead
        eyebrow="Revenue"
        title="Leads"
        sub={`${rows.length} in the queue · worked top to bottom, SLA first`}
      />
      {queueRes.error && (
        <div className="admin-alert admin-alert--err u-mb-4">
          {queueRes.error.message}
        </div>
      )}
      <div className="admin-kpi-grid u-mb-4">
        <MetricCard
          label="Meetings booked this week"
          value={`${meetingsBooked} / ${WEEKLY_MEETINGS_GOAL}`}
          sub="handed off to the closer"
        />
        <MetricCard label="Connects today" value={connectsToday} />
        <MetricCard label="Queue remaining" value={rows.length} />
        <MetricCard
          label="SLA overdue"
          value={slaOverdue}
          sub={slaOverdue > 0 ? "respond now" : "all inside SLA"}
        />
      </div>
      <LeadQueue rows={rows} />
    </>
  );
}
