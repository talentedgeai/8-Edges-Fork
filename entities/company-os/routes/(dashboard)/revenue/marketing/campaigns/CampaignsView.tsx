"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import { CHANNEL_LABEL, type CalendarEntryRow } from "@/entities/company-os/modules/campaigns/marketing-calendar";
import type { MarketingCampaignRow, MarketingCampaignStatus } from "@/entities/company-os/modules/campaigns/marketing-campaigns";
import { CalendarMonth } from "../calendar/CalendarMonth";

const STATUS_TONE: Record<MarketingCampaignStatus, "ok" | "warn" | "err" | "info"> = {
  draft: "info",
  active: "warn",
  done: "ok",
  archived: "info",
};
const STATUS_LABEL: Record<MarketingCampaignStatus, string> = {
  draft: "Draft",
  active: "Active",
  done: "Done",
  archived: "Archived",
};
const STATUS_ORDER: Record<MarketingCampaignStatus, number> = {
  draft: 0, active: 1, done: 2, archived: 3,
};

type SortKey = "name" | "status" | "start" | "progress";

export function CampaignsView({
  rows,
  entries,
}: {
  rows: MarketingCampaignRow[];
  entries: CalendarEntryRow[];
}) {
  const router = useRouter();
  const [view, setView] = useState<"list" | "calendar">("list");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "start", dir: "desc" });
  const [brandFilter, setBrandFilter] = useState<string | null>(null);

  // Brands that actually have campaigns, so the filter never shows a dead option.
  const brands = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) if (r.brandId) seen.set(r.brandId, r.brandName ?? "Unnamed");
    return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const brandRows = brandFilter ? rows.filter((r) => r.brandId === brandFilter) : rows;
  const brandEntries = brandFilter ? entries.filter((e) => e.brandId === brandFilter) : entries;

  function onSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));
  }
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === "desc" ? " ↓" : " ↑") : "");

  const sorted = [...brandRows].sort((a, b) => {
    let d = 0;
    if (sort.key === "name") d = a.name.localeCompare(b.name);
    else if (sort.key === "status") d = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    else if (sort.key === "progress") {
      const pa = a.assetCount === 0 ? 0 : a.builtCount / a.assetCount;
      const pb = b.assetCount === 0 ? 0 : b.builtCount / b.assetCount;
      d = pa - pb;
    } else {
      // Start date; dateless campaigns sink to the bottom regardless of direction.
      const av = a.startsOn;
      const bv = b.startsOn;
      if (!av && !bv) d = 0;
      else if (!av) return 1;
      else if (!bv) return -1;
      else d = av.localeCompare(bv);
    }
    return sort.dir === "desc" ? -d : d;
  });

  return (
    <>
      <div className="admin-campaign-toolbar u-mb-4">
        {brands.length > 1 ? (
          <div className="admin-campaign-chip-row">
            <button
              type="button"
              className={`admin-btn admin-btn--sm${brandFilter === null ? " admin-btn--primary" : ""}`}
              onClick={() => setBrandFilter(null)}
            >
              All brands
            </button>
            {brands.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`admin-btn admin-btn--sm${brandFilter === b.id ? " admin-btn--primary" : ""}`}
                onClick={() => setBrandFilter(b.id)}
              >
                {b.name}
              </button>
            ))}
          </div>
        ) : (
          <div />
        )}
        <div className="admin-viewtoggle" role="group" aria-label="Campaigns view">
          <button type="button" className={view === "list" ? "is-active" : ""} onClick={() => setView("list")} aria-pressed={view === "list"}>
            List
          </button>
          <button type="button" className={view === "calendar" ? "is-active" : ""} onClick={() => setView("calendar")} aria-pressed={view === "calendar"}>
            Calendar
          </button>
        </div>
      </div>

      {view === "calendar" ? (
        <div className="admin-card admin-section-card">
          <div className="admin-card-title">Publish calendar</div>
          <p className="admin-page-sub u-mt-1 u-mb-3">
            Every campaign asset by publish date. Click one to open it.
          </p>
          {brandEntries.length === 0 ? (
            <div className="admin-empty">No dated assets yet.</div>
          ) : (
            <CalendarMonth
              entries={brandEntries}
              onSelect={(id) => {
                const e = brandEntries.find((x) => x.id === id);
                if (e?.campaignId) router.push(`/admin/revenue/marketing/campaigns/${e.campaignId}/assets/${id}`);
              }}
            />
          )}
        </div>
      ) : (
        <div className="admin-table-wrap">
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th><button type="button" className="admin-th-sort" onClick={() => onSort("name")}>Campaign{arrow("name")}</button></th>
                  <th><button type="button" className="admin-th-sort" onClick={() => onSort("status")}>Status{arrow("status")}</button></th>
                  <th><button type="button" className="admin-th-sort" onClick={() => onSort("start")}>Start{arrow("start")}</button></th>
                  <th>Channels</th>
                  <th><button type="button" className="admin-th-sort" onClick={() => onSort("progress")}>Build progress{arrow("progress")}</button></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => {
                  const pct = c.assetCount === 0 ? 0 : Math.round((c.builtCount / c.assetCount) * 100);
                  return (
                    <tr key={c.id}>
                      <td className="admin-cell-strong">
                        <Link href={`/admin/revenue/marketing/campaigns/${c.id}`}>{c.name}</Link>
                        <div className="admin-cell-muted u-mt-1">
                          {[c.objective, c.pillarName ? `Pillar: ${c.pillarName}` : null, c.brandName]
                            .filter(Boolean)
                            .join(" · ") || "No goal set"}
                        </div>
                      </td>
                      <td>
                        <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                      </td>
                      <td className="admin-cell-mono">{formatDate(c.startsOn)}</td>
                      <td>
                        <div className="admin-campaign-chip-row">
                          {c.channels.length === 0 ? (
                            <span className="admin-cell-muted">—</span>
                          ) : (
                            c.channels.map((ch) => (
                              <span key={ch} className="admin-chip">
                                {CHANNEL_LABEL[ch]}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="u-min-2">
                        <div className="admin-campaign-progress">
                          <div className="admin-campaign-progress-track">
                            <div
                              className={`admin-campaign-progress-fill${pct === 100 ? " is-done" : ""}`}
                              style={{ width: `${pct}%` }} /* layout-ok: data-driven width */
                            />
                          </div>
                          <span className="admin-cell-mono admin-campaign-progress-num">
                            {c.builtCount}/{c.assetCount} built
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
