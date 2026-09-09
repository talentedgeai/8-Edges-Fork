import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHead } from "@/kernel/ui/PageHead";
import { getAdminUser } from "@/kernel/identity/admin-auth";
import { companyOs } from "@/kernel/data/supabase";
import { getBoardBySlug, listBoardManageOptions } from "@/entities/company-os/modules/boards/data";
import { Workboard } from "@/entities/company-os/modules/boards/ui/Workboard";
import { moveCard } from "@/entities/team";

export const metadata = {
  title: "Board",
  description: "A task board.",
};

export default async function BoardDetailPage({ params }: { params: { slug: string } }) {
  const detail = await getBoardBySlug(params.slug);
  if (!detail) notFound();
  const options = await listBoardManageOptions();

  // The admin's own person row, so cards freshly assigned to them wear "New".
  const admin = await getAdminUser();
  let viewerPersonId: string | null = null;
  if (admin) {
    const { data: viewer, error: viewerError } = await companyOs
      .from("people")
      .select("id")
      .eq("email", admin.email)
      .is("archived_at", null)
      .limit(1)
      .maybeSingle();
    if (viewerError) console.error("[boards] viewer lookup failed:", viewerError.message);
    viewerPersonId = (viewer as { id: string } | null)?.id ?? null;
  }

  const { board } = detail;
  return (
    <>
      <PageHead
        eyebrow={<Link href="/admin/boards">← Boards</Link>}
        title={board.name}
        sub={
          board.client_name
            ? `Client board · ${board.client_name}`
            : "Cards move, promises get kept."
        }
      />
      <Workboard
        data={detail}
        onMove={moveCard}
        extras
        canManage
        teamOptions={options.team}
        clientOptions={options.clients}
        programOptions={options.programs}
        viewerPersonId={viewerPersonId}
      />
    </>
  );
}
