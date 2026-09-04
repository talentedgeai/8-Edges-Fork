import { requireTeamMember } from "@/lib/team-auth";
import { getMyWork, getMyBoardSummaries } from "@/lib/team/boards";
import { PageHead } from "@/components/admin/PageHead";
import { MyTasks } from "./MyTasks";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const metadata = { title: "Work Boards" };

export default async function MyTasksPage() {
  const actor = await requireTeamMember();
  const [work, boards] = await Promise.all([getMyWork(actor), getMyBoardSummaries(actor)]);

  return (
    <>
      <PageHead
        eyebrow="Me"
        title="Work Boards"
        sub="Your boards, everything assigned to you across them, and your open commitments."
      />
      <MyTasks work={work} boards={boards} />
    </>
  );
}
