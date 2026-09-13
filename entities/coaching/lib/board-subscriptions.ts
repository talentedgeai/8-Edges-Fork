// Coaching's side of the board card move (RS-13, replacing the composed
// moveCardColumn; it moved here with the entity in RS-12).
//
// Coaching creates a board card for a commitment, so boards may not import
// coaching to close it — an entity that creates cards cannot also be one the
// board imports, or neither installs without the other. Boards publishes
// `board.card.completed` instead and this subscribes, which is why a deployment
// can have boards without coaching, or coaching without boards.
//
// The composition root registers it for the entities a deployment includes;
// nothing here registers itself on import.
import { companyOs } from "@/kernel/data/supabase";
import { subscribe, type EventPayload } from "@/kernel/events";
import { SUBJECT_COMMITMENT } from "@/entities/boards";

// One-way sync: a commitment-linked card reaching a done column marks the
// coaching commitment kept. Never the reverse.
export async function markCommitmentKept(payload: EventPayload<"board.card.completed">): Promise<void> {
  if (payload.subjectType !== SUBJECT_COMMITMENT || !payload.subjectId) return;
  const { error } = await companyOs
    .from("coaching_commitments")
    .update({ status: "completed", closed_at: new Date().toISOString() })
    .eq("id", payload.subjectId)
    .neq("status", "completed");
  // Thrown, not swallowed: the bus logs and audits it, and a silent drop here
  // would leave a kept commitment looking open with nothing to find.
  if (error) throw new Error(`coaching commitment ${payload.subjectId} not marked kept: ${error.message}`);
}

/** What the composition root registers when this entity is installed. */
export function subscriptions(): void {
  subscribe("coaching", "board.card.completed", markCommitmentKept);
}
