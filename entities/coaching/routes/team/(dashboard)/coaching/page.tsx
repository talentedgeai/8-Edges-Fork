import { redirect } from "next/navigation";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import {
  canManageRoster,
  getCoachRoster,
  getPracticeFacts,
  getRosterCandidates,
  saigonToday,
} from "@/entities/coaching";
import { CoachRosterView } from "@/entities/coaching/ui/CoachRosterView";

export const metadata = {
  title: "Coaching",
  description: "Your coaching roster: the next 1-1 with each person, and where you can help.",
};

// /team/coaching — the page a coach opens before the week's 1-1s (K.46).
//
// Access is granted by coaching_profiles rows, not the manager role: a
// dotted-line coach sees exactly the people whose profile carries their
// coach_id, and nobody else (getCoachRoster injects the scope). The markup is
// CoachRosterView's; this file is the guard and the two loads, which is all a
// route should be.
export default async function CoachingDashboardPage() {
  const actor = await requireTeamMember();
  const roster = await getCoachRoster(actor);
  const today = saigonToday();
  // The practice tiles are built from the rows that have just been loaded plus
  // two reads of their own, so a tile can never disagree with the rows under it.
  const practice = await getPracticeFacts(roster, today);
  // Managers with an empty roster still land here so they can add their
  // first person; everyone else without a roster has no business on the page.
  const manageable = await canManageRoster(actor);
  if (roster.length === 0 && !manageable) redirect("/team");
  const candidates = manageable ? await getRosterCandidates(actor) : [];

  return (
    <CoachRosterView roster={roster} candidates={candidates} practice={practice} today={today} />
  );
}
