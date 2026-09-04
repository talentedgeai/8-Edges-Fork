// Per-retreat hub content that the DB doesn't hold: the standard pre/post
// survey pair and the resource cards. Hardcoded per the design decision
// (docs/plans/2026-07-31-my-retreat-design.md) — small, editable config,
// keyed by event slug for resources.

export type RetreatSurvey = {
  stage: string; // "Pre" | "Post"
  slug: string; // survey slug; link is /surveys/<slug>?cohort=<event-slug>
  title: string;
  description: string;
};

// Every retreat runs the same pre/post pair; per-event attribution rides the
// ?cohort=<event-slug> param (see the events feedback wiring).
export const RETREAT_SURVEYS: RetreatSurvey[] = [
  {
    stage: "Before",
    slug: "ai-journey",
    title: "AI Journey baseline",
    description: "A quick read on where you are with AI today. Do this before the retreat starts.",
  },
  {
    stage: "After",
    slug: "ai-capability-pulse",
    title: "AI Capability Pulse",
    description: "How the retreat landed and where you are now. Do this at the end.",
  },
];

export type RetreatResource = {
  eyebrow?: string;
  title: string;
  description?: string;
  href: string;
};

// Resource cards per retreat (deck, prompts, references). Empty until curated;
// the hub hides the section when a retreat has none.
export const RETREAT_RESOURCES: Record<string, RetreatResource[]> = {
  // "private-retreat-4-james-tracy-2026-07-27": [ { title: "…", href: "…" } ],
};

export function getRetreatResources(slug: string): RetreatResource[] {
  return RETREAT_RESOURCES[slug] ?? [];
}
