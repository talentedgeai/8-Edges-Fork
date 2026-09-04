import { companyOs } from "@/lib/supabase";
import { sendLarkDirectMessage } from "@/lib/lark";
import { getSiteOrigin } from "@/lib/site-origin";

// Lark DM the assignee when a card is assigned to them (best-effort; no-ops until
// the Lark app is configured). Never notifies self-assignment. Server-only
// (getSiteOrigin uses next/headers): import only from "use server" files, never
// from a client-reachable module.
export async function notifyBoardAssignee(
  boardId: string,
  assigneeId: string | null,
  cardTitle: string,
  byPersonId: string | null,
): Promise<void> {
  if (!assigneeId || assigneeId === byPersonId) return;
  try {
    const [{ data: board }, { data: person }] = await Promise.all([
      companyOs.from("boards").select("slug, name").eq("id", boardId).maybeSingle(),
      companyOs.from("people").select("email").eq("id", assigneeId).maybeSingle(),
    ]);
    const email = (person as { email: string } | null)?.email;
    const slug = (board as { slug: string } | null)?.slug;
    const name = (board as { name: string } | null)?.name ?? "a board";
    if (!email || !slug) return;
    const url = `${getSiteOrigin()}/team/boards/${slug}`;
    await sendLarkDirectMessage(email, `You were assigned "${cardTitle}" on the ${name} board.\n${url}`);
  } catch (err) {
    console.error("[boards] assignee notify failed", err);
  }
}
