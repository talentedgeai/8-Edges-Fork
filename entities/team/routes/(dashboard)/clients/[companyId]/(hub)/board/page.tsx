import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getClientBoardViewForActor, getActorClientCompanies, companyHasPrograms } from "@/entities/team/modules/hub/clients";
import { isBoardMemberForActor } from "@/entities/team/lib/boards";
import { MyCardsStrip, type MyStripCard } from "./MyCardsStrip";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import { NEW_ASSIGNMENT_DAYS, PRIORITY_LABEL, PRIORITY_TONE, initials, STAGE_WON, STAGE_LEAD, STAGE_NEUTRAL, STAGE_PROPOSAL, STAGE_DISCOVERY, STAGE_CONTRACT } from "@/entities/company-os";
import { moveCard } from "@/entities/team/lib/move-card";

export const metadata = { title: "Client Board" };

// The Board tab: exactly what the client sees on /portal/board (same shared
// view, same columns and cards, internal cards excluded). Read-only here; the
// full working board lives at /team/boards/[slug].

const NONDONE_ACCENTS = [STAGE_NEUTRAL, STAGE_LEAD, STAGE_PROPOSAL, STAGE_DISCOVERY, STAGE_CONTRACT];

export default async function TeamClientBoardTab({ params }: { params: { companyId: string } }) {
  const actor = await requireTeamMember();
  // Assignment gate first: an unassigned actor gets a 404 even to learn
  // whether a board exists.
  const companies = await getActorClientCompanies(actor);
  if (!companies.some((c) => c.id === params.companyId)) notFound();

  // With AI Programs present this tab is company-wide: only an untagged board
  // qualifies; program boards render in their AI Program view.
  const hasPrograms = await companyHasPrograms(params.companyId);
  const board = await getClientBoardViewForActor(actor, params.companyId, { untaggedOnly: hasPrograms });

  if (!board) {
    return (
      <div className="admin-card admin-section-card u-p-5">
        <p className="admin-page-sub u-m-0">
          {hasPrograms
            ? "No company-wide work board. Program boards live in their AI Program view."
            : "This client has no active work board yet."}
        </p>
      </div>
    );
  }

  let nd = 0;
  const accents = board.columns.map((c) =>
    c.isDone ? STAGE_WON : NONDONE_ACCENTS[nd++ % NONDONE_ACCENTS.length],
  );

  // Board members get quick move controls on their own open cards; everyone
  // else keeps the client's read-only view. moveCard re-checks membership
  // server-side, so this gate is UI only.
  const isMember = await isBoardMemberForActor(actor, board.boardId);
  const myCards: MyStripCard[] = isMember
    ? board.cards
        .filter((c) => !c.done && c.assigneeId === actor.personId)
        .map((c) => ({ id: c.id, title: c.title, priority: c.priority, dueDate: c.dueDate, columnId: c.columnId }))
    : [];

  return (
    <>
      <p className="admin-page-sub u-m-0 u-mb-4">
        {board.boardName}: what the client sees on their portal.{" "}
        {isMember ? (
          <>Work the full board at <Link href={`/team/boards/${board.boardSlug}`}>Work Boards</Link>.</>
        ) : (
          <>You are not a member of this board, so the view is read-only.</>
        )}
      </p>
      {isMember && <MyCardsStrip
          cards={myCards}
          columns={board.columns}
          boardSlug={board.boardSlug}
          onMove={moveCard}
          priorityLabel={PRIORITY_LABEL}
        />}
      <div className="admin-kanban">
        {board.columns.map((col, i) => {
          const colCards = board.cards.filter((c) => c.columnId === col.id);
          return (
            <div className="admin-kanban-col" key={col.id}>
              <div className="admin-kanban-col-head">
                <span className="admin-kanban-col-dot" style={{ background: accents[i] }} /* layout-ok: column accent is a token var chosen at runtime */ />
                <span className="admin-kanban-col-label">{col.name}</span>
                <span className="admin-kanban-col-count">{colCards.length}</span>
              </div>
              <div className="admin-kanban-col-body">
                {colCards.map((c) => {
                  const isNew =
                    !c.done &&
                    Date.now() - new Date(c.createdAt).getTime() < NEW_ASSIGNMENT_DAYS * 86400000;
                  const who = c.assigneeName ?? "Edge8";
                  const mine = c.assigneeId === actor.personId;
                  return (
                    <div className="admin-kanban-card admin-kanban-card--static" key={c.id}>
                      <div className="admin-kanban-card-title">{c.title}</div>
                      <div className="admin-kanban-card-meta">
                        {isNew && <Badge tone="info">New</Badge>}
                        {mine && <Badge tone="ok">Mine</Badge>}
                        <Badge tone={PRIORITY_TONE[c.priority]}>{PRIORITY_LABEL[c.priority]}</Badge>
                        {c.sprintName && <Badge tone="info">{c.sprintName}</Badge>}
                      </div>
                      <div className="admin-kanban-card-meta">
                        <span className="admin-kanban-card-assignee">
                          <span className="admin-avatar admin-avatar--sm admin-avatar--soft">{initials(who)}</span>
                          {who}
                        </span>
                        {c.dueDate && (
                          <span className="admin-kanban-card-sub u-ml-auto">
                            {formatDate(c.dueDate)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {colCards.length === 0 && <div className="admin-kanban-col-empty">No cards</div>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
