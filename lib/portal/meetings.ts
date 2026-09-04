// Client-visible meeting notes. A dedicated, reviewed helper — same discipline
// as lib/portal/invoices.ts.
//
// These are client meetings in the central company_os.meetings table, scoped to
// the actor's company. The meeting date is stored in started_at and the
// client-facing summary in `summary`.
//
// VISIBILITY: meetings are for client managers. A portal ADMIN (manager) sees
// all of their company's meetings (draft and published); a non-admin member
// sees only PUBLISHED ones (published_at not null), so publishing is how a
// meeting reaches the rest of the client team.
//
// PRIVACY HARD LINE: the raw transcript (call_transcripts) is NEVER joined here
// (it is admin-only). The client sees date / attendees / title / summary only.

import { companyOs } from "@/lib/supabase";
import type { PortalActor } from "@/lib/portal-auth";
import { adminCompanyScope } from "@/lib/portal/roles";
import { one } from "@/lib/embedded";

const NOTES_SELECT =
  "id, company_id, started_at, title, attendees, summary, published_at, ai_program_id, ai_program:ai_programs!ai_program_id(name)";

export type PortalMeeting = {
  id: string;
  meetingDate: string | null;
  title: string | null;
  attendees: string[];
  summary: string | null;
  publishedAt: string | null;
  // AI Program tag; null = company-wide. The id lets the hub and program
  // pages split company-wide from program-tagged rows.
  aiProgramId: string | null;
  aiProgramName: string | null;
};

type Row = {
  id: string;
  company_id: string;
  started_at: string | null;
  title: string | null;
  attendees: string[] | null;
  summary: string | null;
  published_at: string | null;
  ai_program_id: string | null;
  ai_program?: { name: string | null } | { name: string | null }[] | null;
};

const toMeeting = (r: Row): PortalMeeting => ({
  id: r.id,
  meetingDate: r.started_at ? r.started_at.slice(0, 10) : null,
  title: r.title,
  attendees: r.attendees ?? [],
  summary: r.summary,
  publishedAt: r.published_at,
  aiProgramId: r.ai_program_id,
  aiProgramName: one(r.ai_program)?.name ?? null,
});

export async function hasMeetings(actor: PortalActor): Promise<boolean> {
  if (actor.companyScope.length === 0) return false;
  const managerScope = adminCompanyScope(actor);
  // Managers get the meetings surface whenever any meeting exists for their
  // company; other members only when a published one does.
  let q = companyOs.from("meetings").select("id").is("archived_at", null);
  if (managerScope.length > 0) {
    const { data } = await companyOs
      .from("meetings")
      .select("id")
      .in("company_id", managerScope)
      .is("archived_at", null)
      .limit(1);
    if ((data ?? []).length > 0) return true;
  }
  const { data } = await q.in("company_id", actor.companyScope).not("published_at", "is", null).limit(1);
  return (data ?? []).length > 0;
}

// One meeting for the portal detail page. A manager may open any of their
// company's meetings; a non-manager only a published one. companyScope is part
// of the query, so an id from another client never resolves.
export async function getMeetingForActor(actor: PortalActor, id: string): Promise<PortalMeeting | null> {
  if (actor.companyScope.length === 0) return null;
  const managerScope = new Set(adminCompanyScope(actor));

  const { data } = await companyOs
    .from("meetings")
    .select(NOTES_SELECT)
    .eq("id", id)
    .in("company_id", actor.companyScope)
    .is("archived_at", null)
    .maybeSingle();

  if (!data) return null;
  const r = data as Row;
  if (r.published_at === null && !managerScope.has(r.company_id)) return null;
  return toMeeting(r);
}

export async function getMeetingsForActor(actor: PortalActor): Promise<PortalMeeting[]> {
  if (actor.companyScope.length === 0) return [];
  const managerScope = new Set(adminCompanyScope(actor));

  const { data } = await companyOs
    .from("meetings")
    .select(NOTES_SELECT)
    .in("company_id", actor.companyScope)
    .is("archived_at", null)
    .order("started_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  return ((data ?? []) as Row[])
    .filter((r) => r.published_at !== null || managerScope.has(r.company_id))
    .map(toMeeting);
}
