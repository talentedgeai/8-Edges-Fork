// What this entity contributes to the team hub's navigation (ADR 0002). The
// shell owns the information architecture (kernel/shell/team-ia.ts) and names
// the slots; this file names the rows that belong in them. A row with a `when`
// key appears only for a viewer who holds that capability.
import type { NavContribution } from "@/kernel/shell/nav";

import { ONBOARDING_DECK_URL } from "@/kernel/config/organisation";

export const teamNav: NavContribution[] = [
  { section: null, group: null, order: 10, items: [
    { label: "Home", href: "/team", ico: "◈", enabled: true },
  ] },
  { section: null, group: "Me", order: 30, items: [
    { label: "Reviews", href: "/team/reviews", ico: "★", enabled: true },
  ] },
  { section: null, group: "Me", order: 50, items: [
    { label: "Profile", href: "/team/profile", ico: "☺", enabled: true },
    { label: "My Equipment", href: "/team/equipment", ico: "▤", enabled: true },
  ] },
  { section: null, group: "My Team", order: 30, items: [
    { label: "Approvals", href: "/team/approvals", ico: "✓", when: "manages" },
  ] },
  { section: null, group: "Company", order: 20, items: [
    { label: "Directory", href: "/team/directory", ico: "☷", enabled: true },
    { label: "Gallery", href: "/team/gallery", ico: "▦", enabled: true },
  ] },
  { section: null, group: "Company", order: 40, items: [
    { label: "Onboarding Deck", href: "/team/onboarding-deck", ico: "▷", enabled: Boolean(ONBOARDING_DECK_URL) },
  ] },
];
