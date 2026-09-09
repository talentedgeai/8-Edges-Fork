"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import {
  CHANNELS,
  STATUS_LABEL,
  type CalendarChannel,
  type CalendarEntryRow,
} from "@/entities/company-os/modules/campaigns/marketing-calendar";
import { AssetsList } from "./AssetsList";

// The campaign's assets grouped by channel, with the "add an asset" form. Split
// out of CampaignHub so that file stays the tab shell and the header form.
export function AssetsByChannel({
  campaignId,
  entries,
  addOpen,
  setAddOpen,
  newTitle,
  setNewTitle,
  newChannel,
  setNewChannel,
  newDate,
  setNewDate,
  addAsset,
  pending,
}: {
  campaignId: string;
  entries: CalendarEntryRow[];
  addOpen: boolean;
  setAddOpen: (v: boolean) => void;
  newTitle: string;
  setNewTitle: (v: string) => void;
  newChannel: CalendarChannel;
  setNewChannel: (v: CalendarChannel) => void;
  newDate: string;
  setNewDate: (v: string) => void;
  addAsset: () => void;
  pending: boolean;
}) {
  const channelCount = new Set(entries.map((a) => a.channel)).size;

  // Card vs list, remembered per operator. Card is the default: it shows the
  // asset image, which is the fastest way to see a campaign's visual state.
  const [view, setView] = useState<"card" | "list">("card");
  useEffect(() => {
    const saved = window.localStorage.getItem("mcr-assets-view");
    if (saved === "card" || saved === "list") setView(saved);
  }, []);
  function pickView(v: "card" | "list") {
    setView(v);
    window.localStorage.setItem("mcr-assets-view", v);
  }

  return (
    <div className="u-stack u-gap-4">
      <div className="u-row u-wrap u-between">
        <div className="admin-page-sub">
          {entries.length} asset{entries.length === 1 ? "" : "s"} across {channelCount} channel
          {channelCount === 1 ? "" : "s"}.
        </div>
        <div className="admin-campaign-toolbar-actions">
          <div className="admin-viewtoggle" role="group" aria-label="Asset view">
            <button type="button" className={view === "card" ? "is-active" : ""} onClick={() => pickView("card")} aria-pressed={view === "card"}>
              Cards
            </button>
            <button type="button" className={view === "list" ? "is-active" : ""} onClick={() => pickView("list")} aria-pressed={view === "list"}>
              List
            </button>
          </div>
          <button type="button" className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => setAddOpen(!addOpen)} disabled={pending}>
            {addOpen ? "Close" : "+ Add asset"}
          </button>
        </div>
      </div>

      {addOpen && (
        <section className="admin-card u-p-4">
          <div className="admin-form">
            <div className="admin-field u-row u-items-end u-gap-3 u-wrap">
              <div className="u-flex-2">
                <label className="admin-label" htmlFor="a-title">Title</label>
                <input id="a-title" className="admin-input" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="What is a centaur team?" />
              </div>
              <div className="u-flex-1">
                <label className="admin-label" htmlFor="a-channel">Channel</label>
                <select id="a-channel" className="admin-input" value={newChannel} onChange={(e) => setNewChannel(e.target.value as CalendarChannel)}>
                  {CHANNELS.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="u-flex-1">
                <label className="admin-label" htmlFor="a-date">Publish date</label>
                <input id="a-date" className="admin-input" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
              </div>
            </div>
            <div className="admin-form-actions">
              <button type="button" className="admin-btn admin-btn--primary" onClick={addAsset} disabled={pending || !newTitle.trim()}>
                {pending ? "Adding…" : "Add asset"}
              </button>
            </div>
          </div>
        </section>
      )}

      {entries.length === 0 ? (
        <div className="admin-empty">No assets yet. Use “Draft all assets with AI” above, or add one manually.</div>
      ) : view === "card" ? (
        <div className="admin-campaign-lanes">
          {CHANNELS.map((ch) => {
            const lane = entries.filter((a) => a.channel === ch.id);
            return (
              <div key={ch.id} className="admin-card admin-campaign-lane">
                <div className="admin-campaign-lane-head">
                  <span className="admin-chip">{ch.label}</span>
                  <span className="admin-cell-muted">{lane.length}</span>
                </div>
                {lane.length === 0 ? (
                  <div className="admin-cell-muted u-sm admin-cell-muted--dash">—</div>
                ) : (
                  lane.map((a) => (
                    <Link
                      key={a.id}
                      className="admin-campaign-asset"
                      href={`/admin/revenue/marketing/campaigns/${campaignId}/assets/${a.id}`}
                    >
                      {a.imageUrl ? (
                        <span className="admin-campaign-asset-cover">
                          {/* eslint-disable-next-line @next/next/no-img-element -- uploaded file of unknown size; next/image needs fixed dimensions */}
                          <img src={a.imageUrl} alt="" loading="lazy" />
                        </span>
                      ) : (
                        <span className="admin-campaign-asset-cover admin-campaign-asset-cover--empty">No image</span>
                      )}
                      <span className="admin-campaign-asset-title">{a.title}</span>
                      <span className="admin-campaign-asset-foot">
                        {a.channel === "email" && a.broadcastId ? (
                          <span className="admin-chip admin-chip--accent">Broadcast</span>
                        ) : (
                          <Badge tone={statusTone(a.status)}>{STATUS_LABEL[a.status]}</Badge>
                        )}
                        <span className="admin-campaign-asset-date">
                          {a.publishDate ? `Publishes ${formatDate(a.publishDate)}` : "No date"}
                        </span>
                      </span>
                    </Link>
                  ))
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <AssetsList campaignId={campaignId} entries={entries} />
      )}
    </div>
  );
}
