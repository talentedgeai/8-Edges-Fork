import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getMyWorkBoard } from "@/entities/team/lib/boards";
import { PageHead } from "@/kernel/ui/PageHead";
import { PRIORITY_LABEL, PRIORITY_TONE } from "@/entities/company-os";
import { moveCard } from "@/entities/team/lib/move-card";
import { MyWorkBoard } from "./MyWorkBoard";

export const metadata = { title: "My Work Board" };

export default async function MyWorkBoardPage() {
  const actor = await requireTeamMember();
  const data = await getMyWorkBoard(actor);

  return (
    <>
      <PageHead
        eyebrow="Me"
        title="My Work Board"
        sub="Everything assigned to you, across every board. Drag a card and it moves on its own board."
      />
      <MyWorkBoard data={data} onMove={moveCard} priorityLabel={PRIORITY_LABEL} priorityTone={PRIORITY_TONE} />
    </>
  );
}
