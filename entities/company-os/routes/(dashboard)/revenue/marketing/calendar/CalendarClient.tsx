"use client";

import { useState } from "react";
import { ViewToggle } from "@/entities/company-os/ui/ViewToggle";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import {
  CHANNEL_LABEL,
  type BrandOption,
  type CalendarEntryRow,
  type PillarOption,
} from "@/entities/company-os/modules/campaigns/marketing-calendar";
import type { CampaignOption } from "@/entities/company-os/modules/campaigns/marketing-campaigns";
import type { BrandStylePrefs } from "@/entities/company-os/modules/campaigns/style-catalogues";
import { NewEntryForm } from "./NewEntryForm";
import { PillarManager } from "./PillarManager";
import { CalendarBoard } from "./CalendarBoard";
import { CalendarMonth } from "./CalendarMonth";
import { EntryDrawer } from "./EntryDrawer";
import { moveEntry } from "./actions";


export function CalendarClient({
  initialEntries,
  brands,
  initialPillars,
  stylePrefs,
  campaigns,
}: {
  initialEntries: CalendarEntryRow[];
  brands: BrandOption[];
  initialPillars: PillarOption[];
  stylePrefs: BrandStylePrefs[];
  campaigns: CampaignOption[];
}) {
  const [entries, setEntries] = useState<CalendarEntryRow[]>(initialEntries);
  const [pillars, setPillars] = useState<PillarOption[]>(initialPillars);
  const [pillarFilter, setPillarFilter] = useState<string | null>(null);
  const [campaignFilter, setCampaignFilter] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);

  const selected = entries.find((e) => e.id === selectedId) ?? null;
  const visible = entries.filter(
    (e) =>
      (!pillarFilter || e.pillarId === pillarFilter) &&
      (!campaignFilter || e.campaignId === campaignFilter),
  );

  function move(id: string, status: string) {
    const prev = entries;
    setEntries((es) => es.map((e) => (e.id === id ? { ...e, status: status as CalendarEntryRow["status"] } : e)));
    setBanner(null);
    moveEntry(id, status).then((r) => {
      if (!r.ok) {
        setEntries(prev);
        setBanner({ ok: false, text: `Couldn't move: ${r.error}` });
      }
    });
  }

  function patch(id: string, partial: Partial<CalendarEntryRow>) {
    setEntries((es) => es.map((e) => (e.id === id ? { ...e, ...partial } : e)));
  }

  function remove(id: string) {
    setEntries((es) => es.filter((e) => e.id !== id));
    setSelectedId(null);
  }

  function linkBroadcast(id: string, broadcastId: string) {
    patch(id, { broadcastId, broadcastStatus: "draft" });
  }

  function add(entry: CalendarEntryRow) {
    setEntries((es) => [...es, entry]);
  }

  function replaceAll(next: CalendarEntryRow[]) {
    setEntries(next);
  }

  function addPillar(p: PillarOption) {
    setPillars((ps) => [...ps, p]);
  }

  function removePillar(id: string) {
    setPillars((ps) => ps.filter((p) => p.id !== id));
    if (pillarFilter === id) setPillarFilter(null);
  }

  return (
    <>
      {banner && (
        <div className={`admin-alert ${banner.ok ? "admin-alert--ok" : "admin-alert--err"} u-mb-3`}>
          {banner.text}
        </div>
      )}

      <section className="admin-card admin-section-card">
        <div className="admin-card-title">New entry</div>
        <NewEntryForm brands={brands} pillars={pillars} onCreated={add} />
      </section>

      <section className="admin-card admin-section-card">
        <div className="admin-card-title">Pillars</div>
        <PillarManager brands={brands} pillars={pillars} onCreated={addPillar} onRemoved={removePillar} />
      </section>

      {pillars.length > 0 && (
        <div className="u-row u-wrap u-m-0 u-mb-4">
          <button
            type="button"
            className={`admin-btn admin-btn--sm${pillarFilter === null ? " admin-btn--primary" : ""}`}
            onClick={() => setPillarFilter(null)}
          >
            All pillars
          </button>
          {pillars.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`admin-btn admin-btn--sm${pillarFilter === p.id ? " admin-btn--primary" : ""}`}
              onClick={() => setPillarFilter(p.id)}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      {campaigns.length > 0 && (
        <div className="u-row u-wrap u-m-0 u-mb-4">
          <button
            type="button"
            className={`admin-btn admin-btn--sm${campaignFilter === "" ? " admin-btn--primary" : ""}`}
            onClick={() => setCampaignFilter("")}
          >
            All campaigns
          </button>
          {campaigns.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`admin-btn admin-btn--sm${campaignFilter === c.id ? " admin-btn--primary" : ""}`}
              onClick={() => setCampaignFilter(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      <ViewToggle
        views={[
          {
            key: "board",
            label: "Board",
            content: <CalendarBoard entries={visible} onMove={move} onCardClick={setSelectedId} />,
          },
          {
            key: "calendar",
            label: "Calendar",
            content: (
              <div className="admin-card admin-section-card">
                <h2 className="admin-card-title">Publish calendar</h2>
                <CalendarMonth entries={visible} onSelect={setSelectedId} />
              </div>
            ),
          },
        ]}
      />

      <DetailDrawer
        open={!!selected}
        onClose={() => setSelectedId(null)}
        eyebrow={selected ? CHANNEL_LABEL[selected.channel] : ""}
        title={selected?.title ?? "Entry"}
      >
        {selected && (
          <EntryDrawer
            entry={selected}
            brands={brands}
            pillars={pillars}
            stylePrefs={stylePrefs}
            allEntries={entries}
            onPatched={patch}
            onDeleted={remove}
            onLinkedBroadcast={linkBroadcast}
            onRepurposed={replaceAll}
          />
        )}
      </DetailDrawer>
    </>
  );
}
