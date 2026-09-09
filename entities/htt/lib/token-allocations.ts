// Bought tokens, set by hand. htt.token_allocations is append-only: the row
// with the highest seq per company is the current Bought figure the hub reads
// (entities/portal/lib/hub-tokens.ts derives Balance from it). This is the one
// place a new figure is written and the history is listed, so the admin
// control, the audit trail and the hub tile all agree on what a row means.
import { htt } from "@/kernel/data/supabase";
import { TOKEN_ALLOCATION_KINDS, type TokenAllocationKind } from "./token-allocation-kinds";

export type TokenAllocation = {
  id: string;
  seq: number;
  tokens: number | null; // null means the pack was removed
  kind: TokenAllocationKind | null;
  reason: string | null;
  setByEmail: string;
  setAt: string;
};

const SELECT = "id, seq, tokens, kind, reason, set_by_email, set_at";

type Row = {
  id: string;
  seq: number;
  tokens: number | null;
  kind: string | null;
  reason: string | null;
  set_by_email: string;
  set_at: string;
};

const toAllocation = (r: Row): TokenAllocation => ({
  id: r.id,
  seq: r.seq,
  tokens: r.tokens == null ? null : Number(r.tokens),
  kind: (TOKEN_ALLOCATION_KINDS as readonly string[]).includes(r.kind ?? "") ? (r.kind as TokenAllocationKind) : null,
  reason: r.reason,
  setByEmail: r.set_by_email,
  setAt: r.set_at,
});

// Newest first; the first row is the current figure.
export async function listTokenAllocations(companyId: string, limit = 20): Promise<TokenAllocation[]> {
  const { data, error } = await htt
    .from("token_allocations")
    .select(SELECT)
    .eq("company_id", companyId)
    .order("seq", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[htt/token-allocations] list failed:", error.message);
    return [];
  }
  return ((data ?? []) as Row[]).map(toAllocation);
}

// Appends the new current figure. setByEmail comes from the verified admin
// session, never from the form.
export async function setTokenAllocation(input: {
  companyId: string;
  tokens: number;
  kind: TokenAllocationKind;
  reason: string;
  setByEmail: string;
}): Promise<{ ok: true; allocation: TokenAllocation } | { ok: false; error: string }> {
  const { data, error } = await htt
    .from("token_allocations")
    .insert({
      company_id: input.companyId,
      tokens: input.tokens,
      kind: input.kind,
      reason: input.reason,
      set_by_email: input.setByEmail,
    })
    .select(SELECT)
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, allocation: toAllocation(data as Row) };
}
