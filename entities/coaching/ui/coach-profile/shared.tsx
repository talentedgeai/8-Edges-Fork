"use client";

import type { OceanDimensionKey } from "@/entities/coaching/lib/types";

export type RenderedHtml = {
  meetings: Record<string, { prep: string | null; summary: string | null; shared: string | null }>;
  trends: Record<string, string | null>;
  checkins: Record<string, string | null>;
  privateProfile: string | null;
};

export const COACH_TABS = [
  { id: "next", label: "Next 1-1" },
  { id: "log", label: "1-1 Log" },
  { id: "goals", label: "Goals" },
  { id: "person", label: "Person" },
  { id: "performance", label: "Performance" },
  { id: "insights", label: "Insights" },
] as const;

export type CoachTab = (typeof COACH_TABS)[number]["id"];

export function validTab(raw: string | undefined): CoachTab {
  return COACH_TABS.some((t) => t.id === raw) ? (raw as CoachTab) : "next";
}

export type ActionResult = { ok: true } | { ok: false; error: string };

// K.5: the private summary, the coaching-mode estimate, the OCEAN read and the
// trend report keep landing in their tables, but none of them is the point of
// the page, and none of them is ever shown to the member. One sentence says so
// wherever the coach would otherwise look for them; the stored text is a click
// away rather than deleted.
export const STORED_NOT_SHOWN_NOTE =
  "A private summary, coaching-mode estimate and monthly trend are stored for this 1-1 and not shown. Ask if you want them surfaced.";

export const OCEAN_LABELS: Record<OceanDimensionKey, string> = {
  openness: "Openness",
  conscientiousness: "Conscientiousness",
  extraversion: "Extraversion",
  agreeableness: "Agreeableness",
  neuroticism: "Neuroticism",
};
