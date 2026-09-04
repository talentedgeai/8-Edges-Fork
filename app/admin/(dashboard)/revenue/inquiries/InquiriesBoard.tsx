"use client";

import { useState } from "react";
import { KanbanBoard, type KanbanColumn } from "@/components/admin/KanbanBoard";
import { STAGE_LEAD, STAGE_NEUTRAL, STAGE_WON, STAGE_LOST } from "@/lib/admin/stageColors";
import { DetailDrawer } from "@/components/admin/DetailDrawer";
import { Badge, statusTone } from "@/components/admin/Badge";
import { humanize, timeAgo } from "@/lib/admin/format";
import {
  moveInquiryStatus,
  archiveInquiry,
  markInquirySpam,
  promoteInquiryToLead,
  replyToInquiry,
} from "./actions";

export type InquiryCard = {
  id: string;
  columnId: string;
  type: string | null;
  subject: string | null;
  message: string | null;
  source: string | null;
  created_at: string;
  deal_id: string | null;
  personId: string | null;
  personName: string | null;
  personEmail: string | null;
  doNotContact: boolean;
};

const COLUMNS: KanbanColumn[] = [
  { id: "new_lead", label: "New inquiry", accent: STAGE_LEAD },
  { id: "contacted", label: "Contacted", accent: STAGE_NEUTRAL },
  { id: "qualified", label: "Promote to lead", accent: STAGE_WON },
  { id: "no_action", label: "No action", accent: STAGE_LOST },
];

export function InquiriesBoard({ initialCards }: { initialCards: InquiryCard[] }) {
  const [cards, setCards] = useState<InquiryCard[]>(initialCards);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);

  const selected = cards.find((c) => c.id === selectedId) ?? null;

  function move(cardId: string, toColumnId: string) {
    const prev = cards;
    setCards((cs) => cs.map((c) => (c.id === cardId ? { ...c, columnId: toColumnId } : c)));
    setBanner(null);
    // Dropping on "Promote to lead" is more than a status change: the person
    // also joins the SDR queue on /admin/revenue/leads.
    const action =
      toColumnId === "qualified" ? promoteInquiryToLead(cardId) : moveInquiryStatus(cardId, toColumnId);
    action.then((r) => {
      if (!r.ok) {
        setCards(prev);
        setBanner({ ok: false, text: `Couldn't move card: ${r.error}` });
      } else if (toColumnId === "qualified") {
        setBanner({ ok: true, text: "Promoted: this contact is now in the lead queue." });
      }
    });
  }

  function remove(cardId: string, kind: "archive" | "spam") {
    const prev = cards;
    setCards((cs) => cs.filter((c) => c.id !== cardId));
    setSelectedId(null);
    const action = kind === "spam" ? markInquirySpam(cardId) : archiveInquiry(cardId);
    action.then((r) => {
      if (!r.ok) {
        setCards(prev);
        setBanner({ ok: false, text: `Couldn't ${kind === "spam" ? "mark as spam" : "archive"}: ${r.error}` });
      }
    });
  }

  return (
    <>
      {banner && (
        <div
          className={`admin-alert ${banner.ok ? "admin-alert--ok" : "admin-alert--err"} u-mb-3`}
        >
          {banner.text}
        </div>
      )}

      <KanbanBoard<InquiryCard>
        columns={COLUMNS}
        cards={cards}
        onMove={move}
        onCardClick={(c) => setSelectedId(c.id)}
        renderCard={(c) => (
          <>
            <div className="admin-kanban-card-title">{c.personName || c.personEmail || "(unknown)"}</div>
            <div className="admin-kanban-card-sub">{c.subject || humanize(c.type)}</div>
            <div className="admin-kanban-card-meta">
              {c.type && <Badge>{humanize(c.type)}</Badge>}
              {c.doNotContact && <Badge tone="err">DNC</Badge>}
              <span className="admin-kanban-card-sub u-ml-auto">
                {timeAgo(c.created_at)}
              </span>
            </div>
          </>
        )}
      />

      <DetailDrawer
        open={!!selected}
        onClose={() => setSelectedId(null)}
        eyebrow={selected ? humanize(selected.type) : ""}
        title={selected?.personName || selected?.personEmail || "Inquiry"}
      >
        {selected && (
          <InquiryDetail
            card={selected}
            onPromote={() => move(selected.id, "qualified")}
            onArchive={() => remove(selected.id, "archive")}
            onSpam={() => remove(selected.id, "spam")}
          />
        )}
      </DetailDrawer>
    </>
  );
}

function InquiryDetail({
  card,
  onPromote,
  onArchive,
  onSpam,
}: {
  card: InquiryCard;
  onPromote: () => void;
  onArchive: () => void;
  onSpam: () => void;
}) {
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState(card.subject ? `Re: ${card.subject}` : "Re: your inquiry");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function send(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setMsg(null);
    replyToInquiry({ to: card.personEmail, subject, body, doNotContact: card.doNotContact }).then((r) => {
      setSending(false);
      if (r.ok) {
        setMsg({ ok: true, text: "Reply sent." });
        setBody("");
      } else {
        setMsg({ ok: false, text: r.error });
      }
    });
  }

  return (
    <div className="u-stack ">
      <dl className="admin-kv">
        <dt>Status</dt>
        <dd>
          <Badge tone={statusTone(card.columnId)}>{humanize(card.columnId)}</Badge>
        </dd>
        <dt>Email</dt>
        <dd>{card.personEmail || "—"}</dd>
        <dt>Source</dt>
        <dd>{card.source || "—"}</dd>
        <dt>Received</dt>
        <dd>{timeAgo(card.created_at)}</dd>
      </dl>

      {card.message && (
        <div>
          <div className="admin-label u-mb-1">
            Message
          </div>
          <div className="admin-card u-p-3 u-prewrap">
            {card.message}
          </div>
        </div>
      )}

      <div className="admin-form-actions">
        {card.columnId !== "qualified" && (
          <button type="button" className="admin-btn admin-btn--primary" onClick={onPromote}>
            Promote to lead
          </button>
        )}
        <button type="button" className="admin-btn" onClick={onArchive}>
          Archive
        </button>
        <button type="button" className="admin-btn admin-btn--danger" onClick={onSpam}>
          Mark as spam
        </button>
      </div>

      <form className="admin-form" onSubmit={send}>
        <div className="admin-label">Reply by email</div>
        {card.doNotContact && (
          <div className="admin-alert admin-alert--err">
            This contact is marked do-not-contact — replies are disabled.
          </div>
        )}
        {msg && <div className={`admin-alert ${msg.ok ? "admin-alert--ok" : "admin-alert--err"}`}>{msg.text}</div>}
        <input
          className="admin-input"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          disabled={card.doNotContact}
        />
        <textarea
          className="admin-textarea"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a reply…"
          disabled={card.doNotContact}
        />
        <div className="admin-form-actions">
          <button
            type="submit"
            className="admin-btn admin-btn--primary"
            disabled={sending || card.doNotContact || !body.trim()}
          >
            {sending ? "Sending…" : "Send reply"}
          </button>
        </div>
      </form>
    </div>
  );
}
