"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { recordAudit } from "@/lib/admin/audit";
import { insertPnlLine, updatePnlLine, deletePnlLine } from "@/lib/admin/event-pnl";
import type { PnlLineInput } from "@/lib/admin/event-pnl-shared";

type Result = { ok: true } | { ok: false; error: string };

function refresh(eventId: string) {
  revalidatePath(`/admin/revenue/events/${eventId}`);
}

export async function addPnlLine(eventId: string, input: PnlLineInput): Promise<Result> {
  const admin = await requireAdmin();
  const res = await insertPnlLine(eventId, input);
  if (!res.ok) return { ok: false, error: res.error };
  await recordAudit({
    table: "event_pnl_lines",
    recordId: res.id,
    operation: "insert",
    actor: admin.email,
    newData: { event_id: eventId, side: input.side, classification: input.classification },
    context: { via: "event_pnl_tab" },
  });
  refresh(eventId);
  return { ok: true };
}

export async function editPnlLine(eventId: string, id: string, input: PnlLineInput): Promise<Result> {
  const admin = await requireAdmin();
  const res = await updatePnlLine(id, input);
  if (!res.ok) return { ok: false, error: res.error };
  await recordAudit({
    table: "event_pnl_lines",
    recordId: id,
    operation: "update",
    actor: admin.email,
    newData: { side: input.side, classification: input.classification },
    context: { via: "event_pnl_tab" },
  });
  refresh(eventId);
  return { ok: true };
}

export async function removePnlLine(eventId: string, id: string): Promise<Result> {
  const admin = await requireAdmin();
  const res = await deletePnlLine(id);
  if (!res.ok) return { ok: false, error: res.error };
  await recordAudit({
    table: "event_pnl_lines",
    recordId: id,
    operation: "delete",
    actor: admin.email,
    context: { via: "event_pnl_tab" },
  });
  refresh(eventId);
  return { ok: true };
}
