import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHead } from "@/kernel/ui/PageHead";
import { getBoardBySlug } from "@/entities/boards/lib/data";
import { EpicsView } from "@/entities/boards/ui/EpicsView";

export const metadata = {
  title: "Epics",
  description: "The board's features, with the cards and Human Tokens behind each.",
};

export default async function BoardEpicsPage({ params }: { params: { slug: string } }) {
  const detail = await getBoardBySlug(params.slug);
  if (!detail) notFound();

  return (
    <>
      <PageHead
        eyebrow={<Link href={`/admin/boards/${detail.board.slug}`}>← {detail.board.name}</Link>}
        title="Epics"
        sub="One row per feature: its open and done cards, and the Human Tokens behind them."
      />
      <EpicsView detail={detail} surface="/admin" canManage />
    </>
  );
}
