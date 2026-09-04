import Link from "next/link";
import { companyOs } from "@/lib/supabase";
import { byFirstName, personName } from "@/lib/people-name";
import { PageHead } from "@/components/admin/PageHead";
import { MetricCard } from "@/components/admin/MetricCard";
import { countWorkingDays, formatLeaveBalance } from "@/lib/admin/time-off";
import { ViewToggle } from "@/components/admin/ViewToggle";
import { TimeOffCalendar, type CalendarEntry } from "@/components/admin/TimeOffCalendar";
import { TimeOffBoard, type MemberOption, type RequestRow, type LeaderRow } from "./TimeOffBoard";
import { one, type Embedded } from "@/lib/embedded";

export const dynamic = "force-dynamic";
// Belt-and-braces: this repo has seen supabase fetches cache-frozen on Vercel
// despite force-dynamic (see the stats route). A stale requests board means an
// admin misses new leave, so pin the data cache off explicitly.
export const fetchCache = "force-no-store";

// Operations → Time Off. Employees self-serve in /team/time-off; their leave
// policy decides the path (Edge8 Core Team auto-approves, On Target is manual).
// This board is awareness-first: upcoming and pending leave up top with the
// decision controls (approve/reject pending, deny an auto-approval), 2026
// usage cards, then the full log. The admin "log time off for someone" form is
// deliberately secondary — admins rarely file leave on someone's behalf.

type Person = { full_name: string | null; email: string };
type MemberEmbed = { id: string; people: Embedded<Person> };

type TeamRow = { id: string; people: Embedded<Person> };
type TimeOffRow = {
  id: string;
  leave_type: string;
  status: string;
  start_date: string;
  end_date: string;
  is_half_day: boolean;
  reason: string | null;
  days: number | string | null;
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
  client_approved_by: string | null;
  external_source: string | null;
  team_members: Embedded<MemberEmbed>;
};

// Prefer the imported Day Off day count (it excluded holidays); fall back to
// the weekend-only computation for rows created in-app.
function daysOf(r: TimeOffRow): number {
  const n = r.days === null || r.days === undefined ? NaN : Number(r.days);
  return Number.isFinite(n) ? n : countWorkingDays(r.start_date, r.end_date, r.is_half_day);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export default async function TimeOffPage() {
  const [teamRes, offRes] = await Promise.all([
    companyOs
      .from("team_members")
      .select("id, people!person_id(display_name, preferred_name, full_name, email)")
      .eq("status", "active"),
    companyOs
      .from("time_off")
      .select(
        "id, leave_type, status, start_date, end_date, is_half_day, reason, days, created_at, approved_at, approved_by, client_approved_by, external_source, team_members!team_member_id(id, people!person_id(display_name, preferred_name, full_name, email))",
      )
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);

  const members: MemberOption[] = ((teamRes.data ?? []) as TeamRow[])
    .map((t) => ({ id: t.id, name: personName(one(t.people)) }))
    .sort((a, b) => byFirstName(a.name, b.name));

  const raw = (offRes.data ?? []) as TimeOffRow[];

  // Client-manager decisions point at people, not team_members, so they can't
  // ride the team_members embed above. Small, separate name lookup.
  const clientApproverIds = [...new Set(raw.map((r) => r.client_approved_by).filter((id): id is string => !!id))];
  const { data: approverPeople } = clientApproverIds.length
    ? await companyOs
        .from("people")
        .select("id, display_name, preferred_name, full_name, email")
        .in("id", clientApproverIds)
    : { data: [] as (Person & { id: string })[] };
  const approverNameById = new Map(
    ((approverPeople ?? []) as (Person & { id: string })[]).map((p) => [p.id, personName(p)]),
  );
  const rows: RequestRow[] = raw.map((r) => ({
    id: r.id,
    memberName: personName(one(one(r.team_members)?.people ?? null)),
    leaveType: r.leave_type,
    status: r.status,
    startDate: r.start_date,
    endDate: r.end_date,
    isHalfDay: r.is_half_day,
    reason: r.reason,
    days: daysOf(r),
    requestedAt: r.created_at,
    // Approved-by-policy, not by a person: only portal auto-approval produces
    // approved_at with no approver and no external source (Day Off imports have
    // external_source; admin decisions stamp approved_by; a client manager's
    // decision stamps client_approved_by and must not read as "auto").
    isAutoApproved:
      r.approved_at !== null &&
      r.approved_by === null &&
      r.client_approved_by === null &&
      r.external_source === null,
    clientApproverName: r.client_approved_by ? approverNameById.get(r.client_approved_by) ?? null : null,
  }));

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // The primary table: anything still needing attention — pending requests
  // (whatever their dates) and approved leave that hasn't finished yet.
  const upcoming = rows
    .filter((r) => r.status === "requested" || (r.status === "approved" && r.endDate >= today))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const pending = rows.filter((r) => r.status === "requested").length;
  const newThisWeek = rows.filter((r) => r.requestedAt >= weekAgo).length;

  const counted = (r: RequestRow) =>
    (r.status === "approved" || r.status === "taken") && r.startDate.startsWith("2026");
  const total2026 = round1(rows.filter(counted).reduce((s, r) => s + r.days, 0));

  // Days off per ACTIVE member in 2026, zeros included — the bottom five is the
  // "who isn't taking any leave" signal, so absence of rows must still rank.
  const byMember = new Map<string, number>(members.map((m) => [m.id, 0]));
  for (const r of raw) {
    if (!(r.status === "approved" || r.status === "taken")) continue;
    if (!r.start_date.startsWith("2026")) continue;
    const m = one(r.team_members);
    if (!m || !byMember.has(m.id)) continue;
    byMember.set(m.id, (byMember.get(m.id) ?? 0) + daysOf(r));
  }
  const leaders: LeaderRow[] = members.map((m) => ({
    id: m.id,
    name: m.name,
    days: round1(byMember.get(m.id) ?? 0),
  }));
  const topFive = [...leaders].sort((a, b) => b.days - a.days || a.name.localeCompare(b.name)).slice(0, 5);
  const bottomFive = [...leaders].sort((a, b) => a.days - b.days || a.name.localeCompare(b.name)).slice(0, 5);

  const error = teamRes.error?.message ?? offRes.error?.message ?? null;

  return (
    <>
      <PageHead
        eyebrow="Operations"
        title="Time Off"
        sub="Edge8 policy auto-approves; On Target waits for a decision. Deny anything that doesn't work."
        action={
          <div className="u-row">
            <Link href="/admin/operations/time-off/policies" className="admin-btn">
              Policies
            </Link>
            <Link href="/admin/operations/time-off/import" className="admin-btn">
              Day Off import
            </Link>
          </div>
        }
      />

      {error && <div className="admin-alert admin-alert--err">{error}</div>}

      <div className="admin-kpi-grid u-mb-5">
        <MetricCard label="Pending approval" value={pending} />
        <MetricCard label="New this week" value={newThisWeek} />
        <MetricCard label="Days off in 2026" value={formatLeaveBalance(total2026)} />
      </div>

      <ViewToggle
        views={[
          {
            key: "board",
            label: "Board",
            content: (
              <TimeOffBoard
                members={members}
                upcoming={upcoming}
                all={rows}
                topFive={topFive}
                bottomFive={bottomFive}
              />
            ),
          },
          {
            key: "calendar",
            label: "Calendar",
            content: (
              <div className="admin-card admin-section-card">
                <h2 className="admin-card-title">Team calendar</h2>
                <TimeOffCalendar
                  entries={rows.map(
                    (r): CalendarEntry => ({
                      id: r.id,
                      name: r.memberName,
                      leaveType: r.leaveType,
                      status: r.status,
                      startDate: r.startDate,
                      endDate: r.endDate,
                      isHalfDay: r.isHalfDay,
                    }),
                  )}
                />
              </div>
            ),
          },
        ]}
      />
    </>
  );
}
