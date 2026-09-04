"use server";

import { revalidatePath } from "next/cache";
import { companyOs } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-auth";
import { recordAudit } from "@/lib/admin/audit";
import { type Result } from "@/lib/admin/mutations";
import { DEFAULT_COLUMNS } from "@/lib/boards/types";
import { slugify } from "@/lib/slug";

// Create a board (admin only): unique slug, seeded with the default columns.
export async function createBoard(input: {
  name: string;
  clientCompanyId?: string;
}): Promise<Result & { slug?: string }> {
  const admin = await requireAdmin();
  const name = input.name?.trim();
  if (!name) return { ok: false, error: "Name the board." };

  const base = slugify(name) || "board";
  let slug = base;
  for (let n = 2; ; n++) {
    const { data } = await companyOs.from("boards").select("id").eq("slug", slug).maybeSingle();
    if (!data) break;
    slug = `${base}-${n}`;
  }

  const { data: last } = await companyOs
    .from("boards")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort_order = ((last as { sort_order: number } | null)?.sort_order ?? 0) + 1;

  const row = { name, slug, client_company_id: input.clientCompanyId || null, sort_order };
  const { data: board, error } = await companyOs.from("boards").insert(row).select("id").single();
  if (error) return { ok: false, error: error.message };

  await companyOs
    .from("board_columns")
    .insert(DEFAULT_COLUMNS.map((c, i) => ({ board_id: board.id, name: c.name, position: i, is_done: c.is_done })));

  await recordAudit({ table: "boards", recordId: board.id, operation: "insert", actor: admin.email, newData: row });
  revalidatePath("/admin/boards", "layout");
  revalidatePath("/team/boards", "layout");
  return { ok: true, slug };
}
