import { PageHead } from "@/kernel/ui/PageHead";
import { listBoards, listBoardManageOptions } from "@/entities/company-os/modules/boards/data";
import { BoardsIndex } from "./BoardsIndex";

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
