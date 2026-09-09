"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import {
  CHANNEL_LABEL,
  STATUS_LABEL,
  type CalendarEntryRow,
  type CalendarStatus,
} from "@/entities/company-os/modules/campaigns/marketing-calendar";

// Flat, sortable table of every asset. Publish date is a first-class sortable
// column here (it is the "when" the card view only hints at).
export function AssetsList({ campaignId, entries }: { campaignId: string; entries: CalendarEntryRow[] }) {
  const router = useRouter();
  type SortKey = "title" | "channel" | "status" | "date";
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "date", dir: "asc" });

  function onSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === "desc" ? " ↓" : " ↑") : "");

  const STATUS_ORDER: Record<CalendarStatus, number> = {
    idea: 0, drafted: 1, approved: 2, scheduled: 3, published: 4, skipped: 5,
  };
  const rows = [...entries].sort((a, b) => {
    let d = 0;
    if (sort.key === "title") d = a.title.localeCompare(b.title);
    else if (sort.key === "channel") d = CHANNEL_LABEL[a.channel].localeCompare(CHANNEL_LABEL[b.channel]);
    else if (sort.key === "status") d = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    else {
      // Dateless assets sink to the bottom regardless of direction.
      const av = a.publishDate;
      const bv = b.publishDate;
      if (!av && !bv) d = 0;
      else if (!av) return 1;
      else if (!bv) return -1;
      else d = av.localeCompare(bv);
    }
    return sort.dir === "desc" ? -d : d;
  });

  return (
    <div className="admin-table-wrap">
      <div className="admin-table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th className="admin-th--xs">Image</th>
              <th><button type="button" className="admin-th-sort" onClick={() => onSort("title")}>Title{arrow("title")}</button></th>
              <th><button type="button" className="admin-th-sort" onClick={() => onSort("channel")}>Channel{arrow("channel")}</button></th>
              <th><button type="button" className="admin-th-sort" onClick={() => onSort("status")}>Status{arrow("status")}</button></th>
              <th><button type="button" className="admin-th-sort" onClick={() => onSort("date")}>Publish date{arrow("date")}</button></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr
                key={a.id}
                className="u-pointer"
                onClick={() => router.push(`/admin/revenue/marketing/campaigns/${campaignId}/assets/${a.id}`)}
              >
                <td>
                  {a.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- uploaded file of unknown size; next/image needs fixed dimensions
                    <img className="admin-campaign-asset-thumb" src={a.imageUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="admin-campaign-asset-thumb" aria-hidden />
                  )}
                </td>
                <td className="admin-cell-strong">{a.title}</td>
                <td>{CHANNEL_LABEL[a.channel]}</td>
                <td>
                  {a.channel === "email" && a.broadcastId ? (
                    <span className="admin-chip admin-chip--accent">Broadcast</span>
                  ) : (
                    <Badge tone={statusTone(a.status)}>{STATUS_LABEL[a.status]}</Badge>
                  )}
                </td>
                <td className="admin-cell-mono">{formatDate(a.publishDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
