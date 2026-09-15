import { PillTabs } from "@/kernel/ui/dash/PillTabs";

// The Edges Workboard's views (RH-6): the board itself, and Flow, which reads
// the same cards as work in motion.
const TABS = [
  { href: "/admin/edges/workboard", label: "Board", exact: true },
  { href: "/admin/edges/workboard/flow", label: "Flow" },
];

export function WorkboardTabs() {
  return <PillTabs tabs={TABS} ariaLabel="Workboard views" />;
}
