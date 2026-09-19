// The daily pass's half of "a missed 1-1 asks, it does not roll silently"
// (K.36). It lives beside cycle.ts rather than in it because cycle.ts is at
// its 400-line cap, and beside missed.ts rather than in it because missed.ts
// is the pure rule the browser components import for their sentences and must
// never drag the service-role client into a bundle.

import { companyOs } from "@/kernel/data/supabase";
import { missedState } from "@/entities/coaching/lib/missed";
import type { ProfileRow } from "@/entities/coaching/lib/cycle-shared";

// Stamp the booking the profile's next date points at when that date has
// passed, and say whether the roll-forward must wait.
//
// Returns true while the grace window is open, which is what holds
// next_one_on_one_on where it is: the meeting has to still be there for the
// coach to move it or mark it held, and a date that has already jumped a
// fortnight ahead is a meeting nobody can answer for any more. Once the window
// closes the answer is false and the cycle rolls as it always did, because
// nothing may stick in the past.
//
// The stamp is idempotent: a row that already carries missed_at is counted
// once and written once, so a pass that runs twice in a day changes nothing.
export async function missedHold(
  p: ProfileRow,
  todayISO: string,
  // Structurally typed rather than as CoachingRunSummary: cycle.ts imports
  // this function, and naming its type here would close an import cycle.
  summary: { missedStamped: number },
): Promise<boolean> {
  // A paused profile is one the coach asked to be left alone, and a profile
  // with no date has nothing that could have been missed.
  if (p.paused || !p.next_one_on_one_on) return false;
  if (p.next_one_on_one_on >= todayISO) return false;

  const { data, error } = await companyOs
    .from("coaching_one_on_ones")
    .select("id, status, missed_at")
    .eq("coaching_profile_id", p.id)
    .eq("held_on", p.next_one_on_one_on)
    .is("archived_at", null)
    .maybeSingle();
  if (error) {
    console.error("[team/coaching-cycle] coaching_one_on_ones missed", error);
    return false;
  }
  const row = data as { id: string; status: string; missed_at: string | null } | null;
  // No row on that date at all means the cron never booked one — a stale
  // profile date, not a meeting somebody failed to hold. It rolls as before.
  if (!row) return false;

  const state = missedState({
    heldOn: p.next_one_on_one_on,
    status: row.status as "scheduled" | "held" | "skipped",
    todayISO,
  });
  if (state === "upcoming") return false;

  if (!row.missed_at) {
    const { error: stampError } = await companyOs
      .from("coaching_one_on_ones")
      .update({ missed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (stampError) console.error("[team/coaching-cycle] coaching_one_on_ones missed stamp", stampError);
    else summary.missedStamped += 1;
  }
  return state === "missed";
}
