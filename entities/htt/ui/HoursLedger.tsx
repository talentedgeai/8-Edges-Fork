"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/kernel/ui/Badge";
import type { LedgerRow } from "../ledger-types";
import { HoursBudgets } from "./HoursBudgets";
import { bridgeReviewNote, cappedNote, fmt, unattendedNote } from "./ledger-notes";

type ActionResult = { ok: boolean; error?: string };

// The hours ledger on an AI Program: one row per person per day, the measured
// figure beside the final one, and an inline override with a required reason.
// Admin surfaces pass canEditAll; the team portal passes the viewer's person
// id so an engineer edits only their own days (the action enforces it too).
export function HoursLedger({
  repoId,
  rows,
  budgets,
  viewerPersonId,
  canEditAll,
  overrideAction,
  clearAction,
  budgetAction,
  rescanAction,
}: {
  repoId: string;
  rows: LedgerRow[];
  budgets: Record<string, number>; // person id -> daily focus hours
  viewerPersonId: string | null;
  canEditAll: boolean;
  overrideAction: (repoId: string, personId: string, day: string, hours: number, reason: string) => Promise<ActionResult>;
  clearAction: (repoId: string, personId: string, day: string) => Promise<ActionResult>;
  budgetAction?: (personId: string, hours: number) => Promise<ActionResult>;
  /** Re-run the rule over stored sessions. Null person = everyone (admin only). */
  rescanAction?: (personId: string | null) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null); // `${personId}|${day}`
  const [hours, setHours] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const canEdit = (r: LedgerRow) => !!r.personId && (canEditAll || r.personId === viewerPersonId);
  const people = new Map<string, string>();
  for (const r of rows) if (r.personId) people.set(r.personId, r.personName);
  const total = rows.reduce((s, r) => s + r.final, 0);
  const review = rows.filter((r) => r.needsReview).length;
  const capped = rows.filter((r) => r.capped && !r.overridden).length;

  function rescan() {
    if (!rescanAction) return;
    setErr(null);
    start(async () => {
      const res = await rescanAction(canEditAll ? null : viewerPersonId);
      if (!res.ok) setErr(res.error ?? "Could not rescan.");
      else router.refresh();
    });
  }

  function open(r: LedgerRow) {
    setErr(null);
    setEditing(`${r.personId}|${r.day}`);
    setHours(String(r.final));
    setReason(r.reason ?? "");
  }
  function save(r: LedgerRow) {
    if (!r.personId) return;
    setErr(null);
    start(async () => {
      const res = await overrideAction(repoId, r.personId as string, r.day, Number(hours), reason);
      if (!res.ok) setErr(res.error ?? "Could not save.");
      else {
        setEditing(null);
        router.refresh();
      }
    });
  }
  function clear(r: LedgerRow) {
    if (!r.personId) return;
    setErr(null);
    start(async () => {
      const res = await clearAction(repoId, r.personId as string, r.day);
      if (!res.ok) setErr(res.error ?? "Could not reset.");
      else {
        setEditing(null);
        router.refresh();
      }
    });
  }
  return (
    <div>
      <div className="u-row u-between u-wrap u-mb-3">
        <h2 className="admin-card-title u-m-0">
          Hours ledger{" "}
          <span className="admin-card-title-note">
            · {rows.length} days · {fmt(total)} h billed{review > 0 ? ` · ${review} to review` : ""}
            {capped > 0 ? ` · ${capped} over the daily cap` : ""}
          </span>
        </h2>
        <span className="u-row u-gap-2 u-items-center">
          {rescanAction && (
            <button type="button" className="admin-btn admin-btn--sm" disabled={pending} onClick={rescan}>
              {pending ? "Rescanning…" : "Re-scan hours"}
            </button>
          )}
        <HoursBudgets
          people={[...people]}
          budgets={budgets}
          viewerPersonId={viewerPersonId}
          canEditAll={canEditAll}
          budgetAction={budgetAction}
        />
        </span>
      </div>
      {err && <div className="admin-alert admin-alert--err u-mb-3">{err}</div>}
      {rows.length === 0 ? (
        <div className="admin-empty">No hours recorded on this repo yet.</div>
      ) : (
        <div className="admin-table-wrap">
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Person</th>
                  <th className="u-right">Measured</th>
                  <th>Other projects that day</th>
                  <th className="u-right">Final</th>
                  <th>Note</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const key = `${r.personId}|${r.day}`;
                  const isEditing = editing === key;
                  return (
                    <tr key={key} className={r.needsReview ? "admin-row-archived" : undefined}>
                      <td className="admin-cell-strong u-nowrap">{r.day}</td>
                      <td>{r.personName}</td>
                      <td className="u-right u-tabular">{r.measured == null ? <span className="admin-cell-muted">n/a</span> : fmt(r.measured)}</td>
                      <td className="admin-cell-muted u-sm">
                        {r.others.length === 0 ? "" : r.others.map((o) => `${o.repo} ${fmt(o.hours)}h`).join(", ")}
                      </td>
                      <td className="u-right u-tabular admin-cell-strong">
                        {isEditing ? (
                          <input
                            className="admin-input admin-input--w-xs"
                            type="number"
                            step="0.25"
                            min="0"
                            max="24"
                            value={hours}
                            onChange={(e) => setHours(e.target.value)}
                          />
                        ) : (
                          fmt(r.final)
                        )}
                      </td>
                      <td className="u-sm">
                        {isEditing ? (
                          <input
                            className="admin-input u-w-full"
                            placeholder="Reason (required), e.g. afternoon was a client workshop"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                          />
                        ) : (
                          <span className="u-row u-wrap u-gap-1 u-items-center">
                            {r.overridden && <Badge tone="ok">override</Badge>}
                            {r.needsReview && <Badge tone="warn">needs review</Badge>}
                            {r.capped && !r.overridden && <Badge tone="warn">over daily cap</Badge>}
                            {r.scaled && !r.capped && !r.overridden && <Badge tone="info">scaled to budget</Badge>}
                            <span className="admin-cell-muted">
                              {r.overridden
                                ? `${r.reason ?? ""}${r.overrideBy ? ` (${r.overrideBy})` : ""}`
                                : r.needsReview && r.reviewReason === "bridge"
                                  ? bridgeReviewNote(r)
                                : r.needsReview
                                  ? r.legacyCapped
                                    ? "No session evidence; legacy figure was cut to the budget."
                                    : "No session evidence; unverified recorder figure."
                                  : r.rule === "v2"
                                    ? `${r.turns ?? 0} human turn${r.turns === 1 ? "" : "s"}${r.prs.length ? ` · PR ${r.prs.map((n) => `#${n}`).join(", ")}` : ""}${unattendedNote(r)}${cappedNote(r)}${r.totalMeasured != null && r.others.length ? ` · day ${fmt(r.totalMeasured)}h across projects` : ""}`
                                  : r.scaled
                                    ? `Day measured ${fmt(r.totalMeasured ?? 0)}h across projects.`
                                    : r.sessions > 0
                                      ? `${r.sessions} session${r.sessions === 1 ? "" : "s"}`
                                      : ""}
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="u-nowrap u-right">
                        {isEditing ? (
                          <span className="u-row u-gap-1">
                            <button type="button" className="admin-btn admin-btn--sm admin-btn--primary" disabled={pending} onClick={() => save(r)}>
                              {pending ? "Saving…" : "Save"}
                            </button>
                            {r.overridden && (
                              <button type="button" className="admin-btn admin-btn--sm" disabled={pending} onClick={() => clear(r)}>
                                Use measured
                              </button>
                            )}
                            <button type="button" className="admin-btn admin-btn--sm" onClick={() => setEditing(null)}>
                              Cancel
                            </button>
                          </span>
                        ) : canEdit(r) ? (
                          <button type="button" className="admin-btn admin-btn--sm" onClick={() => open(r)}>
                            Edit
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
