import { requireTeamMember } from "@/kernel/identity/team-auth";
import { PageHead } from "@/kernel/ui/PageHead";
import { Workboard } from "@/entities/company-os";
import { getTeamWorkboard } from "@/entities/team/lib/boards";
import { moveCard } from "@/entities/team/lib/move-card";

export const metadata = { title: "Workboard" };

// The member's Workboard (WB-04): every card on every board of every client
// they are assigned to, the same view the admin has on /admin/edges/workboard,
// scoped to their assignments. Move, add and edit are on; the actions re-check
// membership per board, so this page is presentation only.
export default async function TeamWorkboardPage() {
  const actor = await requireTeamMember();
  const data = await getTeamWorkboard(actor);
  const clients = data.clients.map((c) => c.name);

  return (
    <>
      <PageHead
        eyebrow="Work"
        title="Workboard"
        sub={
          clients.length > 0
            ? `Every card across ${clients.join(", ")}. Filter by client or person, drag to move, add a card to any board.`
            : "The boards of the clients you are assigned to. No boards yet."
        }
      />
      <Workboard data={data} onMove={moveCard} viewerPersonId={actor.personId} />
    </>
  );
}
