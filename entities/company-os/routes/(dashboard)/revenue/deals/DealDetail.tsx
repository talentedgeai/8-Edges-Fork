"use client";

import Link from "next/link";
import type { KanbanColumn } from "@/kernel/ui/KanbanBoard";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { humanize } from "@/kernel/ui/format";
import { DealCommunications, ReferrerCompanyField, ReferrerField } from "./DealFields";
import { DealHandoffBanner } from "./DealHandoffBanner";
import { DealStageControls } from "./DealStageControls";
import { DealFieldsForm } from "./DealFieldsForm";
import { DealDangerZone } from "./DealDangerZone";
import type { DealCard, MoveOpts } from "./types";

// The deal shelf: opened from a card on the pipeline board and from the revenue
// cockpit (CockpitDeals loads it lazily). It composes the handoff banner, the
// stage controls, the read-only facts, the referrer fields, the autosaving
// field form, communications and the danger zone; each piece owns its own
// state, and every write goes back to the board through onPatch / onChangeStage.
export function DealDetail({
  card,
  stages,
  lostSet,
  wonSet,
  onChangeStage,
  onDecideHandoff,
  onPatch,
  onRemove,
  onClose,
}: {
  card: DealCard;
  stages: KanbanColumn[];
  lostSet: Set<string>;
  wonSet: Set<string>;
  onChangeStage: (cardId: string, toStageId: string, opts?: MoveOpts) => void;
  onDecideHandoff: (cardId: string, decision: "accepted" | "rejected", rejectReason?: string) => void;
  onPatch: (patch: Partial<DealCard>) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const archived = !!card.archivedAt;
  const pendingHandoff = card.handoffStatus === "pending";

  return (
    <>
      <DealHandoffBanner card={card} onDecideHandoff={onDecideHandoff} />

      <DealStageControls
        card={card}
        stages={stages}
        lostSet={lostSet}
        wonSet={wonSet}
        onChangeStage={onChangeStage}
        onPatch={onPatch}
        onClose={onClose}
      />

      <dl className="admin-kv u-mb-4">
        <dt>Status</dt>
        <dd>
          <Badge tone={statusTone(card.status ?? "")}>{humanize(card.status)}</Badge>
          {pendingHandoff && (
            <>
              {" "}
              <Badge tone="warn">Handoff pending</Badge>
            </>
          )}
          {archived && (
            <>
              {" "}
              <Badge tone="neutral">Archived</Badge>
            </>
          )}
        </dd>
        <dt>Company</dt>
        <dd>{card.companyName || "—"}</dd>
        <dt>Contact</dt>
        <dd>
          {card.personId ? (
            <Link href={`/admin/contacts/${card.personId}`} className="admin-cell-strong">
              {card.personName || "View contact"}
            </Link>
          ) : (
            card.personName || "—"
          )}
        </dd>
        {card.lostReason && (
          <>
            <dt>Lost reason</dt>
            <dd>{humanize(card.lostReason)}</dd>
          </>
        )}
      </dl>

      <ReferrerField
        dealId={card.id}
        referrerId={card.referrerId}
        referrerName={card.referrerName}
        onChange={(referrerId, referrerName) => onPatch({ referrerId, referrerName })}
      />

      <ReferrerCompanyField
        dealId={card.id}
        referrerCompanyId={card.referrerCompanyId}
        referrerCompanyName={card.referrerCompanyName}
        onChange={(referrerCompanyId, referrerCompanyName) => onPatch({ referrerCompanyId, referrerCompanyName })}
      />


      <DealFieldsForm card={card} onPatch={onPatch} />

      <DealCommunications dealId={card.id} />

      <DealDangerZone card={card} onPatch={onPatch} onRemove={onRemove} onClose={onClose} />
    </>
  );
}
