import { z } from "zod";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import type { Result } from "@/kernel/data/result";

// What a coaching server action accepts, parsed at the boundary (ticket 13).
//
// `grep safeParse entities/coaching/` returned ZERO before this: the entity
// predates the rule `CLAUDE.md` has carried since AR-02, so sixty-seven actions
// took whatever the client sent and handed it to a writer. The writers do check
// what they care about — ownership, status vocabularies, trimmed titles — and
// that is the reason nothing had gone wrong. It is not a reason to keep
// relying on it: a writer's check is about the DOMAIN, and this is about the
// shape, which is the thing an action can be handed a lie about.
//
// The guard stays the first statement (check-action-auth enforces it) and the
// parse is the next one. Never `.parse()`: a thrown ZodError reaches the client
// as a JSON dump rather than a sentence.

/** The id of anything in this entity. Every one of them is a uuid. */
export const zId = z.string().uuid("Not a valid id.");

/** A Saigon calendar day, the format every date in coaching travels as. */
export const zDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Give the day as YYYY-MM-DD.");

/** Text somebody typed that must not be empty. */
export const zText = (max: number, empty: string) =>
  z.string().trim().min(1, empty).max(max, `Keep it under ${max} characters.`);

/** Text somebody typed that may be empty, and a cap so nothing unbounded lands. */
export const zLooseText = (max: number) => z.string().max(max, `Keep it under ${max} characters.`);

/** Markdown bodies: generous, because a recap is long, but never unbounded. */
export const zMarkdown = zLooseText(50_000);

/**
 * Parse, or the exact `Result` the action returns.
 *
 * Returning the failure in the action's own shape is what keeps the call site
 * to two lines — `const p = parseInput(S, raw); if (!p.ok) return p;` — which
 * matters across sixty-seven of them: a five-line ceremony per action is how a
 * rule like this gets adopted in three files and abandoned.
 */
export function parseInput<T>(
  schema: z.ZodType<T>,
  raw: unknown,
): { ok: true; data: T } | (Result & { ok: false }) {
  const r = schema.safeParse(raw);
  if (r.success) return { ok: true, data: r.data };
  return { ok: false, error: zodIssuesToMessage(r.error.issues) };
}
