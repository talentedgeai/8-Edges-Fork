import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHead } from "@/kernel/ui/PageHead";
import { getBoardBySlug, listRecentMeetings } from "@/entities/company-os/modules/boards/data";
import { SprintView } from "@/entities/company-os/modules/boards/ui/SprintView";

export const metadata = {
  title: "Sprint",
  description: "Plan vs actual for one sprint.",
};

export default async function SprintDetailPage({ params }: { params: { slug: string; sprintId: string } }) {
  const detail = await getBoardBySlug(params.slug);
  if (!detail) notFound();
  const sprint = detail.sprints.find((s) => s.id === params.sprintId);
  if (!sprint) notFound();
  const meetings = await listRecentMeetings();

  return (
    <>
      <PageHead
        eyebrow={<Link href={`/admin/boards/${detail.board.slug}`}>← {detail.board.name}</Link>}
        title={sprint.name}
        sub={detail.board.client_name ? `Sprint · ${detail.board.client_name}` : "Sprint"}
      />
      <SprintView detail={detail} sprintId={sprint.id} meetingOptions={meetings} />
    </>
  );
}
