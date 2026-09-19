// Cards and Human Tokens per epic, for the epics page. Cards and subtasks each
// carry their own tokens, so a card's cost is its own figure plus its
// subtasks'; a subtask counts under the card's status, since a finished
// subtask on an open card is still open work. Archived cards never reach here.

export type EpicTotals = { open: number; done: number; openTokens: number; doneTokens: number };

type CountedCard = {
  epic_id: string | null;
  status: string;
  human_tokens: number | null;
  subtasks: { human_tokens: number | null }[];
};

export const zeroTotals = (): EpicTotals => ({ open: 0, done: 0, openTokens: 0, doneTokens: 0 });

function cardTokens(card: CountedCard): number {
  return (card.human_tokens ?? 0) + card.subtasks.reduce((sum, s) => sum + (s.human_tokens ?? 0), 0);
}

function add(into: EpicTotals, card: CountedCard) {
  const tokens = cardTokens(card);
  if (card.status === "done") {
    into.done += 1;
    into.doneTokens += tokens;
  } else {
    into.open += 1;
    into.openTokens += tokens;
  }
}

export function epicTotals(cards: CountedCard[]): { byEpic: Map<string, EpicTotals>; none: EpicTotals; total: EpicTotals } {
  const byEpic = new Map<string, EpicTotals>();
  const none = zeroTotals();
  const total = zeroTotals();
  for (const card of cards) {
    add(total, card);
    if (!card.epic_id) {
      add(none, card);
      continue;
    }
    const t = byEpic.get(card.epic_id) ?? zeroTotals();
    add(t, card);
    byEpic.set(card.epic_id, t);
  }
  return { byEpic, none, total };
}
