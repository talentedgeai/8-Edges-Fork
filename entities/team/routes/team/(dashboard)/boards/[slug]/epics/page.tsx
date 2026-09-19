import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getBoardForActor } from "@/entities/team/lib/boards";
import { PageHead } from "@/kernel/ui/PageHead";
import { EpicsView } from "@/entities/boards";

export const metadata = { title: "Epics" };

// /team/boards/[slug]/epics — getBoardForActor returning null IS the
// authorization, same as the board page itself; only an admin may edit.
export default async function TeamEpicsPage({ params }: { params: { slug: string } }) {
  const actor = await requireTeamMember();
  const detail = await getBoardForActor(actor, params.slug);
  if (!detail) notFound();

  return (
    <>
      <PageHead
        eyebrow={<Link href={`/team/boards/${detail.board.slug}`}>← {detail.board.name}</Link>}
        title="Epics"
        sub="One row per feature: its open and done cards, and the Human Tokens behind them."
      />
      <EpicsView detail={detail} surface="/team" canManage={actor.isAdmin} />
    </>
  );
}
