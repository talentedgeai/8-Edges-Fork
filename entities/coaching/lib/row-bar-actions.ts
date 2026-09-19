"use server";

import { refreshBothLists } from "./revalidate";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { coachUndoMarkOneOnOneHeld, getLastRecap } from "./data/row-bar";
import { coachingMarkdownToHtml } from "./markdown";
import type { LastRecapView } from "./row-actions";
import type { Result } from "@/kernel/data/result";

import { parseInput, zId } from "./schemas";
import { z } from "zod";

// What the roster's row-bar actions accept (ticket 13).
const S = { meeting: z.object({ meetingId: zId }), profile: z.object({ profileId: zId }) };

// The two things the roster's action bar does without a page load (K.57).
// They sit beside schedule-actions.ts rather than inside it because they are
// the row bar's own pair — an undo window and a drawer — and because that file
// is the coach's scheduling vocabulary, which neither of these is.
//
// Both start with the guard (CLAUDE.md rule 1) and both re-derive ownership
// server-side afterwards: the browser hands over an id, never a permission.

// Put a 1-1 back the way it was, inside the toast's window. The roster and both
// coaching pages read the same row, so all three are refreshed — the same set
// mark-held refreshes, because this is that write undone.
export async function undoMarkOneOnOneHeld(meetingId: string): Promise<Result> {
  const actor = await requireTeamMember();
  const p = parseInput(S.meeting, { meetingId });
  if (!p.ok) return p;
  const res = await coachUndoMarkOneOnOneHeld(actor, p.data.meetingId);
  if (res.ok) {
    refreshBothLists();
  }
  return res;
}

// The previous recap, rendered, for the row's drawer. The markdown is turned
// into HTML on the server for the same reason every other coaching document is
// (lib/markdown.ts): the body is coach- and AI-authored prose, and the sanitize
// pass belongs on the side of the wire that can be trusted to run it.
export async function lastRecapForRow(
  profileId: string,
): Promise<{ ok: true; recap: LastRecapView } | { ok: false; error: string }> {
  const actor = await requireTeamMember();
  const p = parseInput(S.profile, { profileId });
  if (!p.ok) return p;
  const recap = await getLastRecap(actor, p.data.profileId);
  if (!recap) return { ok: false, error: "No 1-1 has been held yet." };
  const html = recap.markdown ? await coachingMarkdownToHtml(recap.markdown) : null;
  return { ok: true, recap: { heldOn: recap.heldOn, html } };
}
