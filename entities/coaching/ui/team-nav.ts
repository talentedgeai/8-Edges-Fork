// What this entity contributes to the team hub's navigation (ADR 0002). The
// shell owns the information architecture (kernel/shell/team-ia.ts) and names
// the slots; this file names the rows that belong in them. A row with a `when`
// key appears only for a viewer who holds that capability.
import type { NavContribution } from "@/kernel/shell/nav";

export const teamNav: NavContribution[] = [
  { section: null, group: "Me", order: 10, items: [
    { label: "My Coach", href: "/team/my-coaching", ico: "◎", enabled: true },
    { label: "My FAST Goals", href: "/team/goals", ico: "◉", enabled: true },
  ] },
  { section: null, group: "My Team", order: 10, items: [
    { label: "Coaching", href: "/team/coaching", ico: "◎", enabled: true, when: "coach" },
  ] },
  { section: null, group: "Company", order: 30, items: [
    { label: "AIO Group Coaching", href: "/team/coaching-sessions", ico: "☰", enabled: true },
  ] },
];
