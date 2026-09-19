// Every event the bus carries, with the shape of its payload. One file so the
// whole vocabulary is readable at once, and so a publisher and a subscriber in
// entities that may not import each other still agree on the contract.
//
// Names are past tense and read as facts, not instructions: `order.fulfilled`,
// not `fulfilOrder`. A publisher states what happened; what to do about it is
// the subscriber's business, which is the whole point.
import { z } from "zod";

export const EVENTS = {
  // A board card moved into a done column. Coaching listens: a card linked to a
  // commitment means that commitment was kept. Boards works with no listener.
  "board.card.completed": z.object({
    taskId: z.string().min(1),
    boardSlug: z.string().min(1),
    subjectType: z.string().nullable(),
    subjectId: z.string().nullable(),
  }),
} as const;

export type EventName = keyof typeof EVENTS;
export type EventPayload<N extends EventName> = z.infer<(typeof EVENTS)[N]>;
