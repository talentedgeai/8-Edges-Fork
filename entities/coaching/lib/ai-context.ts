// Context assembly for the coaching generators (ai.ts): the blocks of text a
// prompt is handed, one loader per block, each a plain string so a generator
// composes its user message by concatenation. Split out of ai.ts on
// 2026-09-16 (K.4) when that file crossed its size allowlist; nothing here
// calls a model or writes a row.

import { createHash } from "node:crypto";
import { HOW_I_WORK, toHowIWork, type HowIWork } from "./how-i-work";
import { companyOs } from "@/kernel/data/supabase";
import { one } from "@/kernel/config/embedded";
import { OPEN_COMMITMENT_STATUSES, currentCycleCheckin, type RecapLanguage } from "./types";
import { getEdgesLadderOptions } from "./data/goals";
import { saigonToday } from "@/kernel/config/dates";

// Input clamps: keep any one document from flooding the context window.
export const MAX_DOC_CHARS = 20_000;

export const clip = (s: string, max: number): string =>
  s.length > max ? `${s.slice(0, max)}\n\n[...truncated]` : s;

export type ProfileContext = {
  profileId: string;
  coachId: string;
  memberName: string;
  positionTitle: string | null;
  retentionRoot: string | null;
  privateProfileMarkdown: string | null;
  // What the MEMBER wrote about how they work (L.3). In the prep because the
  // most useful thing a coach can walk in knowing is how this person wants to
  // be worked with, in their own words rather than in a read of them.
  howIWork: HowIWork;
  cadenceDays: number;
  // Null means the shared recap follows the transcript (K.12).
  recapLanguage: RecapLanguage | null;
};

export async function loadProfileContext(profileId: string): Promise<ProfileContext | null> {
  const { data, error: profileError } = await companyOs
    .from("coaching_profiles")
    .select(
      "id, coach_id, retention_root, private_profile_markdown, cadence_days, recap_language, " +
        "how_best_hours_md, how_feedback_md, how_quiet_md, how_curious_md, " +
        "team_members:team_members!team_member_id(people:people!person_id(full_name, preferred_name), " +
        "positions:positions!position_id(title))",
    )
    .eq("id", profileId)
    .maybeSingle();
  if (profileError) console.error("[coaching-ai] coaching_profiles", profileError);
  if (!data) return null;
  const r = data as unknown as Record<string, unknown>;
  const tm = one(r.team_members as Record<string, unknown> | Record<string, unknown>[] | null);
  const person = one(
    (tm?.people ?? null) as { full_name: string | null; preferred_name: string | null } | Array<{
      full_name: string | null;
      preferred_name: string | null;
    }> | null,
  );
  const pos = one((tm?.positions ?? null) as { title: string | null } | { title: string | null }[] | null);
  return {
    profileId,
    coachId: r.coach_id as string,
    memberName: person?.preferred_name || person?.full_name || "the team member",
    positionTitle: pos?.title ?? null,
    retentionRoot: (r.retention_root as string | null) ?? null,
    privateProfileMarkdown: (r.private_profile_markdown as string | null) ?? null,
    howIWork: toHowIWork(r),
    cadenceDays: (r.cadence_days as number) ?? 14,
    recapLanguage: (r.recap_language as RecapLanguage | null) ?? null,
  };
}

// FAST goals with their 8 Edges ladder (the key result each hangs off).
export async function loadGoalsBlock(profileId: string): Promise<string> {
  const [{ data }, edges] = await Promise.all([
    companyOs
      .from("goals")
      .select("title, status, quarter_label, objective_id, key_result_id")
      .eq("coaching_profile_id", profileId)
      .in("status", ["active", "draft"])
      .order("sort_order"),
    getEdgesLadderOptions(),
  ]);
  const rows = (data ?? []) as Array<{
    title: string;
    status: string;
    quarter_label: string | null;
    objective_id: string | null;
    key_result_id: string | null;
  }>;
  if (rows.length === 0) return "(no FAST goals set yet)";
  return rows
    .map((g) => {
      let ladder = "";
      if (g.key_result_id) {
        const k = edges.keyResults.find((x) => x.id === g.key_result_id);
        if (k) ladder = `, ladders to KR: ${k.label}`;
      } else if (g.objective_id) {
        const o = edges.objectives.find((x) => x.id === g.objective_id);
        if (o) ladder = `, ladders to objective: ${o.label}`;
      }
      return `- [${g.status}${g.quarter_label ? `, ${g.quarter_label}` : ""}] ${g.title}${ladder}`;
    })
    .join("\n");
}

export async function loadPrioritiesBlock(profileId: string): Promise<string> {
  const { data, error: prioritiesError } = await companyOs.from("coaching_priorities").select("title, detail_markdown").eq("coaching_profile_id", profileId).eq("status", "active").order("sort_order");
  if (prioritiesError) console.error("[coaching-ai] coaching_priorities", prioritiesError);
  const rows = (data ?? []) as Array<{ title: string; detail_markdown: string | null }>;
  if (rows.length === 0) return "(no standing priorities)";
  return rows.map((p) => `- ${p.title}${p.detail_markdown ? `, ${p.detail_markdown}` : ""}`).join("\n");
}

// The structured OCEAN read — coach tier, so unpublished rows count too.
export async function loadOceanBlock(profileId: string): Promise<string> {
  const { data, error: oceanError } = await companyOs
    .from("coaching_ocean_profiles")
    .select(
      "openness_rating, openness_evidence, conscientiousness_rating, conscientiousness_evidence, " +
        "extraversion_rating, extraversion_evidence, agreeableness_rating, agreeableness_evidence, " +
        "neuroticism_rating, neuroticism_evidence, snapshot_markdown",
    )
    .eq("coaching_profile_id", profileId)
    .maybeSingle();
  if (oceanError) console.error("[coaching-ai] coaching_ocean_profiles", oceanError);
  if (!data) return "(no OCEAN read on file)";
  const r = data as unknown as Record<string, string | null>;
  const dim = (label: string, key: string) =>
    r[`${key}_rating`] ? `- ${label}: ${r[`${key}_rating`]}${r[`${key}_evidence`] ? `, ${r[`${key}_evidence`]}` : ""}` : null;
  return [
    dim("Openness", "openness"),
    dim("Conscientiousness", "conscientiousness"),
    dim("Extraversion", "extraversion"),
    dim("Agreeableness", "agreeableness"),
    dim("Neuroticism", "neuroticism"),
    r.snapshot_markdown ? `\nSnapshot: ${clip(r.snapshot_markdown, 2000)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

// Recent C/M/D mode splits, newest first — the coach's own trajectory.
export async function loadModeHistoryBlock(profileId: string): Promise<string> {
  const { data, error: modeError } = await companyOs.from("coaching_one_on_ones").select("held_on, mode_coach_pct, mode_mentor_pct, mode_direct_pct").eq("coaching_profile_id", profileId).eq("status", "held").is("archived_at", null).not("mode_coach_pct", "is", null).order("held_on", { ascending: false }).limit(6);
  if (modeError) console.error("[coaching-ai] coaching_one_on_ones", modeError);
  const rows = (data ?? []) as Array<{
    held_on: string;
    mode_coach_pct: number;
    mode_mentor_pct: number;
    mode_direct_pct: number;
  }>;
  if (rows.length === 0) return "(no mode splits logged yet; target is 80 coach / 15 mentor / 5 direct)";
  return (
    rows.map((m) => `- ${m.held_on}: ${m.mode_coach_pct} coach / ${m.mode_mentor_pct} mentor / ${m.mode_direct_pct} direct`).join("\n") +
    "\nTarget: 80 coach / 15 mentor / 5 direct."
  );
}

// The coach's context documents: their own rows plus company-wide (null coach).
export async function loadCoachDocs(coachId: string): Promise<string> {
  const { data, error: docsError } = await companyOs
    .from("coaching_context")
    .select("coach_id, kind, title, markdown")
    .or(`coach_id.eq.${coachId},coach_id.is.null`)
    .order("kind", { ascending: true });
  if (docsError) console.error("[coaching-ai] coaching_context", docsError);
  const docs = (data ?? []) as Array<{ kind: string; title: string; markdown: string }>;
  if (docs.length === 0) return "(no coaching context documents on file)";
  return docs
    .map((d) => `<doc kind="${d.kind}" title="${d.title}">\n${clip(d.markdown, MAX_DOC_CHARS)}\n</doc>`)
    .join("\n\n");
}

// Recent held meetings, newest first (private summaries — coach-tier callers only).
export async function loadRecentSummaries(profileId: string, limit: number): Promise<string> {
  const { data, error: summariesError } = await companyOs
    .from("coaching_one_on_ones")
    .select("held_on, summary_markdown")
    .eq("coaching_profile_id", profileId)
    .eq("status", "held")
    .is("archived_at", null)
    .not("summary_markdown", "is", null)
    .order("held_on", { ascending: false })
    .limit(limit);
  if (summariesError) console.error("[coaching-ai] coaching_one_on_ones", summariesError);
  const rows = (data ?? []) as Array<{ held_on: string; summary_markdown: string }>;
  if (rows.length === 0) return "(no prior meeting summaries on file)";
  return rows
    .map((m) => `<meeting held_on="${m.held_on}">\n${clip(m.summary_markdown, MAX_DOC_CHARS)}\n</meeting>`)
    .join("\n\n");
}

// The last recap the member was shown: what both people already know was
// covered, which is the only prior-meeting context the ten-bullet prep needs.
// The private summaries stay out of the prep on purpose (K.4).
export async function loadLastSharedRecap(profileId: string): Promise<string> {
  const { data, error: recapError } = await companyOs
    .from("coaching_one_on_ones")
    .select("held_on, shared_summary_markdown")
    .eq("coaching_profile_id", profileId)
    .eq("status", "held")
    .is("archived_at", null)
    .not("shared_published_at", "is", null)
    .order("held_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recapError) console.error("[coaching-ai] coaching_one_on_ones", recapError);
  const row = data as { held_on: string; shared_summary_markdown: string | null } | null;
  if (!row?.shared_summary_markdown) return "(no published recap yet)";
  return `<recap held_on="${row.held_on}">\n${clip(row.shared_summary_markdown, MAX_DOC_CHARS)}\n</recap>`;
}

export async function loadOpenCommitments(profileId: string): Promise<string> {
  // Also pull the last held 1-1 so we can flag which commitments were carried
  // over from before it (still open across a whole cycle) and which are overdue.
  const [{ data }, { data: lastHeld }] = await Promise.all([
    companyOs
      .from("coaching_commitments")
      .select("title, owner, due_on, status, status_note, created_at")
      .eq("coaching_profile_id", profileId)
      .in("status", OPEN_COMMITMENT_STATUSES)
      .order("created_at", { ascending: true }),
    companyOs
      .from("coaching_one_on_ones")
      .select("held_on")
      .eq("coaching_profile_id", profileId)
      .eq("status", "held")
      .is("archived_at", null)
      .order("held_on", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const rows = (data ?? []) as Array<{
    title: string;
    owner: string;
    due_on: string | null;
    status: string;
    status_note: string | null;
    created_at: string | null;
  }>;
  if (rows.length === 0) return "(no open commitments)";
  const lastHeldOn = (lastHeld as { held_on: string } | null)?.held_on ?? null;
  const today = saigonToday();
  return rows
    .map((c) => {
      const flags: string[] = [];
      if (lastHeldOn && c.created_at && c.created_at.slice(0, 10) < lastHeldOn)
        flags.push("carried over from a prior 1-1");
      if (c.due_on && c.due_on < today) flags.push("OVERDUE");
      const flagStr = flags.length ? ` [${flags.join(", ")}]` : "";
      return `- [${c.status}] (${c.owner}) ${c.title}${c.due_on ? `, due ${c.due_on}` : ""}${flagStr}${
        c.status_note ? `, latest note: ${c.status_note}` : ""
      }`;
    })
    .join("\n");
}

// The member's half of the agenda: what they asked to cover next time.
export async function loadTalkingPoints(profileId: string): Promise<string> {
  const { data, error: talkingError } = await companyOs.from("coaching_talking_points").select("body").eq("coaching_profile_id", profileId).is("addressed_at", null).order("created_at", { ascending: true });
  if (talkingError) console.error("[coaching-ai] coaching_talking_points", talkingError);
  const rows = (data ?? []) as Array<{ body: string }>;
  if (rows.length === 0) return "(none raised)";
  return rows.map((t) => `- ${t.body}`).join("\n");
}

export function personBlock(p: ProfileContext): string {
  return [
    `Name: ${p.memberName}`,
    p.positionTitle ? `Role: ${p.positionTitle}` : null,
    p.retentionRoot
      ? `Loose engagement root (embeddedness read): ${p.retentionRoot}${p.retentionRoot === "watching" ? " (no confident read yet)" : ""}`
      : null,
    p.privateProfileMarkdown
      ? `\n<coaching-reads>\n${clip(p.privateProfileMarkdown, MAX_DOC_CHARS)}\n</coaching-reads>`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

// Trend-report context (moved from ai.ts on 2026-09-16, K.5).
// Full ledger (open and closed) for follow-through analysis.
export async function loadAllCommitmentsBlock(profileId: string): Promise<string> {
  const { data, error: ledgerError } = await companyOs
    .from("coaching_commitments")
    .select("title, owner, due_on, status, status_note, created_at, closed_at")
    .eq("coaching_profile_id", profileId)
    .order("created_at", { ascending: true });
  if (ledgerError) console.error("[coaching-ai] coaching_commitments", ledgerError);
  const rows = (data ?? []) as Array<{
    title: string;
    owner: string;
    due_on: string | null;
    status: string;
    status_note: string | null;
    created_at: string;
    closed_at: string | null;
  }>;
  if (rows.length === 0) return "(no commitments recorded)";
  return rows
    .map(
      (c) =>
        `- [${c.status}] (${c.owner}, made ${c.created_at.slice(0, 10)}${
          c.closed_at ? `, closed ${c.closed_at.slice(0, 10)}` : ""
        }) ${c.title}${c.status_note ? `, note: ${c.status_note}` : ""}`,
    )
    .join("\n");
}

export async function loadPriorTrend(profileId: string, period: string): Promise<string> {
  const { data, error: trendError } = await companyOs
    .from("coaching_trends")
    .select("period, report_markdown")
    .eq("coaching_profile_id", profileId)
    .lt("period", period)
    .not("report_markdown", "is", null)
    .order("period", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (trendError) console.error("[coaching-ai] coaching_trends", trendError);
  const t = data as { period: string; report_markdown: string } | null;
  return t ? `<trend period="${t.period}">\n${clip(t.report_markdown, MAX_DOC_CHARS)}\n</trend>` : "(none)";
}

export async function loadCheckinsBlock(profileId: string, monthStart: string): Promise<string> {
  const { data, error: checkinsError } = await companyOs
    .from("coaching_checkins")
    .select("sent_at, responded_at")
    .eq("coaching_profile_id", profileId)
    .gte("sent_at", monthStart)
    .order("sent_at", { ascending: true });
  if (checkinsError) console.error("[coaching-ai] coaching_checkins", checkinsError);
  const rows = (data ?? []) as Array<{ sent_at: string; responded_at: string | null }>;
  if (rows.length === 0) return "(no check-ins this month)";
  return rows
    .map((c) => `- sent ${c.sent_at.slice(0, 10)}, ${c.responded_at ? "responded" : "no response"}`)
    .join("\n");
}

// The "Recap language" line the summariser is handed. The coach's pinned value
// wins; null hands the choice to the model, which follows the language the
// member themselves spoke most of the meeting in (K.12).
export function recapLanguageLine(p: ProfileContext): string {
  if (p.recapLanguage === "vi") return "Vietnamese (pinned on this member's profile).";
  if (p.recapLanguage === "en") return "English (pinned on this member's profile).";
  return "follow the transcript (write the shared tier in whichever language the member spoke most).";
}

// The transcript a 1-1 row carries. It lives on the linked meeting
// (call_transcripts) and nowhere else since K.11 dropped the legacy
// coaching_one_on_ones.transcript mirror.
export type TranscriptCarrier = {
  linked_meeting?:
    | { call_transcripts?: { transcript: string | null }[] | { transcript: string | null } | null }
    | { call_transcripts?: unknown }[]
    | null;
};

export function transcriptOf(m: TranscriptCarrier): string | null {
  const lm = Array.isArray(m.linked_meeting) ? m.linked_meeting[0] : m.linked_meeting;
  const ct = lm?.call_transcripts as
    | { transcript: string | null }[]
    | { transcript: string | null }
    | null
    | undefined;
  return (Array.isArray(ct) ? ct[0]?.transcript : ct?.transcript) ?? null;
}

// The identity of a transcript, so a re-run on unchanged text can skip the
// model call it would otherwise repeat (K.12).
export function transcriptHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * "How I work" as a prompt block (L.3).
 *
 * Member-authored standing context, which is why it is in the prep at all while
 * the coach's own standing documents are not: the prep is built from what the
 * member said and what changed, and this is the member speaking.
 */
export function howIWorkBlock(h: HowIWork): string {
  const lines = HOW_I_WORK.filter((p) => h[p.key]?.trim()).map((p) => `- ${p.label}: ${h[p.key]}`);
  return lines.length > 0 ? lines.join("\n") : "(they have not written this yet)";
}
