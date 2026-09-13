// What this entity contributes to the Admin shell's navigation (ADR 0002).
// The shell owns the information architecture (kernel/shell/admin-ia.ts) and
// names the slots; this file names the rows that belong in them. Drop the entity
// from a deployment and these rows go with it.
import type { NavContribution } from "@/kernel/shell/nav";

export const adminNav: NavContribution[] = [
  { section: "Operating System", group: "Edges", order: 20, items: [
    { label: "Workboard", href: "/admin/edges/workboard", ico: "▤", enabled: true },  // every open card, every board (WB-02)
  ] },
];
