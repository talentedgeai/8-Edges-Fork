import { PageHead } from "@/kernel/ui/PageHead";
import { saigonToday } from "@/kernel/config/dates";
import { getWorkboard } from "@/entities/boards";
import { SprintPlanning } from "@/entities/boards/ui/SprintPlanning";
import { WorkboardTabs } from "../workboard/WorkboardTabs";

export const metadata = {
  title: "Sprint planning",
  description: "Everything not done, next week's sprint per board, and what finished this week.",
};

// Sprint planning (SP-01): the Monday-to-Tuesday meeting's page. Done means
// done in the last seven days, one planning cycle, or inside the chosen week.
export default async function SprintPlanningPage() {
  const workboard = await getWorkboard({ scope: { kind: "all" } });
  return (
    <>
      <PageHead eyebrow="8 Edges" title="Sprint planning" sub="Move what is not done into next week's sprint or to done. Each card lands in its own board's sprint." />
      <WorkboardTabs />
      <SprintPlanning data={workboard} today={saigonToday()} />
    </>
  );
}
