import { PillTabs } from "@/kernel/ui/dash/PillTabs";
import { surfaceBase } from "@/kernel/shell/surface";
import { RangePicker } from "@/kernel/ui/dash/RangePicker";
import { DEFAULT_RANGE, RANGES, RANGE_LABELS, type Range } from "@/entities/crm/lib/revenue-metrics/shared";

// The Revenue hub's tabs (RH-4). The sidebar's Revenue group is the catalogue
// of records; analysis lives here, one tab per question, each its own route.
// The period picker beside them rewrites one search param that every tab
// reads, and the tab links carry it so a range survives a tab change.
const TABS = [
  { href: "", label: "Overview", exact: true },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/demand", label: "Demand" },
  { href: "/billing", label: "Billing" },
  { href: "/market", label: "Market" },
  { href: "/data-health", label: "Data health" },
];

export function RevenueTabs({ range = DEFAULT_RANGE, showRange = true }: { range?: Range; showRange?: boolean }) {
  const q = range === DEFAULT_RANGE ? "" : `?range=${range}`;
  // PillTabs marks the active tab by comparing hrefs with the pathname, so the
  // tabs carry the viewer's surface rather than being rewritten by a link.
  const base = `${surfaceBase()}/revenue`;
  const tabs = TABS.map((t) => ({ ...t, href: t.exact ? `${base}${t.href}` : `${base}${t.href}${q}` }));
  return (
    <div className="dash-tabrow">
      <PillTabs tabs={tabs} ariaLabel="Revenue hub" />
      {showRange && <RangePicker options={RANGES.map((r) => ({ value: r, label: RANGE_LABELS[r] }))} current={range} />}
    </div>
  );
}
