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
//
// "revenue" is the one capability an admin grants rather than one derived from
// the person's data: it is team_members.permissions, read on the actor.
import type { TeamPermission, TeamRole } from "@/kernel/identity/team-auth";

export function capabilitiesOf(
  role: TeamRole,
  isCoach: boolean,
  isHiringManager: boolean,
  hasClients: boolean,
  permissions: readonly TeamPermission[] = [],
): string[] {
  const held: string[] = [];
  if (isCoach) held.push("coach");
  if (isHiringManager) held.push("hiringManager");
  if (hasClients) held.push("clients");
  if (permissions.includes("revenue")) held.push("revenue");
  if (role === "manager" || isCoach || isHiringManager) held.push("manages");
  return held;
}
