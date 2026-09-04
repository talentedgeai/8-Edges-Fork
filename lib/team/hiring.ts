// /team/hiring, the hiring manager's read on their roles: what is open, who is
// in flight, what the loop is, and where they personally sit in it.
//
// SCOPE is by hiring ownership, and only that. A non-admin sees only the reqs
// they are the hiring_manager_id of; admins (who also have /admin/talent) see
// all. Being an org "manager" (having direct reports) or an interview panelist
// does NOT grant access to the board: a panelist reaches only their own kit, by
// link. isHiringManager() is the single gate the page and the sidebar both use,
// so a non-hiring-manager never sees the board, its link, or any req.
//
// Read-only throughout: hiring is written from /admin.

import { companyOs } from "@/lib/supabase";
import type { TeamActor } from "@/lib/team-auth";
import { getLoopsForRequisitions, type LoopStep } from "@/lib/ats/loop";
import { isAiPanelist, recommendationFromDb, type RecommendationKey } from "@/lib/admin/interview-panel";
import { one } from "@/lib/embedded";

type PersonRow = { full_name: string | null; preferred_name: string | null; email: string | null };

const displayName = (p: PersonRow | null): string =>
  p?.preferred_name || p?.full_name || p?.email || "-";

export type HiringCandidate = {
  applicationId: string;
  name: string;
  stageName: string | null;
  appliedAt: string | null;
  rating: number | null;
};

export type HiringReq = {
  id: string;
  title: string;
  status: string;
  headcount: number | null;
  location: string | null;
  employmentType: string | null;
  openedAt: string | null;
  hiringManagerName: string | null;
  hiringManagerIsMe: boolean;
  // When the req was closed (filled / closed / cancelled). Null while open.
  closedAt: string | null;
  loop: LoopStep[];
  candidates: HiringCandidate[];
  // Candidates sitting on a non-terminal stage, the number a manager acts on.
  activeCount: number;
  // The candidate x admin-loop-step matrix for the active candidates on this req.
  grid: HiringGridRow[];
  // Booked interviews on this req that the ingest could not match to a loop
  // step (loop_step_id is null). Surfaced so they are never silently invisible.
  unassignedCount: number;
};

// One cell of the candidate x round grid: where this candidate stands on one
// loop step, derived from bookings, scorecards, and the candidate's stage.
export type GridCellStatus =
  | "done" // interview happened, all human scorecards in
  | "pending" // interview happened, human scorecards outstanding
  | "booked" // scheduled ahead
  | "action" // at the interview stage, this is the next unbooked step
  | "open" // at the interview stage, a later unbooked step
  | "none"; // not reached yet, or already past this candidate

export type GridCell = {
  status: GridCellStatus;
  label: string;
  interviewId: string | null;
  scheduledAt: string | null;
};

export type HiringGridRow = {
  applicationId: string;
  name: string;
  rating: number | null;
  stageName: string | null;
  atInterview: boolean;
  cells: GridCell[]; // aligned to HiringReq.loop order
  // Every interview this candidate has had or has booked, with its outcome.
  // Populated for all reqs so the in-flight list shows feedback even when the
  // role has no loop template (and there is therefore no grid to read it from).
  interviews: CandidateInterview[];
  // When a manager has already asked recruiting to book (metadata stamp), so the
  // grid shows "requested" instead of offering the button again.
  bookingRequestedAt: string | null;
};

// One of a candidate's interviews, summarised for the in-flight list: what round
// it was, when, and how the human panel came down (recommendations + average
// score). Clicking through opens the kit with the full scorecards.
export type CandidateInterview = {
  interviewId: string;
  label: string;
  scheduledAt: string | null;
  humanSeats: number;
  submitted: number;
  recommendations: RecommendationKey[];
  avgScore: number | null;
  // Blind-first: false when the viewer is a panelist on this interview who has
  // not submitted their own scorecard yet. The panel's outcome is withheld until
  // they do, so seeing it here cannot anchor them.
  revealed: boolean;
};

export type MyLoopSlot = {
  reqId: string;
  reqTitle: string;
  stepName: string;
  durationMinutes: number | null;
  position: number;
  // Candidates currently at the Interview stage on this req, i.e. the people
  // this manager is on the hook to meet.
  waiting: number;
  // Conversations already booked against this step, soonest first. Empty until
  // the Lark ingest has matched a calendar event to it.
  booked: BookedInterview[];
};

export type BookedInterview = {
  interviewId: string;
  candidateName: string;
  scheduledAt: string;
  durationMinutes: number | null;
  status: string | null;
  mode: string | null;
};

export type TeamHiring = {
  reqs: HiringReq[];
  // Recently closed roles (filled / closed / cancelled), kept out of the main
  // list so active roles stay in focus, but still openable read-only.
  closedReqs: HiringReq[];
  mySlots: MyLoopSlot[];
};

// A booked interview this manager personally sits on, seen from the day view:
// up next, happening now, a scorecard owed, or already scored. Distinct from
// MyLoopSlot (standing loop membership): this is one specific conversation.
export type MyInterviewState = "up_next" | "in_progress" | "scorecard_due" | "done";

export type MyInterview = {
  interviewId: string;
  applicationId: string;
  candidateName: string;
  reqTitle: string;
  stepName: string;
  scheduledAt: string;
  durationMinutes: number | null;
  mode: string | null;
  status: string | null;
  state: MyInterviewState;
  isToday: boolean;
};

const OPEN_STATUSES = ["open", "on_hold", "draft"];
const CLOSED_STATUSES = ["filled", "closed", "cancelled"];
// How far back closed roles stay on the page, and how many at most, so the
// section is a recent-history list, not the whole archive.
const CLOSED_WINDOW_DAYS = 180;
const CLOSED_CAP = 25;

// The clock everyone on this team reads. "Today" and the in-progress window are
// judged in Saigon time, not the server's UTC.
const SAIGON_TZ = "Asia/Ho_Chi_Minh";

// YYYY-MM-DD for a moment, as seen in Saigon. en-CA formats ISO-style.
function saigonDateKey(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: SAIGON_TZ });
}

// A short round name for an interview: the loop step if it has one, else the
// interview title, unless that is a noisy calendar-invite title, in which case
// just "Interview".
function roundLabel(stepName: string | null | undefined, title: string | null): string {
  if (stepName && stepName.trim()) return stepName.trim();
  const t = (title ?? "").trim();
  if (t && t.length <= 40 && !/invit/i.test(t)) return t;
  return "Interview";
}

// Interviews carrying no scorecard need are skipped from the scorecard-due
// backlog: a cancelled conversation is not owed a card.
const DEAD_INTERVIEW_STATUSES = new Set(["cancelled", "canceled", "withdrawn", "no_show"]);
// How far back an unscored interview keeps nagging. Older than this and it has
// aged out of the day view (the record still exists in admin).
const SCORECARD_DUE_WINDOW_DAYS = 30;
// How long a scored interview lingers on the day view as "done" before the grid
// and kit become its only home.
const RECENTLY_SCORED_WINDOW_DAYS = 3;

// Whether this person may see the hiring board at all: an admin, or the hiring
// manager on at least one requisition (any status). Org "manager" role (having
// direct reports) and interview-panel seats do NOT grant access; a panelist
// reaches only their own interview kit, by link. Used by the page gate and the
// sidebar nav so a non-hiring-manager never sees the board or its link.
export async function isHiringManager(actor: TeamActor): Promise<boolean> {
  if (actor.isAdmin) return true;
  const { count } = await companyOs
    .from("job_requisitions")
    .select("id", { count: "exact", head: true })
    .eq("hiring_manager_id", actor.personId);
  return (count ?? 0) > 0;
}

export async function getTeamHiring(actor: TeamActor): Promise<TeamHiring> {
  // Scope is by hiring ownership, not org role: a non-admin sees only the reqs
  // they are the hiring manager of. Admins oversee all hiring (they also have
  // /admin/talent). There is no department-wide or people-manager fallback, so
  // someone who owns no reqs gets an empty result.
  const reqSelect =
    "id, title, status, headcount, location, employment_type, opened_at, closed_at, hiring_manager_id, " +
    "people:people!hiring_manager_id(full_name, preferred_name, email)";

  let openQuery = companyOs
    .from("job_requisitions")
    .select(reqSelect)
    .in("status", OPEN_STATUSES)
    .order("opened_at", { ascending: false });
  if (!actor.isAdmin) openQuery = openQuery.eq("hiring_manager_id", actor.personId);

  // Recently closed roles I own, newest first, capped.
  const closedCutoff = new Date(Date.now() - CLOSED_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  let closedQuery = companyOs
    .from("job_requisitions")
    .select(reqSelect)
    .in("status", CLOSED_STATUSES)
    .gte("closed_at", closedCutoff)
    .order("closed_at", { ascending: false })
    .limit(CLOSED_CAP);
  if (!actor.isAdmin) closedQuery = closedQuery.eq("hiring_manager_id", actor.personId);

  const [{ data: openRows }, { data: closedRows }] = await Promise.all([openQuery, closedQuery]);
  // One enrichment pass covers both; they are partitioned back apart at the end.
  const reqs = [
    ...((openRows ?? []) as unknown as Record<string, unknown>[]),
    ...((closedRows ?? []) as unknown as Record<string, unknown>[]),
  ];
  if (reqs.length === 0) {
    return { reqs: [], closedReqs: [], mySlots: [] };
  }
  const reqIds = reqs.map((r) => r.id as string);

  const [{ data: stageRows }, { data: appRows }, loops] = await Promise.all([
    companyOs
      .from("application_stages")
      .select("id, job_requisition_id, name, position, is_terminal")
      .in("job_requisition_id", reqIds)
      .order("position"),
    companyOs
      .from("applications")
      .select(
        "id, job_requisition_id, current_stage_id, rating, applied_at, archived_at, metadata, " +
          "people:people!person_id(full_name, preferred_name, email)",
      )
      .in("job_requisition_id", reqIds)
      .is("archived_at", null),
    getLoopsForRequisitions(reqIds),
  ]);

  // When each application last had a booking requested by a manager (metadata
  // stamp), used to show "requested" rather than re-offering the grid button.
  const bookingReqByApp = new Map<string, string | null>();
  for (const a of ((appRows ?? []) as unknown as Record<string, unknown>[])) {
    const meta = a.metadata as { booking_requested_at?: string } | null;
    bookingReqByApp.set(a.id as string, (meta && meta.booking_requested_at) || null);
  }

  const stages = (stageRows ?? []) as Array<{
    id: string;
    job_requisition_id: string;
    name: string;
    position: number;
    is_terminal: boolean;
  }>;
  const stageById = new Map(stages.map((s) => [s.id, s]));
  // The pipeline's interview stage per req, for "who am I on the hook to meet".
  const interviewStageByReq = new Map<string, string>();
  for (const s of stages) {
    if (!interviewStageByReq.has(s.job_requisition_id) && /interview/i.test(s.name)) {
      interviewStageByReq.set(s.job_requisition_id, s.id);
    }
  }

  const candidatesByReq = new Map<string, HiringCandidate[]>();
  const atInterviewByReq = new Map<string, number>();
  for (const a of ((appRows ?? []) as unknown as Record<string, unknown>[])) {
    const reqId = a.job_requisition_id as string;
    const stageId = (a.current_stage_id as string | null) ?? null;
    const stage = stageId ? stageById.get(stageId) ?? null : null;
    const list = candidatesByReq.get(reqId) ?? [];
    list.push({
      applicationId: a.id as string,
      name: displayName(one(a.people as PersonRow | PersonRow[] | null)),
      stageName: stage?.name ?? null,
      appliedAt: (a.applied_at as string | null) ?? null,
      rating: (a.rating as number | null) ?? null,
    });
    candidatesByReq.set(reqId, list);
    if (stageId && stageId === interviewStageByReq.get(reqId)) {
      atInterviewByReq.set(reqId, (atInterviewByReq.get(reqId) ?? 0) + 1);
    }
  }

  const out: HiringReq[] = reqs.map((r) => {
    const id = r.id as string;
    const list = (candidatesByReq.get(id) ?? []).sort((a, b) => a.name.localeCompare(b.name));
    const active = list.filter((c) => {
      const s = stages.find((x) => x.job_requisition_id === id && x.name === c.stageName);
      return s ? !s.is_terminal : true;
    }).length;
    return {
      id,
      title: (r.title as string | null) ?? "(untitled req)",
      status: (r.status as string | null) ?? "open",
      headcount: (r.headcount as number | null) ?? null,
      location: (r.location as string | null) ?? null,
      employmentType: (r.employment_type as string | null) ?? null,
      openedAt: (r.opened_at as string | null) ?? null,
      hiringManagerName: r.hiring_manager_id
        ? displayName(one(r.people as PersonRow | PersonRow[] | null))
        : null,
      hiringManagerIsMe: (r.hiring_manager_id as string | null) === actor.personId,
      closedAt: (r.closed_at as string | null) ?? null,
      loop: loops.get(id) ?? [],
      candidates: list,
      activeCount: active,
      grid: [],
      unassignedCount: 0,
    };
  });

  // Every interview on these reqs' applications, with each panel's human-seat
  // count and how many humans have submitted. One query feeds three things: the
  // booked-by-step list (mySlots), the candidate x round grid, and the count of
  // interviews the ingest could not match to a loop step. Read by application,
  // so null-loop_step_id rows come back too (the by-step query would drop them).
  const appIds = out.flatMap((r) => r.candidates.map((c) => c.applicationId));
  const candByApp = new Map<string, { name: string; reqId: string; stageName: string | null; rating: number | null }>();
  for (const req of out) {
    for (const c of req.candidates) {
      candByApp.set(c.applicationId, { name: c.name, reqId: req.id, stageName: c.stageName, rating: c.rating });
    }
  }

  type IvRow = {
    id: string;
    loopStepId: string | null;
    label: string;
    scheduledAt: string | null;
    durationMinutes: number | null;
    status: string | null;
    mode: string | null;
    humanSeats: number;
    submittedHuman: number;
    recommendations: RecommendationKey[];
    avgScore: number | null;
    revealed: boolean;
  };
  const ivByApp = new Map<string, IvRow[]>();
  const bookedByStep = new Map<string, BookedInterview[]>();
  const unassignedByReq = new Map<string, number>();

  if (appIds.length > 0) {
    const { data: ivRows } = await companyOs
      .from("interviews")
      .select(
        "id, application_id, loop_step_id, scheduled_at, duration_minutes, status, mode, title, " +
          "requisition_loop_steps:requisition_loop_steps!loop_step_id ( name ), " +
          "interview_interviewers ( interviewer_id, people!interviewer_id ( email, metadata ) ), " +
          "interview_scorecards ( interviewer_id, submitted_at, recommendation, overall_score )",
      )
      .in("application_id", appIds);

    for (const raw of ((ivRows ?? []) as unknown as Record<string, unknown>[])) {
      const appId = raw.application_id as string;
      const meta = candByApp.get(appId);
      if (!meta) continue;

      const seats = (raw.interview_interviewers ?? []) as Record<string, unknown>[];
      const humanSeatIds = new Set<string>();
      for (const s of seats) {
        const person = one(s.people as { email?: string | null; metadata?: unknown } | Array<{ email?: string | null; metadata?: unknown }> | null);
        if (isAiPanelist(person)) continue;
        humanSeatIds.add(s.interviewer_id as string);
      }
      const scorecards = (raw.interview_scorecards ?? []) as Record<string, unknown>[];
      let submittedHuman = 0;
      let actorSubmitted = false;
      const recommendations: RecommendationKey[] = [];
      const overallScores: number[] = [];
      for (const sc of scorecards) {
        if (!(sc.submitted_at && humanSeatIds.has(sc.interviewer_id as string))) continue;
        submittedHuman += 1;
        if ((sc.interviewer_id as string) === actor.personId) actorSubmitted = true;
        const rec = recommendationFromDb(sc.recommendation as string | null);
        if (rec) recommendations.push(rec);
        const ov = sc.overall_score as number | null;
        if (ov != null) overallScores.push(ov);
      }
      // If the viewer sits on this interview, the outcome stays blind until they
      // have filed their own scorecard.
      const revealed = !humanSeatIds.has(actor.personId) || actorSubmitted;
      const avgScore =
        overallScores.length > 0
          ? Math.round((overallScores.reduce((s, n) => s + n, 0) / overallScores.length) * 10) / 10
          : null;

      const loopStepId = (raw.loop_step_id as string | null) ?? null;
      const scheduledAt = (raw.scheduled_at as string | null) ?? null;
      const durationMinutes = (raw.duration_minutes as number | null) ?? null;
      const status = (raw.status as string | null) ?? null;
      const mode = (raw.mode as string | null) ?? null;
      const label = roundLabel(
        one(raw.requisition_loop_steps as Record<string, unknown> | Record<string, unknown>[] | null)?.name as string | null,
        raw.title as string | null,
      );

      const list = ivByApp.get(appId) ?? [];
      list.push({
        id: raw.id as string,
        loopStepId,
        label,
        scheduledAt,
        durationMinutes,
        status,
        mode,
        humanSeats: humanSeatIds.size,
        submittedHuman,
        recommendations,
        avgScore,
        revealed,
      });
      ivByApp.set(appId, list);

      if (loopStepId === null) {
        unassignedByReq.set(meta.reqId, (unassignedByReq.get(meta.reqId) ?? 0) + 1);
      } else if (scheduledAt) {
        const bookedList = bookedByStep.get(loopStepId) ?? [];
        bookedList.push({ interviewId: raw.id as string, candidateName: meta.name, scheduledAt, durationMinutes, status, mode });
        bookedByStep.set(loopStepId, bookedList);
      }
    }
    for (const list of bookedByStep.values()) {
      list.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    }
  }

  // Build each req's grid: active candidates (rows) x loop steps (columns).
  const gridNow = new Date();
  const gridNowMs = gridNow.getTime();
  const gridTodayKey = saigonDateKey(gridNow);
  const bookedLabel = (iso: string): string => {
    const d = new Date(iso);
    if (saigonDateKey(d) === gridTodayKey) {
      return `Today ${d.toLocaleTimeString("en-GB", { timeZone: SAIGON_TZ, hour: "2-digit", minute: "2-digit" })}`;
    }
    return d.toLocaleDateString("en-GB", { timeZone: SAIGON_TZ, day: "numeric", month: "short" });
  };
  const cellForStep = (stepId: string, ivs: IvRow[]): GridCell | null => {
    const stepIvs = ivs.filter((iv) => iv.loopStepId === stepId);
    if (stepIvs.length === 0) return null;
    const future = stepIvs
      .filter((iv) => iv.scheduledAt && new Date(iv.scheduledAt).getTime() > gridNowMs)
      .sort((a, b) => new Date(a.scheduledAt as string).getTime() - new Date(b.scheduledAt as string).getTime());
    if (future.length > 0) {
      const iv = future[0];
      return { status: "booked", label: bookedLabel(iv.scheduledAt as string), interviewId: iv.id, scheduledAt: iv.scheduledAt };
    }
    // Otherwise it has already happened (or has no time). Latest wins.
    const latest = stepIvs
      .slice()
      .sort((a, b) => (new Date(b.scheduledAt ?? 0).getTime() || 0) - (new Date(a.scheduledAt ?? 0).getTime() || 0))[0];
    if (latest.humanSeats > 0 && latest.submittedHuman < latest.humanSeats) {
      return { status: "pending", label: `${latest.submittedHuman}/${latest.humanSeats}`, interviewId: latest.id, scheduledAt: latest.scheduledAt };
    }
    return { status: "done", label: "Done", interviewId: latest.id, scheduledAt: latest.scheduledAt };
  };

  for (const req of out) {
    req.unassignedCount = unassignedByReq.get(req.id) ?? 0;
    const interviewStageId = interviewStageByReq.get(req.id) ?? null;
    // A closed role shows its full history, hire and all; an open one shows only
    // who is still in flight.
    const reqClosed = !OPEN_STATUSES.includes(req.status);
    const rows: HiringGridRow[] = [];
    for (const c of req.candidates) {
      const stage = stages.find((s) => s.job_requisition_id === req.id && s.name === c.stageName) ?? null;
      if (stage?.is_terminal && !reqClosed) continue; // in-flight only, for open roles
      const atInterview = stage != null && interviewStageId != null && stage.id === interviewStageId;
      const ivs = ivByApp.get(c.applicationId) ?? [];
      const interviews: CandidateInterview[] = ivs
        .slice()
        .sort((a, b) => new Date(a.scheduledAt ?? 0).getTime() - new Date(b.scheduledAt ?? 0).getTime())
        .map((iv) => ({
          interviewId: iv.id,
          label: iv.label,
          scheduledAt: iv.scheduledAt,
          humanSeats: iv.humanSeats,
          submitted: iv.submittedHuman,
          recommendations: iv.recommendations,
          avgScore: iv.avgScore,
          revealed: iv.revealed,
        }));
      const booked = req.loop.map((step) => cellForStep(step.id, ivs));
      const firstUnbookedIdx = booked.findIndex((cell) => cell === null);
      const cells: GridCell[] = booked.map((cell, idx) => {
        if (cell) return cell;
        if (!atInterview) return { status: "none", label: "-", interviewId: null, scheduledAt: null };
        if (idx === firstUnbookedIdx) return { status: "action", label: "Nothing booked", interviewId: null, scheduledAt: null };
        return { status: "open", label: "Not booked", interviewId: null, scheduledAt: null };
      });
      rows.push({
        applicationId: c.applicationId,
        name: c.name,
        rating: c.rating,
        stageName: c.stageName,
        atInterview,
        cells,
        interviews,
        bookingRequestedAt: bookingReqByApp.get(c.applicationId) ?? null,
      });
    }
    req.grid = rows;
  }

  const openReqs = out.filter((r) => OPEN_STATUSES.includes(r.status));
  const closedReqs = out.filter((r) => !OPEN_STATUSES.includes(r.status));

  // Where this manager personally sits in a loop. Loops reference people, so
  // the match is on personId, never teamMemberId. Only open roles count.
  const mySlots: MyLoopSlot[] = [];
  for (const req of openReqs) {
    for (const step of req.loop) {
      if (!step.interviewers.some((iv) => iv.personId === actor.personId)) continue;
      mySlots.push({
        reqId: req.id,
        reqTitle: req.title,
        stepName: step.name,
        durationMinutes: step.durationMinutes,
        position: step.position,
        waiting: atInterviewByReq.get(req.id) ?? 0,
        booked: bookedByStep.get(step.id) ?? [],
      });
    }
  }
  mySlots.sort((a, b) => a.reqTitle.localeCompare(b.reqTitle) || a.position - b.position);

  return { reqs: openReqs, closedReqs, mySlots };
}

// The manager's day: every booked interview they personally sit on that is
// either happening today or overdue a scorecard from them. Seats are read from
// interview_interviewers (the per-interview panel the Lark ingest writes from
// the loop's assigned interviewers), matched on personId. Scoping is implicit:
// an actor only ever sees interviews they hold a seat on, so no department
// filter is needed or wanted here.
export async function getMyInterviewDay(actor: TeamActor): Promise<MyInterview[]> {
  const { data: seatRows } = await companyOs
    .from("interview_interviewers")
    .select(
      "interview_id, " +
        "interviews:interviews!interview_id ( id, title, scheduled_at, duration_minutes, mode, status, application_id, " +
        "requisition_loop_steps:requisition_loop_steps!loop_step_id ( name ), " +
        "applications:applications!application_id ( id, archived_at, " +
        "job_requisitions:job_requisitions!job_requisition_id ( title ), " +
        "people:people!person_id ( full_name, preferred_name, email ) ) )",
    )
    .eq("interviewer_id", actor.personId);

  const rows = (seatRows ?? []) as unknown as Record<string, unknown>[];
  if (rows.length === 0) return [];

  const now = new Date();
  const nowMs = now.getTime();
  const todayKey = saigonDateKey(now);
  const cutoffMs = nowMs - SCORECARD_DUE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  // First pass: keep the seats that could plausibly appear (real booking, live
  // application, not aged out), so the scorecard lookup only spans those.
  type Candidate = {
    interviewId: string;
    applicationId: string;
    candidateName: string;
    reqTitle: string;
    stepName: string;
    scheduledAt: string;
    startMs: number;
    endMs: number;
    durationMinutes: number | null;
    mode: string | null;
    status: string | null;
    isToday: boolean;
  };
  const candidates: Candidate[] = [];
  for (const r of rows) {
    const iv = one(r.interviews as Record<string, unknown> | Record<string, unknown>[] | null);
    if (!iv) continue;
    const scheduledAt = (iv.scheduled_at as string | null) ?? null;
    if (!scheduledAt) continue;
    const status = (iv.status as string | null) ?? null;
    if (status && DEAD_INTERVIEW_STATUSES.has(status)) continue;
    const app = one(iv.applications as Record<string, unknown> | Record<string, unknown>[] | null);
    if (!app || (app.archived_at as string | null)) continue;

    const startMs = new Date(scheduledAt).getTime();
    if (Number.isNaN(startMs)) continue;
    const isToday = saigonDateKey(new Date(startMs)) === todayKey;
    // A future interview on another day belongs to that day, not this view.
    // Keep today's (any time) and past ones inside the nag window.
    if (!isToday && (startMs > nowMs || startMs < cutoffMs)) continue;

    const durationMinutes = (iv.duration_minutes as number | null) ?? null;
    const step = one(iv.requisition_loop_steps as Record<string, unknown> | Record<string, unknown>[] | null);
    const req = one(app.job_requisitions as Record<string, unknown> | Record<string, unknown>[] | null);
    candidates.push({
      interviewId: iv.id as string,
      applicationId: app.id as string,
      candidateName: displayName(one(app.people as PersonRow | PersonRow[] | null)),
      reqTitle: (req?.title as string | null) ?? "(untitled req)",
      stepName: (step?.name as string | null) || (iv.title as string | null) || "Interview",
      scheduledAt,
      startMs,
      endMs: startMs + (durationMinutes ?? 60) * 60 * 1000,
      durationMinutes,
      mode: (iv.mode as string | null) ?? null,
      status,
      isToday,
    });
  }
  if (candidates.length === 0) return [];

  // Which of these has this actor already scored? A submitted scorecard clears
  // the "due" flag and drops an overdue interview out of the view entirely.
  const submitted = new Set<string>();
  const { data: scRows } = await companyOs
    .from("interview_scorecards")
    .select("interview_id")
    .eq("interviewer_id", actor.personId)
    .not("submitted_at", "is", null)
    .in(
      "interview_id",
      candidates.map((c) => c.interviewId),
    );
  for (const s of (scRows ?? []) as { interview_id: string }[]) submitted.add(s.interview_id);

  const out: MyInterview[] = [];
  for (const c of candidates) {
    const hasScorecard = submitted.has(c.interviewId);
    let state: MyInterviewState;
    if (c.isToday) {
      if (hasScorecard) state = "done";
      else if (nowMs < c.startMs) state = "up_next";
      else if (nowMs <= c.endMs) state = "in_progress";
      else state = "scorecard_due";
    } else if (hasScorecard) {
      // Already scored. Keep it on the day view for a few days as "done" so a
      // manager's finished interviews do not vanish the moment feedback lands
      // (that read as "my work disappeared"). After the window it drops off; the
      // durable record is the candidate x round grid and the kit.
      if (nowMs - c.startMs > RECENTLY_SCORED_WINDOW_DAYS * 24 * 60 * 60 * 1000) continue;
      state = "done";
    } else {
      // Past, unscored, within the nag window: a scorecard is still owed.
      state = "scorecard_due";
    }
    out.push({
      interviewId: c.interviewId,
      applicationId: c.applicationId,
      candidateName: c.candidateName,
      reqTitle: c.reqTitle,
      stepName: c.stepName,
      scheduledAt: c.scheduledAt,
      durationMinutes: c.durationMinutes,
      mode: c.mode,
      status: c.status,
      state,
      isToday: c.isToday,
    });
  }
  // Soonest first; overdue (earlier) naturally sorts to the top.
  out.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  return out;
}
