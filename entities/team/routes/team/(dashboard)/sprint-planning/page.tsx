import { requireTeamMember } from "@/kernel/identity/team-auth";
import { PageHead } from "@/kernel/ui/PageHead";
import { saigonToday } from "@/kernel/config/dates";
import { SprintPlanning } from "@/entities/boards";
import { getTeamWorkboard } from "@/entities/team/lib/boards";

export const metadata = { title: "Sprint planning" };

// The member's sprint planning (SP-01): the same three columns the admin has,
// scoped to the boards they are on. The card moves re-check membership per
// board, so this page is presentation only.
export default async function TeamSprintPlanningPage() {
  const actor = await requireTeamMember();
  const data = await getTeamWorkboard(actor);
  return (
    <>
      <PageHead eyebrow="Work" title="Sprint planning" sub="Move what is not done into next week's sprint or to done. Each card lands in its own board's sprint." />
      <SprintPlanning data={data} today={saigonToday()} />
    </>
  );
}
