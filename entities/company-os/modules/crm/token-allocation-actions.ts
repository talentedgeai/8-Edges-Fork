"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/kernel/identity/admin-auth";
import { recordAudit } from "@/kernel/audit/audit";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import { setTokenAllocation, TOKEN_ALLOCATION_KINDS } from "@/entities/htt";
import type { Result } from "@/entities/company-os/lib/mutations";

// Sets a client's Bought tokens from the Client Hub. The figure is the new
// total, not a delta, because the allocation table's latest row IS the current
// figure. Every change carries a kind and a reason and lands in the audit log
// with the admin who made it, so a later reader can see why Bought moved.
// Built per call rather than at module scope: the kinds list comes through the
// htt door, and door values are never read while a module loads.
const setBoughtTokensInput = () =>
  z.object({
    companyId: z.string().uuid(),
    tokens: z.number().min(0).max(100000),
    kind: z.enum(TOKEN_ALLOCATION_KINDS),
    reason: z.string().trim().min(3, "Say why the figure changed.").max(500),
  });

export async function setBoughtTokens(raw: {
  companyId: string;
  tokens: number;
  kind: string;
  reason: string;
}): Promise<Result> {
  const admin = await requireAdmin();
  const parsed = setBoughtTokensInput().safeParse(raw);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const input = parsed.data;

  const res = await setTokenAllocation({ ...input, setByEmail: admin.email });
  if (!res.ok) return res;

  await recordAudit({
    table: "htt.token_allocations",
    recordId: res.allocation.id,
    operation: "insert",
    actor: admin.email,
    newData: { company_id: input.companyId, tokens: input.tokens, kind: input.kind, reason: input.reason, seq: res.allocation.seq },
  });
  revalidatePath(`/admin/revenue/companies/${input.companyId}`);
  revalidatePath(`/team/clients/${input.companyId}`);
  revalidatePath("/portal/hub");
  return { ok: true };
}
