import { companyOs } from "@/kernel/data/supabase";
import { getAdminUser } from "@/kernel/identity/admin-auth";
import { PageHead } from "@/kernel/ui/PageHead";
import { getWorkboard, listBoardManageOptions } from "@/entities/boards";
import { Workboard } from "@/entities/boards/ui/Workboard";
import { moveCardColumn } from "@/entities/boards";

export const metadata = {
  title: "Workboard",
  description: "Every open card on every active board, one board for the whole company.",
};

// The company Workboard as its own page (Dave, 2026-09-07): the same board the
// Company Dashboard shows under the office panels, reachable from the sidebar.
export default async function CompanyWorkboardPage() {
  const [workboard, boardOptions, admin] = await Promise.all([
    getWorkboard({ scope: { kind: "all" } }),
    listBoardManageOptions(),
    getAdminUser(),
  ]);
  // The admin's own person row, so cards freshly assigned to them wear "New".
  let viewerPersonId: string | null = null;
  if (admin) {
    const { data: viewer, error: viewerError } = await companyOs
      .from("people")
      .select("id")
      .eq("email", admin.email)
      .is("archived_at", null)
      .limit(1)
      .maybeSingle();
    if (viewerError) console.error("[edges/workboard] viewer lookup failed:", viewerError.message);
    viewerPersonId = (viewer as { id: string } | null)?.id ?? null;
  }

  return (
    <>
      <PageHead
        eyebrow="8 Edges"
        title="Workboard"
        sub={`${workboard.cards.length} ${workboard.cards.length === 1 ? "card" : "cards"} across ${workboard.boards.length} ${workboard.boards.length === 1 ? "board" : "boards"}. Filter by client or person, drag to move, add a card to any board.`}
      />
      <Workboard
        data={workboard}
        onMove={moveCardColumn}
        viewerPersonId={viewerPersonId}
        teamOptions={boardOptions.team}
        clientOptions={boardOptions.clients}
        programOptions={boardOptions.programs}
      />
    </>
  );
}
