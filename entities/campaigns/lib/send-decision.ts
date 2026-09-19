import { checkSendGate } from "./broadcasts";
import { dailySendCap, type SendKind } from "./send-cap";

// Everything both send paths must ask before a marketing email goes out, in
// one place and in one order (A.15).
//
// The two paths had this sequence written twice, and the copies had drifted:
// the personal one asked the daily cap and the broadcast one did not, so the
// cap `email-message-send` advertised "across both kinds" was enforced on one
// side only. A rule with two homes is changed in one of them — the same cost
// lib/run-loop.ts records for the writer and letter agents (A.2).
//
// What stays with each kind is its bookkeeping, because that is what genuinely
// differs: the two queue tables have different status vocabularies
// (`pending`/`approved`) and each path keeps its own counters. What moves here
// is the decision, so a third kind of send cannot be written that forgets a
// step.
export type SendDecision =
  // Go ahead.
  | { action: "send" }
  // Never for this person on this campaign: a consent or persona suppression.
  // The caller records the reason against the row.
  | { action: "skip"; reason: string }
  // Not now, try again: a transient read failure, or the daily cap. `retryable`
  // is why, for the log; `capped` is true when the person has already had
  // today's email, which is the case where a caller may want to push the next
  // attempt to tomorrow rather than to the next tick.
  | { action: "defer"; reason: string; capped: boolean };

/** Who the email is for. One argument, because `personId` and `email` always
 *  travel together and two adjacent strings can be transposed silently. */
export type Recipient = { personId: string; email: string };

export async function decideSend(kind: SendKind, to: Recipient, now: Date): Promise<SendDecision> {
  // Live consent, do-not-contact, persona, archived, and prior hard failures.
  // The list may have been built days ago and somebody can unsubscribe in the
  // meantime, so this is re-asked immediately before every send.
  const gate = await checkSendGate(to.personId, to.email);
  if (gate.verdict === "error") {
    // A database hiccup is not a suppression: deferring retries, skipping would
    // mark somebody permanently passed over for a transient timeout.
    return { action: "defer", reason: `gate check failed: ${gate.message}`, capped: false };
  }
  if (gate.verdict === "suppress") return { action: "skip", reason: gate.reason };

  const cap = await dailySendCap(kind, to.personId, now);
  if (cap.error) {
    // No evidence is not evidence of no prior email.
    return { action: "defer", reason: `cap evidence unavailable: ${cap.error}`, capped: false };
  }
  if (cap.hold) return { action: "defer", reason: cap.hold, capped: true };

  return { action: "send" };
}
