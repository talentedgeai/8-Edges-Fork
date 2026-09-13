import { z } from "zod";

// Input schema for `createCard`. It is parsed right after the board guard, so
// the handler below it can trust the shape and only apply business defaults
// (priority fallback, token rounding). The title message matches the one the
// UI has always shown, so nothing user-facing changed when the hand-written
// check became a schema.
export const createCardInput = z.object({
  boardId: z.string().min(1),
  columnId: z.string().min(1),
  title: z.string().trim().min(1, "Give the card a title."),
  priority: z.string().optional(),
  assigneeId: z.string().optional(),
  dueDate: z.string().optional(),
  description: z.string().optional(),
  internal: z.boolean().optional(),
  humanTokens: z.number().nullable().optional(),
});

export type CreateCardInput = z.infer<typeof createCardInput>;
