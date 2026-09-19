import { describe, expect, it } from "vitest";
import { epicTotals } from "./epic-totals";

describe("epicTotals", () => {
  it("sums cards and their subtasks' tokens under the card's status, per epic", () => {
    const { byEpic, none, total } = epicTotals([
      { epic_id: "a", status: "doing", human_tokens: 3, subtasks: [{ human_tokens: 2 }, { human_tokens: null }] },
      { epic_id: "a", status: "done", human_tokens: null, subtasks: [] },
      { epic_id: null, status: "todo", human_tokens: 4, subtasks: [] },
    ]);
    expect(byEpic.get("a")).toEqual({ open: 1, done: 1, openTokens: 5, doneTokens: 0 });
    expect(none).toEqual({ open: 1, done: 0, openTokens: 4, doneTokens: 0 });
    expect(total).toEqual({ open: 2, done: 1, openTokens: 9, doneTokens: 0 });
  });
});
