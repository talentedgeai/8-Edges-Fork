"use client";

// Epics for one board: one row per epic with its open and done cards and the
// Human Tokens behind them, so the picker in the card drawer and the totals
// per feature are read from the same list. Rename, recolour, archive, restore
// and the New epic form live here (they used to sit in a drawer on the board).
// Shared by /admin/boards/[slug]/epics and /team/boards/[slug]/epics; the page
// wrappers do the authorization and every action re-checks on write.

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BoardDetail } from "@/entities/boards/lib/data";
import { EPIC_COLORS, epicColor, epicColorIndex } from "@/entities/boards/lib/types";
import { setEpicArchived, updateEpic } from "@/entities/boards/lib/actions";
import { epicTotals, zeroTotals } from "@/entities/boards/lib/epic-totals";
import type { RunAction } from "./board-view-types";
import { NewEpicForm } from "./NewEpicForm";

export function EpicsView({ detail, surface, canManage }: { detail: BoardDetail; surface: "/admin" | "/team"; canManage: boolean }) {
  const router = useRouter();
  const { board, epics, cards } = detail;
  const [saving, startSaving] = useTransition();
  const [banner, setBanner] = useState<string | null>(null);
  const { byEpic, none, total } = useMemo(() => epicTotals(cards), [cards]);

  const active = epics.filter((e) => e.status !== "archived");
  const archived = epics.filter((e) => e.status === "archived");

  const run: RunAction = (fn, onOk) => {
    setBanner(null);
    startSaving(async () => {
      const r = await fn();
      if (!r.ok) return setBanner(r.error);
      onOk?.();
      router.refresh();
    });
  };

  const boardHref = `${surface}/boards/${board.slug}`;

  function row(e: BoardDetail["epics"][number]) {
    const t = byEpic.get(e.id) ?? zeroTotals();
    return (
      <tr key={e.id}>
        <td className="u-min-1">
          <span className="admin-board-epic-chip u-w-full">
            <span className="admin-board-epic-dot" data-epic-color={epicColorIndex(e.color)} />
            {canManage ? (
              <input
                className="admin-input admin-input--sm u-w-full"
                defaultValue={e.name}
                key={`${e.id}-${e.name}`}
                aria-label={`Rename ${e.name}`}
                onBlur={(ev) => {
                  const v = ev.target.value.trim();
                  if (v && v !== e.name) run(() => updateEpic(e.id, { name: v }, board.slug));
                }}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter") {
                    ev.preventDefault();
                    (ev.target as HTMLInputElement).blur();
                  }
                }}
                disabled={saving}
              />
            ) : (
              <Link href={`${boardHref}?epic=${e.id}`}>{e.name}</Link>
            )}
          </span>
          {e.description && <div className="admin-cell-muted u-sm">{e.description}</div>}
        </td>
        <td className="u-right">{t.open}</td>
        <td className="u-right">{t.done}</td>
        <td className="u-right">{t.openTokens}</td>
        <td className="u-right">{t.doneTokens}</td>
        <td className="u-right">{t.openTokens + t.doneTokens}</td>
        <td>
          <div className="u-row u-gap-2 u-wrap">
            <Link className="admin-btn admin-btn--sm" href={`${boardHref}?epic=${e.id}`}>
              Cards
            </Link>
            {canManage && (
              <>
                {EPIC_COLORS.map((col) => (
                  <button
                    key={col}
                    type="button"
                    aria-label={`Set color ${col}`}
                    onClick={() => run(() => updateEpic(e.id, { color: col }, board.slug))}
                    disabled={saving}
                    className={`admin-board-epic-swatch admin-board-epic-swatch--sm${epicColor(e.color) === col ? " is-selected" : ""}`}
                    data-epic-color={EPIC_COLORS.indexOf(col)}
                  />
                ))}
                <button
                  className="admin-btn admin-btn--sm"
                  onClick={() => run(() => setEpicArchived(e.id, e.status !== "archived", board.slug))}
                  disabled={saving}
                >
                  {e.status === "archived" ? "Restore" : "Archive"}
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
    );
  }

  const head = (
    <thead>
      <tr>
        <th>Epic</th>
        <th className="u-right">Open</th>
        <th className="u-right">Done</th>
        <th className="u-right">Tokens open</th>
        <th className="u-right">Tokens done</th>
        <th className="u-right">Tokens</th>
        <th />
      </tr>
    </thead>
  );

  return (
    <div className="u-stack u-gap-4">
      {banner && <div className="admin-alert admin-alert--err">{banner}</div>}

      <div className="admin-table-wrap">
        <table className="admin-table">
          {head}
          <tbody>
            {active.map(row)}
            {(none.open > 0 || none.done > 0) && (
              <tr>
                <td>
                  <span className="admin-cell-muted">No epic</span>
                </td>
                <td className="u-right">{none.open}</td>
                <td className="u-right">{none.done}</td>
                <td className="u-right">{none.openTokens}</td>
                <td className="u-right">{none.doneTokens}</td>
                <td className="u-right">{none.openTokens + none.doneTokens}</td>
                <td>
                  <Link className="admin-btn admin-btn--sm" href={`${boardHref}?epic=none`}>
                    Cards
                  </Link>
                </td>
              </tr>
            )}
            {active.length === 0 && none.open === 0 && none.done === 0 && (
              <tr>
                <td colSpan={7} className="admin-cell-muted">
                  No epics yet. An epic groups cards into one feature.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <th>Total</th>
              <th className="u-right">{total.open}</th>
              <th className="u-right">{total.done}</th>
              <th className="u-right">{total.openTokens}</th>
              <th className="u-right">{total.doneTokens}</th>
              <th className="u-right">{total.openTokens + total.doneTokens}</th>
              <th />
            </tr>
          </tfoot>
        </table>
      </div>

      {canManage && <NewEpicForm boardId={board.id} slug={board.slug} saving={saving} run={run} onError={setBanner} />}

      {archived.length > 0 && (
        <details className="admin-card u-p-4">
          <summary className="u-lg">Archived ({archived.length})</summary>
          <div className="admin-table-wrap u-mt-3">
            <table className="admin-table">
              {head}
              <tbody>{archived.map(row)}</tbody>
            </table>
          </div>
        </details>
      )}
      <p className="admin-hint u-m-0">
        Open and Done count cards, not subtasks. Tokens are Human Tokens on the card plus its subtasks; archived cards are not counted.
        {archived.length > 0 && " An archived epic keeps its cards, which still show its name."}
      </p>
    </div>
  );
}
