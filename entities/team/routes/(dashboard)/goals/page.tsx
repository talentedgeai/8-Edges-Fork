import Link from "next/link";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { PageHead } from "@/kernel/ui/PageHead";
import { getEdgesLadderOptions, getMyGoals, isCoached, saigonToday } from "@/entities/team/modules/coaching";
import { ladderValue } from "@/entities/team/modules/coaching/ladder";
import { MyGoalsPanel, type MyGoalRow } from "./MyGoalsPanel";

export const metadata = {
  title: "My FAST Goals",
  description: "Add, edit, and track your own FAST goals.",
};

// "2026-Q3" — the cycle label the coaching tables already use.
function currentQuarter(): string {
  const today = saigonToday();
  const year = today.slice(0, 4);
  const month = Number(today.slice(5, 7));
  return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
}

// /team/goals — own-service only. getMyGoals is scoped to the actor's own
// coaching profile (team_member_id = actor.teamMemberId, never client input),
// matching the scoped writes in ./actions.ts. These are the same rows the
// coach sees on /team/coaching, so a goal added here shows up in the 1-1.
export default async function MyGoalsPage() {
  const actor = await requireTeamMember();
  const [goals, coached, edges] = await Promise.all([
    getMyGoals(actor),
    isCoached(actor),
    // The company goals the member can align to: the same objectives, key
    // results and metrics the coach page offers.
    getEdgesLadderOptions(),
  ]);

  const rows = goals.map(
    (g): MyGoalRow => ({
      id: g.id,
      title: g.title,
      descriptionMarkdown: g.descriptionMarkdown,
      status: g.status,
      quarterLabel: g.quarterLabel,
      metricUnit: g.metricUnit,
      startValue: g.startValue,
      targetValue: g.targetValue,
      currentValue: g.currentValue,
      dueDate: g.dueDate,
      ladderLabel: g.ladder?.label ?? null,
      ladderValue: ladderValue(g.ladder),
      // Delete is the author's alone. A goal set for you by a coach or
      // manager is theirs to remove; you can still edit it or drop it.
      canDelete: g.createdBy === actor.teamMemberId,
    }),
  );

  return (
    <>
      <PageHead
        eyebrow="Me"
        title="My FAST Goals"
        sub="Frequent · Ambitious · Specific · Transparent. Every change emails your manager."
      />

      <MyGoalsPanel rows={rows} quarter={currentQuarter()} edges={edges} />

      {coached && (
        <p className="admin-cell-muted u-mt-5">
          Comments, priorities, and 1-1 recaps live on{" "}
          <Link href="/team/my-coaching">My coaching</Link>.
        </p>
      )}
    </>
  );
}
