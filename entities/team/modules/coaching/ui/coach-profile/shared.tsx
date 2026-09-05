"use client";

import type { OceanDimensionKey } from "../../types";

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

export const OCEAN_LABELS: Record<OceanDimensionKey, string> = {
  openness: "Openness",
  conscientiousness: "Conscientiousness",
  extraversion: "Extraversion",
  agreeableness: "Agreeableness",
  neuroticism: "Neuroticism",
};
