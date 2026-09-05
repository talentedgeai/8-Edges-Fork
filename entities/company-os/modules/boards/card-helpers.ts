// Helpers shared by the board card actions. They used to be private to
// app/admin/(dashboard)/boards/[slug]/actions.ts; ME-11 lifted moveCard out of
// that file (lib/boards/move-card.ts) so the team entity can reach it through
// the company-os index instead of importing a route module, and the three
// pieces both files need live here rather than being redeclared.
import { revalidatePath } from "next/cache";
import { companyOs } from "@/kernel/data/supabase";

export const DENIED = "You do not have access to this board.";

// These actions serve both /admin/boards and /team/boards, so refresh both.
export function refresh(slug?: string) {
  if (slug) {
    revalidatePath(`/admin/boards/${slug}`);
    revalidatePath(`/team/boards/${slug}`);
  } else {
    revalidatePath("/admin/boards", "layout");
    revalidatePath("/team/boards", "layout");
  }
  revalidatePath("/team/my-work-boards");
}

export async function endPosition(boardId: string, columnId: string): Promise<number> {
  const { data } = await companyOs
    .from("tasks")
    .select("position")
    .eq("board_id", boardId)
    .eq("board_column_id", columnId)
    .is("archived_at", null)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const top = (data as { position: number } | null)?.position;
  return (typeof top === "number" ? top : 0) + 1;
}
