import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getBoardForActor } from "@/entities/team/lib/boards";
import { PageHead } from "@/kernel/ui/PageHead";
import { listRecentMeetings, SprintView } from "@/entities/company-os";

export const metadata = { title: "Sprint" };

// /team/boards/[slug]/sprints/[id] — getBoardForActor returning null IS the
// authorization, same as the board page itself.
export default async function TeamSprintPage({ params }: { params: { slug: string; sprintId: string } }) {
  const actor = await requireTeamMember();
  const detail = await getBoardForActor(actor, params.slug);
  if (!detail) notFound();
  const sprint = detail.sprints.find((s) => s.id === params.sprintId);
  if (!sprint) notFound();
  const meetings = await listRecentMeetings();

  return (
    <>
      <PageHead
        eyebrow={<Link href={`/team/boards/${detail.board.slug}`}>← {detail.board.name}</Link>}
        title={sprint.name}
        sub={detail.board.client_name ? `Sprint · ${detail.board.client_name}` : "Sprint"}
      />
      <SprintView detail={detail} sprintId={sprint.id} meetingOptions={meetings} />
    </>
  );
}
