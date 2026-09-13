// What this entity contributes to the Admin shell's navigation (ADR 0002).
// The shell owns the information architecture (kernel/shell/admin-ia.ts) and
// names the slots; this file names the rows that belong in them. Drop the entity
// from a deployment and these rows go with it.
import type { NavContribution } from "@/kernel/shell/nav";
import { ONBOARDING_DECK_URL } from "@/kernel/config/organisation";

export const adminNav: NavContribution[] = [
  { section: "Operating System", group: "Company", order: 10, items: [
    { label: "Strategy", href: "/admin/company/strategy", ico: "◆", enabled: true },
    { label: "Company Goals", href: "/admin/company/goals", ico: "⊚", enabled: true },
    { label: "Core Values", href: "/admin/company/values", ico: "♥", enabled: true },
    { label: "Org Chart", href: "/admin/company/org", ico: "⌥", enabled: true },
    // Muted until the deck is configured, rather than a dead link to nothing.
    { label: "Onboarding Deck", href: "/admin/company/onboarding-deck", ico: "▷", enabled: Boolean(ONBOARDING_DECK_URL) },
  ] },
  { section: "Four Offices", group: "Talent", subheading: "People", order: 10, items: [
    { label: "Team", href: "/admin/talent/team", ico: "☷", enabled: true },
  ] },
  { section: "Four Offices", group: "Talent", subheading: "People", order: 30, items: [
    { label: "Probation", href: "/admin/talent/probation", ico: "◔", enabled: true },
  ] },
  { section: "Four Offices", group: "Operations", subheading: "Workplace", order: 10, items: [
    { label: "Equipment", href: "/admin/operations/equipment", ico: "▤", enabled: true },
  ] },
  { section: "Four Offices", group: "Operations", subheading: "Workplace", order: 40, items: [
    { label: "Surveys", href: "/admin/operations/surveys", ico: "✎", enabled: true },
  ] },
];
