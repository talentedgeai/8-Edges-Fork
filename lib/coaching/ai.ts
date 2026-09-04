// Team Coaching Cycle AI generators (docs/plans/2026-07-25-team-coaching-cycle.md).
// Four generators for the biweekly loop: prep before the meeting, the two-tier
// summary + commitment extraction after it, the mid-cycle check-in nudge, and
// the monthly trend report. Same shape as lib/ai/idea-plan.ts: fail-soft
// (ai_error on the row, never throws to the caller), structured output where
// the result is written to more than one field.
//
// AUTHORIZATION IS THE CALLER'S JOB. Callers are coach-gated server actions
// (which asserted profile/meeting ownership via lib/coaching/data.ts) and the
// bearer-authed cron. Everything here runs on the service-role client.
//
// The coach's voice comes from coaching_context: the foundation documents
// (leadership brand, coaching profile, EQ guide, communication style),
// company context, and company goals, loaded per coach (coach_id = the
// profile's coach, plus company-wide rows where coach_id is null).

import type Anthropic from "@anthropic-ai/sdk";
import { anthropicIfConfigured } from "@/lib/ai/client";
import { modelFor } from "@/lib/ai/models";
import { companyOs } from "@/lib/supabase";
import { OPEN_COMMITMENT_STATUSES, getEdgesLadderOptions, saigonToday } from "@/lib/coaching/data";
import { readTextOutput } from "@/lib/ai/response";
import { one } from "@/lib/embedded";

const MODEL = modelFor("coaching-text", "standard");

// Input clamps: keep any one document from flooding the context window.
const MAX_DOC_CHARS = 20_000;
const MAX_TRANSCRIPT_CHARS = 150_000;

type Ok = { ok: true };
type Err = { ok: false; error: string };

const clip = (s: string, max: number): string =>
  s.length > max ? `${s.slice(0, max)}\n\n[...truncated]` : s;

// ---- context assembly -------------------------------------------------------

type ProfileContext = {
  profileId: string;
  coachId: string;
  memberName: string;
  positionTitle: string | null;
  retentionRoot: string | null;
  privateProfileMarkdown: string | null;
  cadenceDays: number;
};

async function loadProfileContext(profileId: string): Promise<ProfileContext | null> {
  const { data } = await companyOs
    .from("coaching_profiles")
    .select(
      "id, coach_id, retention_root, private_profile_markdown, cadence_days, " +
        "team_members:team_members!team_member_id(people:people!person_id(full_name, preferred_name), " +
        "positions:positions!position_id(title))",
    )
    .eq("id", profileId)
    .maybeSingle();
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
    cadenceDays: (r.cadence_days as number) ?? 14,
  };
}

// FAST goals with their 8 Edges ladder (the key result each hangs off).
async function loadGoalsBlock(profileId: string): Promise<string> {
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

async function loadPrioritiesBlock(profileId: string): Promise<string> {
  const { data } = await companyOs
    .from("coaching_priorities")
    .select("title, detail_markdown")
    .eq("coaching_profile_id", profileId)
    .eq("status", "active")
    .order("sort_order");
  const rows = (data ?? []) as Array<{ title: string; detail_markdown: string | null }>;
  if (rows.length === 0) return "(no standing priorities)";
  return rows.map((p) => `- ${p.title}${p.detail_markdown ? `, ${p.detail_markdown}` : ""}`).join("\n");
}

// The structured OCEAN read — coach tier, so unpublished rows count too.
async function loadOceanBlock(profileId: string): Promise<string> {
  const { data } = await companyOs
    .from("coaching_ocean_profiles")
    .select(
      "openness_rating, openness_evidence, conscientiousness_rating, conscientiousness_evidence, " +
        "extraversion_rating, extraversion_evidence, agreeableness_rating, agreeableness_evidence, " +
        "neuroticism_rating, neuroticism_evidence, snapshot_markdown",
    )
    .eq("coaching_profile_id", profileId)
    .maybeSingle();
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
async function loadModeHistoryBlock(profileId: string): Promise<string> {
  const { data } = await companyOs
    .from("coaching_one_on_ones")
    .select("held_on, mode_coach_pct, mode_mentor_pct, mode_direct_pct")
    .eq("coaching_profile_id", profileId)
    .eq("status", "held")
    .is("archived_at", null)
    .not("mode_coach_pct", "is", null)
    .order("held_on", { ascending: false })
    .limit(6);
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
async function loadCoachDocs(coachId: string): Promise<string> {
  const { data } = await companyOs
    .from("coaching_context")
    .select("coach_id, kind, title, markdown")
    .or(`coach_id.eq.${coachId},coach_id.is.null`)
    .order("kind", { ascending: true });
  const docs = (data ?? []) as Array<{ kind: string; title: string; markdown: string }>;
  if (docs.length === 0) return "(no coaching context documents on file)";
  return docs
    .map((d) => `<doc kind="${d.kind}" title="${d.title}">\n${clip(d.markdown, MAX_DOC_CHARS)}\n</doc>`)
    .join("\n\n");
}

// Recent held meetings, newest first (private summaries — coach-tier callers only).
async function loadRecentSummaries(profileId: string, limit: number): Promise<string> {
  const { data } = await companyOs
    .from("coaching_one_on_ones")
    .select("held_on, summary_markdown")
    .eq("coaching_profile_id", profileId)
    .eq("status", "held")
    .is("archived_at", null)
    .not("summary_markdown", "is", null)
    .order("held_on", { ascending: false })
    .limit(limit);
  const rows = (data ?? []) as Array<{ held_on: string; summary_markdown: string }>;
  if (rows.length === 0) return "(no prior meeting summaries on file)";
  return rows
    .map((m) => `<meeting held_on="${m.held_on}">\n${clip(m.summary_markdown, MAX_DOC_CHARS)}\n</meeting>`)
    .join("\n\n");
}

async function loadOpenCommitments(profileId: string): Promise<string> {
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
async function loadTalkingPoints(profileId: string): Promise<string> {
  const { data } = await companyOs
    .from("coaching_talking_points")
    .select("body")
    .eq("coaching_profile_id", profileId)
    .is("addressed_at", null)
    .order("created_at", { ascending: true });
  const rows = (data ?? []) as Array<{ body: string }>;
  if (rows.length === 0) return "(none raised)";
  return rows.map((t) => `- ${t.body}`).join("\n");
}

function personBlock(p: ProfileContext): string {
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

const VOICE_RULES = `Ground rules:
- Never use em dashes anywhere in your output. Use commas, colons, periods, or parentheses instead.
- Write in the coach's voice, guided by the communication style and coaching profile in the context documents. Warm, direct, growth-oriented, never corporate, never clinical.
- They are COMMITMENTS, never "tasks" or "action items".
- Never invent information. If notes are missing, work with what exists and say so.
- Handle personal or emotional context with care, per the emotional intelligence guide.`;

function client(): Anthropic | null {
  return anthropicIfConfigured();
}

async function textCompletion(system: string, user: string, maxTokens: number): Promise<string> {
  const anthropic = client();
  if (!anthropic) throw new Error("ANTHROPIC_API_KEY is not configured.");
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    output_config: { effort: "medium" },
    system,
    messages: [{ role: "user", content: user }],
  });
  const out = readTextOutput("coaching-text", MODEL, response);
  if (!out.ok) throw new Error(out.error);
  return out.text.trim();
}

// ---- 1) prep (Friday before the meeting) ------------------------------------

const PREP_SYSTEM = `You prepare a leader for a biweekly 1-1 coaching conversation with one of their people. You write the prep the leader skims in two minutes before walking into the room.

Produce Markdown with exactly these ## sections, in order:
## Recommended mode: the coach/mentor/direct split to aim for in this meeting (target 80/15/5), one sentence on why, grounded in the coach's recent mode history and this person's OCEAN wiring.
## Focus areas: 2-3 topics to prioritize, one-sentence rationale each. FAST means Frequent: the first focus is always their FAST goal progress, against the key result each goal ladders to. If the person raised talking points for this 1-1, treat them as their agenda: work them into the focus areas and name them explicitly.
## Coaching questions: 3-5 open-ended GROW questions tailored to this person right now, led by the goal question. They must reflect the coaching profile and the OCEAN read and sound like the coach, not a template.
## Context reminders: bullets: status of previous commitments, standing priorities to touch, personal context to handle with care, upcoming milestones, relevant company context.
## Retention check: one specific thing to listen for, tied to the person's current loose engagement root. If the root is "watching", the check is about forming a first confident read.
## One question to avoid: the single question or move most likely to backfire with this person's wiring, and what to do instead.
## Open commitments: carry forward each open commitment with whatever status is known. Lead with any flagged "carried over from a prior 1-1" or "OVERDUE": name them first and suggest how to close the loop, since they have already survived a cycle.

${VOICE_RULES}`;

export async function generatePrep(meetingId: string): Promise<Ok | Err> {
  const fail = async (error: string): Promise<Err> => {
    await companyOs
      .from("coaching_one_on_ones")
      .update({ ai_error: error.slice(0, 500), updated_at: new Date().toISOString() })
      .eq("id", meetingId);
    return { ok: false, error };
  };
  try {
    const { data: meeting } = await companyOs
      .from("coaching_one_on_ones")
      .select("id, coaching_profile_id, held_on")
      .eq("id", meetingId)
      .is("archived_at", null)
      .maybeSingle();
    if (!meeting) return { ok: false, error: "Meeting not found." };
    const m = meeting as { coaching_profile_id: string; held_on: string };

    const profile = await loadProfileContext(m.coaching_profile_id);
    if (!profile) return { ok: false, error: "Profile not found." };
    const [docs, summaries, commitments, talkingPoints, goals, priorities, oceanBlock, modeHistory] =
      await Promise.all([
        loadCoachDocs(profile.coachId),
        loadRecentSummaries(m.coaching_profile_id, 2),
        loadOpenCommitments(m.coaching_profile_id),
        loadTalkingPoints(m.coaching_profile_id),
        loadGoalsBlock(m.coaching_profile_id),
        loadPrioritiesBlock(m.coaching_profile_id),
        loadOceanBlock(m.coaching_profile_id),
        loadModeHistoryBlock(m.coaching_profile_id),
      ]);

    const prep = await textCompletion(
      PREP_SYSTEM,
      `# Coaching context documents\n${docs}\n\n# The person\n${personBlock(profile)}\n\n# OCEAN read\n${oceanBlock}\n\n# FAST goals\n${goals}\n\n# Standing priorities\n${priorities}\n\n# The coach's recent mode splits\n${modeHistory}\n\n# Last meetings\n${summaries}\n\n# Open commitments\n${commitments}\n\n# Talking points the person raised for this 1-1\n${talkingPoints}\n\n# The upcoming 1-1\nScheduled for ${m.held_on} (today is ${saigonToday()}). Write the prep.`,
      4000,
    );

    const { error } = await companyOs
      .from("coaching_one_on_ones")
      .update({
        prep_markdown: prep,
        prep_generated_at: new Date().toISOString(),
        ai_model: MODEL,
        ai_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", meetingId);
    if (error) return fail(error.message);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[coaching-ai] prep ${meetingId} failed:`, msg);
    return fail(msg);
  }
}

// ---- 2) summary + commitments (right after the meeting) ---------------------

const SUMMARY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary_markdown", "shared_summary_markdown", "commitments", "mode_split_estimate"],
  properties: {
    summary_markdown: {
      type: "string",
      description:
        "The PRIVATE summary for the coach's eyes only. Markdown with ## sections in order: 'Meeting summary' (3-5 paragraphs of substance, decisions, concerns, energy and tone); 'Goal progress' (what the transcript shows about each FAST goal: moved, stalled, or blocked, with the evidence); 'Commitments' (each commitment, its owner, timeline, and any company-goal connection); 'Emotional and personal notes' (anything personal or emotionally significant, handled with care, this informs future prep, it is not a report; omit the section if nothing came up); 'Connections' (links to previous meetings, FAST goals, company goals, and company context).",
    },
    mode_split_estimate: {
      type: "object",
      additionalProperties: false,
      required: ["coach", "mentor", "direct"],
      description:
        "Estimate of how the leader's talk time split across the three modes, as integer percentages summing to 100. coach = asking questions and drawing the person out; mentor = teaching from experience; direct = giving instructions or answers. Judge from who talks, who proposes, and who decides in the transcript.",
      // The structured-output API rejects minimum/maximum on integers, so
      // range + sum are validated in code after parsing.
      properties: {
        coach: { type: "integer" },
        mentor: { type: "integer" },
        direct: { type: "integer" },
      },
    },
    shared_summary_markdown: {
      type: "string",
      description:
        "The recap SHARED WITH THE TEAM MEMBER. Markdown with ## sections: 'What we covered' (the discussion, decisions, and wins, honest but constructive, written TO the team member in second person); 'Commitments' (the same commitments, phrased as what each side agreed to). NO private coaching observations, NO emotional read-outs, NO assessments of the person, only what both people in the room already know was said.",
    },
    commitments: {
      type: "array",
      description:
        "Every specific commitment made in the meeting by either side. Empty array if none were made.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "owner"],
        properties: {
          title: { type: "string", description: "The commitment, one sentence, concrete." },
          owner: {
            type: "string",
            enum: ["coach", "member"],
            description: "'member' if the team member owns it, 'coach' if the leader does.",
          },
          due_on: {
            type: "string",
            description: "YYYY-MM-DD deadline if one was stated; omit otherwise.",
          },
        },
      },
    },
  },
} as const;

const SUMMARY_SYSTEM = `You turn a 1-1 coaching meeting transcript into two summaries and a commitment log.

The private summary is for the coach alone and captures everything, including emotional undercurrents. The shared summary goes to the team member, it must contain nothing the member would be surprised or hurt to read, only the substance both people already voiced in the room.

${VOICE_RULES}`;

export async function summarizeMeeting(meetingId: string): Promise<Ok | Err> {
  const fail = async (error: string): Promise<Err> => {
    await companyOs
      .from("coaching_one_on_ones")
      .update({ ai_error: error.slice(0, 500), updated_at: new Date().toISOString() })
      .eq("id", meetingId);
    return { ok: false, error };
  };
  try {
    const anthropic = client();
    if (!anthropic) return fail("ANTHROPIC_API_KEY is not configured.");

    const { data: meeting } = await companyOs
      .from("coaching_one_on_ones")
      .select(
        "id, coaching_profile_id, held_on, transcript, prep_markdown, " +
          "linked_meeting:meetings!meeting_id(call_transcripts(transcript))",
      )
      .eq("id", meetingId)
      .is("archived_at", null)
      .maybeSingle();
    if (!meeting) return { ok: false, error: "Meeting not found." };
    const m = meeting as unknown as {
      coaching_profile_id: string;
      held_on: string;
      transcript: string | null;
      prep_markdown: string | null;
      linked_meeting?:
        | { call_transcripts?: { transcript: string | null }[] | { transcript: string | null } | null }
        | { call_transcripts?: unknown }[]
        | null;
    };
    // Transcript lives on the linked meeting (call_transcripts); the coaching
    // column is a legacy fallback for any not-yet-migrated row.
    const lm = Array.isArray(m.linked_meeting) ? m.linked_meeting[0] : m.linked_meeting;
    const lmCt = lm?.call_transcripts as
      | { transcript: string | null }[]
      | { transcript: string | null }
      | null
      | undefined;
    const transcript =
      (Array.isArray(lmCt) ? lmCt[0]?.transcript : lmCt?.transcript) ?? m.transcript ?? null;
    if (!transcript?.trim()) return { ok: false, error: "No transcript on this meeting yet." };

    const profile = await loadProfileContext(m.coaching_profile_id);
    if (!profile) return { ok: false, error: "Profile not found." };
    const [docs, commitments, goals] = await Promise.all([
      loadCoachDocs(profile.coachId),
      loadOpenCommitments(m.coaching_profile_id),
      loadGoalsBlock(m.coaching_profile_id),
    ]);

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: SUMMARY_SYSTEM,
      output_config: { effort: "medium", format: { type: "json_schema", schema: SUMMARY_SCHEMA } },
      messages: [
        {
          role: "user",
          content: `# Coaching context documents\n${docs}\n\n# The person\n${personBlock(profile)}\n\n# FAST goals\n${goals}\n\n# Open commitments going into this meeting\n${commitments}\n\n# The prep for this meeting\n${m.prep_markdown ? clip(m.prep_markdown, MAX_DOC_CHARS) : "(none)"}\n\n# Transcript of the 1-1 on ${m.held_on}\n${clip(transcript, MAX_TRANSCRIPT_CHARS)}\n\nWrite the private summary, the shared recap, the mode split estimate, and extract every commitment.`,
        },
      ],
    });
    const out = readTextOutput("coaching-summary", MODEL, response, "The model declined this transcript.");
    if (!out.ok) return fail(out.error);
    const parsed = JSON.parse(out.text) as {
      summary_markdown: string;
      shared_summary_markdown: string;
      commitments: Array<{ title: string; owner: "coach" | "member"; due_on?: string }>;
      mode_split_estimate?: { coach: number; mentor: number; direct: number };
    };
    if (!parsed.summary_markdown?.trim() || !parsed.shared_summary_markdown?.trim())
      return fail("Model output was missing a summary tier.");

    // The AI's mode estimate lands only where the coach hasn't logged one —
    // a coach-entered split is never overwritten.
    const est = parsed.mode_split_estimate;
    const modePatch: Record<string, number> = {};
    const inRange = (n: number) => Number.isInteger(n) && n >= 0 && n <= 100;
    if (est && inRange(est.coach) && inRange(est.mentor) && inRange(est.direct) && est.coach + est.mentor + est.direct === 100) {
      const { data: current } = await companyOs
        .from("coaching_one_on_ones")
        .select("mode_coach_pct")
        .eq("id", meetingId)
        .maybeSingle();
      if ((current as { mode_coach_pct: number | null } | null)?.mode_coach_pct == null) {
        modePatch.mode_coach_pct = est.coach;
        modePatch.mode_mentor_pct = est.mentor;
        modePatch.mode_direct_pct = est.direct;
      }
    }

    // The shared recap stays a DRAFT (shared_published_at untouched) — the
    // coach reviews and publishes explicitly.
    const { error: upErr } = await companyOs
      .from("coaching_one_on_ones")
      .update({
        summary_markdown: parsed.summary_markdown,
        shared_summary_markdown: parsed.shared_summary_markdown,
        status: "held",
        ai_model: MODEL,
        ai_error: null,
        updated_at: new Date().toISOString(),
        ...modePatch,
      })
      .eq("id", meetingId);
    if (upErr) return fail(upErr.message);

    // Insert extracted commitments once per meeting: re-running the summary
    // must not duplicate the ledger.
    const { data: existing } = await companyOs
      .from("coaching_commitments")
      .select("id")
      .eq("one_on_one_id", meetingId)
      .limit(1);
    if ((existing ?? []).length === 0 && parsed.commitments.length > 0) {
      const rows = parsed.commitments
        .filter((c) => c.title?.trim())
        .slice(0, 20)
        .map((c) => ({
          coaching_profile_id: m.coaching_profile_id,
          one_on_one_id: meetingId,
          title: c.title.trim().slice(0, 500),
          owner: c.owner === "coach" ? "coach" : "member",
          due_on: c.due_on && /^\d{4}-\d{2}-\d{2}$/.test(c.due_on) ? c.due_on : null,
        }));
      if (rows.length > 0) {
        const { error } = await companyOs.from("coaching_commitments").insert(rows);
        if (error) console.error("[coaching-ai] commitment insert failed:", error.message);
      }
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[coaching-ai] summary ${meetingId} failed:`, msg);
    return fail(msg);
  }
}

// ---- 3) mid-cycle check-in message ------------------------------------------
// Returns the message markdown instead of writing it: the cron records it on
// coaching_checkins and sends the email in one place. Falls back to a plain
// template when the model is unavailable — the nudge must still go out.

const CHECKIN_SYSTEM = `You write a short mid-cycle check-in message from a coach to their team member, halfway between biweekly 1-1s.

The message must:
- Open with one line connected to their FAST goal, FAST means Frequent, so the goal is touched every time.
- Reference each open commitment by name and ask for a brief status update on each.
- Feel like a nudge from a coach who pays attention, not a project manager chasing tickets.
- Be brief: a few warm sentences plus the commitment list. Write in second person, to the member.
- End by pointing them to their coaching page to update statuses.

${VOICE_RULES}`;

export async function generateCheckinMessage(
  profileId: string,
): Promise<{ markdown: string; ai: boolean }> {
  const profile = await loadProfileContext(profileId);
  const commitments = await loadOpenCommitments(profileId);
  const fallback = [
    `Quick mid-cycle check-in: how are these coming along?`,
    ``,
    commitments,
    ``,
    `Update each one on your coaching page, even a one-line status helps our next 1-1.`,
  ].join("\n");
  if (!profile) return { markdown: fallback, ai: false };
  try {
    const [docs, goals] = await Promise.all([
      loadCoachDocs(profile.coachId),
      loadGoalsBlock(profileId),
    ]);
    const markdown = await textCompletion(
      CHECKIN_SYSTEM,
      `# Coaching context documents\n${docs}\n\n# The person\n${personBlock(profile)}\n\n# Their FAST goals\n${goals}\n\n# Their open commitments\n${commitments}\n\nWrite the check-in message.`,
      1500,
    );
    return { markdown, ai: true };
  } catch (err) {
    console.error(`[coaching-ai] checkin ${profileId} failed:`, err instanceof Error ? err.message : err);
    return { markdown: fallback, ai: false };
  }
}

// ---- 4) monthly trend report ------------------------------------------------

const TREND_SYSTEM = `You write a coaching trend report about one team member, for their coach's eyes only. You look across their last few 1-1s (two or three), the commitment ledger, and check-ins, and surface what meeting-to-meeting attention misses.

Produce Markdown with exactly these ## sections, in order:
## Growth trajectory: growing, plateauing, or struggling across these 1-1s, with specific evidence.
## Goal progress: each FAST goal against the key result it ladders to: moving, stalled, or blocked, with the member's own measure numbers where the goal carries them.
## Recurring themes: topics and patterns that keep coming up across the meetings.
## Commitment follow-through: completed vs in progress vs dropped, and the pattern in what gets done.
## Mode trajectory: the coach's C/M/D splits across these 1-1s vs the 80/15/5 target: moving the right way or not, and what to change.
## Coaching opportunities: specific things to coach next 1-1 (never generic "develop leadership skills"; name the observed behavior and the move).
## Flags: burnout signals, disengagement, recurring blockers, escalating personal situations, retention-root shifts. Omit the section if there are none.
## Since last trend: better, worse, or flat vs the previous trend report, if one exists.

${VOICE_RULES}`;

export async function generateTrendReport(profileId: string): Promise<Ok | Err> {
  const profile = await loadProfileContext(profileId);
  if (!profile) return { ok: false, error: "Profile not found." };

  // The window is the last 3 held, summarized 1-1s (2 minimum: a trend needs at
  // least two points), NOT a calendar month.
  const { data: recent } = await companyOs
    .from("coaching_one_on_ones")
    .select("held_on, summary_markdown")
    .eq("coaching_profile_id", profileId)
    .eq("status", "held")
    .is("archived_at", null)
    .not("summary_markdown", "is", null)
    .order("held_on", { ascending: false })
    .limit(3);
  const meetings = ((recent ?? []) as Array<{ held_on: string; summary_markdown: string }>).reverse();
  if (meetings.length < 2) return { ok: false, error: "Need at least 2 summarized 1-1s to trend." };

  // Keyed by the latest 1-1's month (the coaching_trends.period CHECK is
  // YYYY-MM); re-running for the same latest 1-1 upserts rather than piling up.
  const period = meetings[meetings.length - 1].held_on.slice(0, 7);
  const stamp = async (patch: Record<string, unknown>): Promise<void> => {
    await companyOs
      .from("coaching_trends")
      .upsert(
        { coaching_profile_id: profileId, period, ...patch },
        { onConflict: "coaching_profile_id,period" },
      );
  };

  try {
    const [docs, commitments, priorTrend, checkins, goals, modeHistory] = await Promise.all([
      loadCoachDocs(profile.coachId),
      loadAllCommitmentsBlock(profileId),
      loadPriorTrend(profileId, period),
      loadCheckinsBlock(profileId, meetings[0].held_on),
      loadGoalsBlock(profileId),
      loadModeHistoryBlock(profileId),
    ]);

    const meetingsBlock = meetings
      .map((m) => `<meeting held_on="${m.held_on}">\n${clip(m.summary_markdown, MAX_DOC_CHARS)}\n</meeting>`)
      .join("\n\n");

    const report = await textCompletion(
      TREND_SYSTEM,
      `# Coaching context documents\n${docs}\n\n# The person\n${personBlock(profile)}\n\n# FAST goals with ladders\n${goals}\n\n# Mode split history\n${modeHistory}\n\n# The last ${meetings.length} 1-1 summaries\n${meetingsBlock}\n\n# The commitment ledger\n${commitments}\n\n# Recent check-ins\n${checkins}\n\n# Prior trend report\n${priorTrend}\n\nWrite the trend report across these last ${meetings.length} 1-1s.`,
      8000,
    );

    await stamp({ report_markdown: report, ai_model: MODEL, ai_error: null });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[coaching-ai] trend ${profileId} failed:`, msg);
    await stamp({ ai_error: msg.slice(0, 500) });
    return { ok: false, error: msg };
  }
}

// Full ledger (open and closed) for follow-through analysis.
async function loadAllCommitmentsBlock(profileId: string): Promise<string> {
  const { data } = await companyOs
    .from("coaching_commitments")
    .select("title, owner, due_on, status, status_note, created_at, closed_at")
    .eq("coaching_profile_id", profileId)
    .order("created_at", { ascending: true });
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

async function loadPriorTrend(profileId: string, period: string): Promise<string> {
  const { data } = await companyOs
    .from("coaching_trends")
    .select("period, report_markdown")
    .eq("coaching_profile_id", profileId)
    .lt("period", period)
    .not("report_markdown", "is", null)
    .order("period", { ascending: false })
    .limit(1)
    .maybeSingle();
  const t = data as { period: string; report_markdown: string } | null;
  return t ? `<trend period="${t.period}">\n${clip(t.report_markdown, MAX_DOC_CHARS)}\n</trend>` : "(none)";
}

async function loadCheckinsBlock(profileId: string, monthStart: string): Promise<string> {
  const { data } = await companyOs
    .from("coaching_checkins")
    .select("sent_at, responded_at")
    .eq("coaching_profile_id", profileId)
    .gte("sent_at", monthStart)
    .order("sent_at", { ascending: true });
  const rows = (data ?? []) as Array<{ sent_at: string; responded_at: string | null }>;
  if (rows.length === 0) return "(no check-ins this month)";
  return rows
    .map((c) => `- sent ${c.sent_at.slice(0, 10)}, ${c.responded_at ? "responded" : "no response"}`)
    .join("\n");
}
