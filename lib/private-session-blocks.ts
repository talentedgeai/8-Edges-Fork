import { supabase } from "./supabase";

// Server-only helpers for private_session_blocks (table lives in the shared
// ai-officer DB, migration 022_private_session_blocks). Two flavors of block:
//   - 'manual'  — admin reserves a date range from /admin/blocks
//   - 'booking' — auto-inserted after a paid Saigon-private reservation.
//
// A booking attempt whose [start, end] overlaps any existing row is rejected,
// regardless of source.

export type SessionBlock = {
  id: string;
  start_date: string;
  end_date: string;
  source: "manual" | "booking";
  inquiry_id: string | null;
  notes: string | null;
  created_at: string;
};

export async function findOverlappingBlock(
  startDate: string,
  endDate: string,
): Promise<SessionBlock | null> {
  // Two ranges [a,b] and [c,d] overlap iff a <= d AND c <= b.
  const { data, error } = await supabase
    .from("private_session_blocks")
    .select("id, start_date, end_date, source, inquiry_id, notes, created_at")
    .lte("start_date", endDate)
    .gte("end_date", startDate)
    .order("start_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[blocks] findOverlappingBlock failed:", error.message);
    return null;
  }
  return (data as SessionBlock | null) ?? null;
}

export async function insertBookingBlock(input: {
  startDate: string;
  endDate: string;
  inquiryId: string | null;
  notes?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("private_session_blocks")
    .insert({
      start_date: input.startDate,
      end_date: input.endDate,
      source: "booking",
      inquiry_id: input.inquiryId,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[blocks] insertBookingBlock failed:", error?.message);
    return { ok: false, error: error?.message ?? "Insert failed" };
  }
  return { ok: true, id: data.id };
}
