"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import { Badge } from "@/kernel/ui/Badge";
import { formatCents, humanize } from "@/kernel/ui/format";
import { dealPath } from "@/entities/company-os/lib/slug";
import type { KanbanColumn } from "@/kernel/ui/KanbanBoard";
import type { DealCard, MoveOpts } from "./deals/types";
import { moveDealStage, decideHandoff } from "./deals/actions";

// The cockpit reuses the board's DealDetail drawer but never the board itself,
// so load it lazily: the drawer (its autosave and field components) stays out
// of the cockpit's first-load JS and only mounts on a click.
const DealDetail = dynamic(() => import("./deals/DealDetail").then((m) => m.DealDetail), {
  loading: () => <div className="admin-empty">Loading…</div>,
});

export type CockpitDeal = {
  id: string;
  title: string;
  stage: string;
  usd: number | null;
  nextStep: string | null;
  gaps: string[];
};

// The cockpit's priority list. Clicking a deal opens it in the side car with the
// *same* editable deal shelf the pipeline board uses (the shared DealDetail),
// so the cockpit and the board are identical. Mutations refresh server data.
export function CockpitDeals({
  deals,
  cards,
  stages,
  lostStageIds,
  wonStageIds,
}: {
  deals: CockpitDeal[];
  cards: DealCard[];
  stages: KanbanColumn[];
  lostStageIds: string[];
  wonStageIds: string[];
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const selected = cards.find((c) => c.id === selectedId) ?? null;
  const lostSet = new Set(lostStageIds);
  const wonSet = new Set(wonStageIds);

  function close() {
    setSelectedId(null);
    setBanner(null);
  }

  async function changeStage(cardId: string, toStageId: string, opts?: MoveOpts) {
    setBanner(null);
    const card = cards.find((c) => c.id === cardId);
    if (card?.handoffStatus === "pending") {
      const r = await decideHandoff(cardId, "accepted");
      if (!r.ok) {
        setBanner(r.error);
        return;
      }
    }
    const r = await moveDealStage(cardId, toStageId, opts?.lostReason, opts?.wonAmount);
    if (!r.ok) {
      setBanner(r.error);
      return;
    }
    // A won/lost deal leaves the open-pipeline cockpit — close the drawer so
    // the move reads as done instead of silently snapping the select back.
    if (wonSet.has(toStageId) || lostSet.has(toStageId)) close();
    router.refresh();
  }

  async function decide(cardId: string, decision: "accepted" | "rejected", rejectReason?: string) {
    setBanner(null);
    const r = await decideHandoff(cardId, decision, rejectReason);
    if (!r.ok) {
      setBanner(r.error);
      return;
    }
    if (decision === "rejected") close();
    router.refresh();
  }

  if (deals.length === 0) {
    return (
      <div className="admin-empty">
        Every open deal has an owner, a value, a next step, and a date. Nice.
      </div>
    );
  }

  return (
    <>
      <div className="admin-table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Deal</th>
              <th>Stage</th>
              <th className="u-right">Value</th>
              <th>Missing</th>
              <th>Current next step</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((d) => (
              <tr
                key={d.id}
                className="is-clickable"
                tabIndex={0}
                role="button"
                aria-haspopup="dialog"
                onClick={() => setSelectedId(d.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedId(d.id);
                  }
                }}
              >
                <td className="admin-cell-strong">{d.title}</td>
                <td className="admin-cell-muted">{d.stage}</td>
                <td className="admin-cell-mono u-right">
                  {formatCents(d.usd)}
                </td>
                <td>
                  <div className="u-row u-wrap">
                    {d.gaps.map((g) => (
                      <Badge key={g} tone="warn">
                        {g}
                      </Badge>
                    ))}
                  </div>
                </td>
                <td className="admin-cell-muted u-max-5">
                  {d.nextStep ? d.nextStep : <span className="u-faint">none set</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DetailDrawer
        open={!!selected}
        onClose={close}
        eyebrow={selected ? humanize(selected.status ?? "") : ""}
        title={selected?.title || selected?.personName || "Deal"}
      >
        {selected && (
          <>
            <Link
              href={dealPath(selected.title || selected.personName || selected.companyName || "", selected.id)}
              className="admin-btn admin-btn--sm admin-deal-open-link u-mb-3"
            >
              Open full deal ↗
            </Link>
            {banner && (
              <div className="admin-alert admin-alert--err u-mb-3">
                {banner}
              </div>
            )}
            <DealDetail
              card={selected}
              stages={stages}
              lostSet={lostSet}
              wonSet={wonSet}
              onChangeStage={changeStage}
              onDecideHandoff={decide}
              onPatch={() => router.refresh()}
              onRemove={() => {
                close();
                router.refresh();
              }}
              onClose={close}
            />
          </>
        )}
      </DetailDrawer>
    </>
  );
}
