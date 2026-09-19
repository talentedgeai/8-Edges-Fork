// The letter agent's process, in order. Each step must run and pass its check
// before the next starts; the pipeline decides the order and refuses to skip.
// `agent_step` on email_campaigns holds the id of the step to run next;
// `ready` parks a finished run until a person approves it. There is no
// publish step on purpose: the agent never sends.

export const LETTER_STEPS = [
  { id: "gather", label: "Gather" },
  { id: "pick", label: "Pick posts" },
  { id: "write", label: "Write" },
  { id: "rotate", label: "Rotate" },
  { id: "assemble", label: "Assemble" },
  { id: "validate", label: "Validate" },
] as const;

export type LetterStepId = (typeof LETTER_STEPS)[number]["id"];

export const LETTER_READY = "ready" as const;
export type LetterState = LetterStepId | typeof LETTER_READY;

export function isLetterStep(value: string | null | undefined): value is LetterStepId {
  return LETTER_STEPS.some((s) => s.id === value);
}

export function letterStepIndex(id: LetterStepId): number {
  return LETTER_STEPS.findIndex((s) => s.id === id);
}

export function nextLetterState(id: LetterStepId): LetterState {
  const i = letterStepIndex(id);
  return i + 1 < LETTER_STEPS.length ? LETTER_STEPS[i + 1].id : LETTER_READY;
}

export function describeLetterState(state: LetterState): string {
  if (state === LETTER_READY) return "Ready for approval";
  return `Step ${letterStepIndex(state) + 1} of ${LETTER_STEPS.length}: ${LETTER_STEPS[letterStepIndex(state)].label}`;
}
