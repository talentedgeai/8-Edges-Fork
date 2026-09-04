// Shared write gate for task boards. A board mutation is allowed for an admin,
// or for a team member who is a member of that board. Non-redirecting: returns
// null when neither holds, so server actions can surface a clean error rather
// than bouncing a team member to /admin/login. This is the security boundary for
// board writes from both /admin/boards and /team/boards.

import { getAdminUser } from "@/lib/admin-auth";
import { getTeamActor } from "@/lib/team-auth";
import { companyOs } from "@/lib/supabase";

export type BoardActor = { label: string; personId: string | null; isAdmin: boolean };

// Membership check shared by the write gate below and the /team read gates.
// True for an explicit board_members row, or an active staff assignment to the
// board's client company: assigning staff to a client automatically puts them
// on that client's boards, and ending the assignment takes them off. Manual
// board_members rows still work for extra people and non-client boards.
export async function isBoardMember(boardId: string, personId: string, teamMemberId: string): Promise<boolean> {
  const [memRes, boardRes] = await Promise.all([
    companyOs.from("board_members").select("id").eq("board_id", boardId).eq("person_id", personId).maybeSingle(),
    companyOs.from("boards").select("client_company_id").eq("id", boardId).maybeSingle(),
  ]);
  if (memRes.data) return true;
  const companyId = (boardRes.data as { client_company_id: string | null } | null)?.client_company_id;
  if (!companyId) return false;
  const { data } = await companyOs
    .from("staff_assignments")
    .select("id")
    .eq("company_id", companyId)
    .eq("team_member_id", teamMemberId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

export async function boardActorFor(boardId: string): Promise<BoardActor | null> {
  const admin = await getAdminUser();
  if (admin) return { label: admin.email, personId: null, isAdmin: true };

  const { actor } = await getTeamActor();
  if (!actor) return null;
  if (actor.isAdmin) return { label: actor.displayName, personId: actor.personId, isAdmin: true };

  if (!(await isBoardMember(boardId, actor.personId, actor.teamMemberId))) return null;
  return { label: actor.displayName, personId: actor.personId, isAdmin: false };
}
