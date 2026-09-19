// The Lark Minutes half of the daily coaching pass: pulling the transcripts
// that recordings left behind, and matching recordings nobody linked to the
// 1-1 they belong to. Split out of cycle.ts because that file is at its
// 400-line cap; the only production caller is still runCoachingCycle.

import { companyOs } from "@/kernel/data/supabase";
import { readCoachingTranscript, saveCoachingTranscript } from "@/entities/coaching/lib/transcript";
import { addDays, diffDays } from "@/kernel/config/dates";
import { summarizeMeeting } from "@/entities/coaching/lib/ai";
import { fetchMinutesTranscript, larkConfigured, listRecentMinutes } from "@/kernel/messaging/lark-api";
import { notifyBoth, type ProfileRow } from "./cycle-shared";

// Counted on the run summary; structurally typed so this module does not have
// to import cycle.ts back and close an import cycle.
type MinutesCounts = {
  transcriptsPulled: number;
  recapsDrafted: number;
  minutesMatched: number;
  minutesUnmatched: number;
  minutesAmbiguous: number;
};

// 0) Lark Minutes sync for one profile: pull transcripts for meetings that
// carry a minutes_token but no transcript yet; for a recent meeting with no
// summary, draft the two-tier recap and tell the coach to review. Historical
// meetings (>14 days) get their transcript stored but are never auto-recapped.
export async function syncMinutesForProfile(
  p: ProfileRow,
  coach: { name: string; email: string | null } | undefined,
  profileLink: string,
  todayISO: string,
  summary: MinutesCounts,
): Promise<void> {
  const { data, error: minutesError } = await companyOs.from("coaching_one_on_ones").select("id, held_on, minutes_token, meeting_id, summary_markdown").eq("coaching_profile_id", p.id).is("archived_at", null).not("minutes_token", "is", null);
  if (minutesError) console.error("[team/coaching-cycle] coaching_one_on_ones", minutesError);
  for (const m of (data ?? []) as Array<{
    id: string;
    held_on: string;
    minutes_token: string;
    meeting_id: string | null;
    summary_markdown: string | null;
  }>) {
    // Skip sessions whose transcript is already in the linked meeting's
    // call_transcripts. This replaces the old `transcript is null` filter,
    // because the text no longer lives on the coaching row at all.
    const existing = await readCoachingTranscript(m.meeting_id);
    if (existing && existing.trim()) continue;
    const transcript = await fetchMinutesTranscript(m.minutes_token);
    if (!transcript) continue;
    const saved = await saveCoachingTranscript(m.id, transcript);
    if (!saved.ok) continue;
    summary.transcriptsPulled += 1;
    const recent = diffDays(m.held_on, todayISO) <= 14;
    if (recent && !m.summary_markdown) {
      const res = await summarizeMeeting(m.id);
      if (res.ok) {
        summary.recapsDrafted += 1;
        await notifyBoth({
          email: coach?.email ?? null,
          subject: `1-1 recap drafted: ${p.memberName} (${m.held_on})`,
          html:
            `<p>The transcript of your 1-1 with <strong>${p.memberName}</strong> on <strong>${m.held_on}</strong> came in from Lark Minutes, and the recap is drafted. Review both tiers and publish the shared one when it reads right.</p>` +
            `<p><a href="${profileLink}">Review the recap</a></p>`,
          larkText: `1-1 recap drafted for ${p.memberName} (${m.held_on}). Review and publish: ${profileLink}`,
          logKind: "recap_drafted",
        });
      }
    }
  }
}

// Auto-detect: match recently recorded Minutes to 1-1 rows that have no token
// yet, by member first name in the title + date within a day. Conservative on
// purpose — no match, no write. Returns silently when the tenant app cannot
// list Minutes (the link-paste flow stays the fallback).
// Exported for its test; the only production caller is runCoachingCycle.
export async function autoDetectMinutes(profiles: ProfileRow[], summary: MinutesCounts): Promise<void> {
  if (!larkConfigured()) return;
  const recent = await listRecentMinutes(4);
  if (recent.length === 0) return;
  for (const minute of recent) {
    const title = (minute.title ?? "").toLowerCase();
    const day = minute.startTime?.slice(0, 10);
    if (!day || !title.includes("1-1")) continue;
    // A first name is not an identity: two active profiles called Minh make
    // the title ambiguous, and writing the token onto either one attaches a
    // transcript to the wrong person. Count it and leave it for the coach's
    // manual attach picker (K.10).
    const matches = profiles.filter((p) => {
      const first = p.memberName.split(/\s+/)[0]?.toLowerCase();
      return first && title.includes(first);
    });
    if (matches.length > 1) {
      summary.minutesAmbiguous += 1;
      continue;
    }
    const match = matches[0];
    if (!match) {
      summary.minutesUnmatched += 1;
      continue;
    }
    const { data: meeting, error: matchError } = await companyOs.from("coaching_one_on_ones").select("id, minutes_token").eq("coaching_profile_id", match.id).gte("held_on", addDays(day, -1)).lte("held_on", addDays(day, 1)).is("archived_at", null).is("minutes_token", null).limit(1).maybeSingle();
    if (matchError) console.error("[team/coaching-cycle] coaching_one_on_ones", matchError);
    const row = meeting as { id: string } | null;
    if (!row) continue;
    const { error } = await companyOs
      .from("coaching_one_on_ones")
      .update({
        minutes_token: minute.token,
        transcript_source: "minutes_auto",
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (!error) summary.minutesMatched += 1;
  }
}
