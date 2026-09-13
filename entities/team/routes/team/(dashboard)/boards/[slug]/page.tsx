import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getBoardForActor } from "@/entities/team/lib/boards";
import { moveCardColumn } from "@/entities/boards";
import { PageHead } from "@/kernel/ui/PageHead";
import { listBoardManageOptions, Workboard } from "@/entities/boards";

export const metadata = { title: "Board" };

// /team/boards/[slug] — a board the member belongs to. getBoardForActor returns
// null unless the actor is a member (or admin); that IS the authorization.
export default async function TeamBoardPage({ params }: { params: { slug: string } }) {
  const actor = await requireTeamMember();
  const detail = await getBoardForActor(actor, params.slug);
  if (!detail) notFound();
  // Admins get the same management controls on /team as on /admin.
  const options = actor.isAdmin ? await listBoardManageOptions() : { team: [], clients: [], programs: [] };

  return (
    <>
      <PageHead
        eyebrow={<Link href="/team">← Workspace</Link>}
        title={detail.board.name}
        sub={detail.board.client_name ? `Client board · ${detail.board.client_name}` : "Cards move, promises get kept."}
      />
      <Workboard
        data={detail}
        onMove={moveCardColumn}
        extras
        canManage={actor.isAdmin}
        teamOptions={options.team}
        clientOptions={options.clients}
        programOptions={options.programs}
        viewerPersonId={actor.personId}
      />
    </>
  );
}
