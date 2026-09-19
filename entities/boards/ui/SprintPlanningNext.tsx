"use client";

import Link from "next/link";
import { Badge } from "@/kernel/ui/Badge";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { formatDate } from "@/kernel/ui/format";
import { updateSprintBrief } from "@/entities/boards/lib/actions";
import { deleteSprint, finishPlanning, renameSprint, unlockSprint } from "@/entities/boards/lib/sprint-settings";
import { weekShort } from "@/entities/boards/lib/sprint-cadence";
import type { PlanningBoard } from "@/entities/boards/lib/sprint-planning";
import type { RunAction } from "./board-view-types";

// The strip above the planning columns (SP-01): one row per board in view
// with its next sprint's week, name and goal, editable in place (the routine
// drafts both on Monday, the team makes them its own here), a count of what
// is committed, and the link to the sprint's own page. Finish planning closes
// every sprint that ended and locks every next sprint in view (SW-01): a
// locked row shows the lock, its fields go read-only, and Unlock brings them
// back when the week has to change after all. A next sprint with nothing in
// it can be deleted from here, for the ones the routine opened by mistake.
export function SprintPlanningNext({
  boards,
  cards,
  section,
  canEdit,
  saving,
  run,
}: {
  boards: PlanningBoard[];
  cards: { columnId: string; board_id: string | null }[];
  section: string;
  canEdit: boolean;
  saving: boolean;
  run: RunAction;
}) {
  const ending = boards.flatMap((b) => b.ending);
  const nexts = boards.flatMap((b) => (b.next ? [b.next] : []));
  const unlocked = nexts.filter((s) => !s.locked_at);
  const locked = nexts.filter((s) => s.locked_at);
  const finishedAt = locked.map((s) => s.locked_at!).sort().at(-1) ?? null;
  const committed = (boardId: string) => cards.filter((c) => c.board_id === boardId && c.columnId === "next").length;
  return (
    <div className="admin-card admin-section-card u-mb-3">
      {boards.length === 0 && <p className="admin-page-sub u-m-0">No board runs weekly sprints for this team yet. Switch it on in Board settings.</p>}
      {boards.map(({ board, next }) => {
        const isLocked = !!next?.locked_at;
        const frozen = !canEdit || saving || isLocked;
        return (
          <div key={board.id} className="admin-row-divided">
            <span className="admin-cell-strong u-min-2">
              {board.client_name ?? "Internal"}
              <span className="admin-cell-muted"> · {board.name}</span>
            </span>
            {next ? (
              <>
                {next.week && <Badge tone="neutral">{weekShort(next.week)}</Badge>}
                <input
                  className="admin-input u-grow u-max-5"
                  aria-label="Sprint name"
                  key={`${next.id}-${next.name}`}
                  defaultValue={next.name}
                  disabled={frozen}
                  onBlur={(e) => e.target.value.trim() !== next.name && run(() => renameSprint(next.id, e.target.value, board.slug))}
                />
                <input
                  className="admin-input u-grow"
                  aria-label="Sprint goal"
                  placeholder="Goal for the week"
                  key={`${next.id}-${next.goal ?? ""}`}
                  defaultValue={next.goal ?? ""}
                  disabled={frozen}
                  onBlur={(e) => e.target.value.trim() !== (next.goal ?? "") && run(() => updateSprintBrief(next.id, { goal: e.target.value }, board.slug))}
                />
                <span className="admin-cell-muted u-sm">{committed(board.id)} committed</span>
                {isLocked && <Badge tone="ok">Locked</Badge>}
                {isLocked && canEdit && (
                  <ConfirmButton
                    label="Unlock"
                    className="admin-btn admin-btn--sm"
                    title="Unlock this sprint?"
                    body={<>The name, goal and card commitments of {next.name} become editable again. Lock it by finishing planning once more.</>}
                    confirmLabel="Unlock"
                    disabled={saving}
                    onConfirm={() => unlockSprint(next.id, board.slug)}
                  />
                )}
                {!isLocked && canEdit && committed(board.id) === 0 && (
                  <ConfirmButton
                    label="Delete"
                    className="admin-btn admin-btn--sm admin-btn--danger"
                    title="Delete this sprint?"
                    body={<>{next.name} has no cards and goes for good. The Monday routine can open a new one.</>}
                    confirmLabel="Delete sprint"
                    disabled={saving}
                    onConfirm={() => deleteSprint(next.id, board.slug)}
                  />
                )}
                <Link className="admin-btn admin-btn--sm" href={`${section}/boards/${board.slug}/sprints/${next.id}`}>
                  Open sprint
                </Link>
              </>
            ) : (
              <span className="admin-cell-muted">No sprint this week; the Monday routine opens one.</span>
            )}
          </div>
        );
      })}
      {nexts.length > 0 && (
        <div className="u-row u-mt-3">
          <span className="admin-cell-muted u-sm u-grow">
            {finishedAt && unlocked.length === 0
              ? `Planning finished ${formatDate(finishedAt)}: ${locked.length} ${locked.length === 1 ? "sprint is" : "sprints are"} locked. Unlock one to change it.`
              : [
                  ending.length > 0 ? `${ending.length} earlier ${ending.length === 1 ? "sprint is" : "sprints are"} still open.` : null,
                  `${unlocked.length} of ${nexts.length} next ${nexts.length === 1 ? "sprint is" : "sprints are"} not locked yet. Anything left in Not done stays in the backlog.`,
                ]
                  .filter(Boolean)
                  .join(" ")}
          </span>
          {canEdit && unlocked.length > 0 && (
            <ConfirmButton
              label="Finish planning"
              className="admin-btn admin-btn--primary admin-btn--sm"
              title="Finish planning?"
              body={
                <>
                  Locks {unlocked.map((s) => s.name).join(", ")}
                  {ending.length > 0 ? <> and closes {ending.map((s) => s.name).join(", ")}</> : null}. Cards you did not move stay in Not done.
                </>
              }
              confirmLabel="Finish planning"
              disabled={saving}
              onConfirm={() => finishPlanning(ending.map((s) => s.id), unlocked.map((s) => s.id))}
            />
          )}
        </div>
      )}
    </div>
  );
}
