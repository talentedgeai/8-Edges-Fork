import { PageHead } from "@/components/admin/PageHead";
import { listBoards, listBoardManageOptions } from "@/lib/boards/data";
import { BoardsIndex } from "./BoardsIndex";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const metadata = {
  title: "Boards",
  description: "Task boards for client projects, our own products, and day-to-day work.",
};

export default async function BoardsPage() {
  const [boards, options] = await Promise.all([listBoards(), listBoardManageOptions()]);

  return (
    <>
      <PageHead
        eyebrow="Workspace"
        title="Boards"
        sub="Kanban boards for client projects, our own products, and day-to-day work."
      />
      <BoardsIndex boards={boards} clients={options.clients} />
    </>
  );
}
