// The writer agent's process, in the order the brand profile's process_md
// describes it. Each step is a function that must run and must pass its check
// before the next one starts; the pipeline, not the model, decides the order
// and refuses to skip. `writer_step` on marketing_campaigns holds the id of the
// step to run next; `ready` parks a finished run until it is published.

export const WRITER_STEPS = [
  { id: "draft", label: "Draft" },
  { id: "edit", label: "Edit" },
  { id: "seo", label: "SEO and AEO" },
  { id: "exhibits", label: "Exhibits" },
  { id: "hero", label: "Hero image" },
  { id: "links", label: "Links" },
  { id: "assemble", label: "Assemble" },
  { id: "validate", label: "Validate" },
  { id: "channels", label: "Channels" },
  { id: "publish", label: "Publish" },
] as const;

export type WriterStepId = (typeof WRITER_STEPS)[number]["id"];

// Two states that are not steps (nothing runs on them). ready: the post passed
// every check and waits for a person to publish, where a brand without
// auto-publish parks. done: every channel asset is written and approved and the
// post is live or scheduled for its date; the campaign is finished.
export const WRITER_READY = "ready" as const;
export const WRITER_DONE = "done" as const;
export type WriterState = WriterStepId | typeof WRITER_READY | typeof WRITER_DONE;

export function isWriterStep(value: string | null | undefined): value is WriterStepId {
  return WRITER_STEPS.some((s) => s.id === value);
}

export function stepIndex(id: WriterStepId): number {
  return WRITER_STEPS.findIndex((s) => s.id === id);
}

export function stepLabel(id: WriterState): string {
  if (id === WRITER_READY) return "Ready to publish";
  if (id === WRITER_DONE) return "Published";
  return WRITER_STEPS[stepIndex(id)].label;
}

// The state to write after `id` succeeds. Everything past validate is behind
// the brand's auto-publish switch: without it, validate parks the run at ready
// and a person publishes. With it, the writer writes every channel from the
// final post, approves them, and publishes or schedules the post itself.
export function nextState(id: WriterStepId, autoPublish: boolean): WriterState {
  if (id === "validate" && !autoPublish) return WRITER_READY;
  const i = stepIndex(id);
  return i + 1 < WRITER_STEPS.length ? WRITER_STEPS[i + 1].id : WRITER_DONE;
}

// "Step 4 of 10: Exhibits", for the hub and the ops message.
export function describeState(state: WriterState): string {
  if (state === WRITER_READY || state === WRITER_DONE) return stepLabel(state);
  return `Step ${stepIndex(state) + 1} of ${WRITER_STEPS.length}: ${stepLabel(state)}`;
}
