// Which capabilities a team-hub viewer holds, as a pure function of who they
// are. It lives beside TeamSidebar rather than inside it because the rule
// decides what a colleague can see, and a rule like that should be readable and
// testable on its own rather than inferred from the JSX around it.
//
// Coaching appears only for actors who coach at least one person (a
// coaching_profiles row, not the org "manager" role, dotted-line coaches
// included). Hiring follows the same idea and not the role either: it shows
// only to people who own a requisition, or to admins. "manages" opens the My
// Team group for any of the three, which is why a plain manager sees the group
// without seeing Coaching or Hiring inside it. Every route is gated
// server-side regardless; this only decides what appears in the sidebar.
import type { TeamRole } from "@/kernel/identity/team-auth";

export function capabilitiesOf(
  role: TeamRole,
  isCoach: boolean,
  isHiringManager: boolean,
  hasClients: boolean,
): string[] {
  const held: string[] = [];
  if (isCoach) held.push("coach");
  if (isHiringManager) held.push("hiringManager");
  if (hasClients) held.push("clients");
  if (role === "manager" || isCoach || isHiringManager) held.push("manages");
  return held;
}
