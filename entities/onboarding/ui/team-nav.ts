// What this entity contributes to the team hub's navigation (ADR 0002). The
// shell owns the information architecture (kernel/shell/team-ia.ts) and names
// the slots; this file names the rows that belong in them. A row with a `when`
// key appears only for a viewer who holds that capability.
import type { NavContribution } from "@/kernel/shell/nav";

export const teamNav: NavContribution[] = [
  { section: null, group: "My Team", order: 25, items: [
    { label: "Onboarding", href: "/team/onboarding", ico: "◐", enabled: true, when: "manages" },
  ] },
];
