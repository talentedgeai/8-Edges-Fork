// The in-process event bus (RS-13, spec §P5, docs/adr/0003).
//
// It exists for one kind of coupling: a *soft effect*, where something happens
// in entity B because of an action in entity A, and A is still meaningful
// without B. Before the bus, A imported B's writer, so a deployment that left B
// out did not compile. Now A publishes a named fact and B subscribes, and a
// deployment without B simply has no subscriber.
//
// A hard dependency — where A's feature is meaningless without B — is NOT this.
// That stays a direct call through B's door along a declared `requires` edge,
// because the caller needs the result and the failure.
//
// Three rules, from the ADR:
//   * handlers run in-process and are awaited, so an effect that must land
//     before the request returns does;
//   * a handler failure is logged and audited and never reaches the publisher,
//     because an optional entity must not be able to fail a required one;
//   * publish returns nothing. A publisher that needs an answer has a hard
//     dependency and should call the door.
//
// Delivery is deliberately hidden behind `publish`, so the in-process loop can
// become a durable queue later without touching a single publisher.
import { z } from "zod";
import { recordAudit } from "@/kernel/audit/audit";
import { EVENTS, type EventName, type EventPayload } from "./catalogue";

type Handler = (payload: unknown) => Promise<void> | void;

/** name -> the handlers registered for it, in registration order. */
const handlers = new Map<EventName, { entity: string; run: Handler }[]>();

/**
 * Register one entity's interest in one event. The composition root calls this
 * for the entities a deployment includes, and nothing else does: an entity that
 * registered itself on import would make registration depend on load order.
 */
export function subscribe<N extends EventName>(
  entity: string,
  name: N,
  run: (payload: EventPayload<N>) => Promise<void> | void,
): void {
  const list = handlers.get(name) ?? [];
  list.push({ entity, run: run as Handler });
  handlers.set(name, list);
}

/** Which entities are listening. Used by the bus's own tests to prove that a
 *  deployment with no subscriber is a real state, not an accident. */
export function subscribersOf(name: EventName): string[] {
  return (handlers.get(name) ?? []).map((h) => h.entity);
}

/** Drops every registration. Tests only — the composition root registers once. */
export function resetSubscribers(): void {
  handlers.clear();
}

/**
 * Publish a fact. The payload is validated first, because a malformed event is
 * the publisher's bug and should fail there rather than in a subscriber; after
 * that no handler can fail the caller.
 */
export async function publish<N extends EventName>(name: N, payload: EventPayload<N>): Promise<void> {
  const schema = EVENTS[name] as z.ZodType<EventPayload<N>>;
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`publish(${name}): invalid payload — ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  for (const { entity, run } of handlers.get(name) ?? []) {
    try {
      await run(parsed.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[kernel/events] ${entity} failed handling ${name}:`, message);
      // Audited, not just logged: a dropped effect is invisible otherwise, and
      // the trail is what tells someone the follow-up never happened.
      await recordAudit({
        table: "events",
        recordId: name,
        operation: "update",
        actor: `kernel/events:${entity}`,
        newData: { event: name, entity, error: message },
      }).catch(() => undefined);
    }
  }
}
