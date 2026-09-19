"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import { confirmProposedDate, declineProposedDate, markOneOnOneHeld } from "@/entities/coaching/lib/schedule-actions";
import { lastRecapForRow, undoMarkOneOnOneHeld } from "@/entities/coaching/lib/row-bar-actions";
import type { LastRecapView, RowAction, RowActionBar } from "@/entities/coaching/lib/row-actions";
import { describeDay } from "@/entities/coaching/lib/cadence";

// The coach's roster row, ended (K.57, doc §C.3). Which controls appear and
// which one is filled is decided by the pure rowActions() on the server; this
// island is only the three behaviours a link cannot have — two writes done from
// the row, the undo window that follows one of them, and the recap drawer.
//
// ProposalActions used to live in its own bordered footer below the row. It is
// folded in here because a proposal is one of the row's states, not a second
// widget: a coach should find the row's next move in one place whatever the row
// is waiting for.

// How long the undo stays offered. Longer than the 3–5s a plain toast gets
// (ui-ux-pro-max §Feedback, "auto-dismiss after 3-5 seconds") because this
// toast is not an announcement but a window: the coach has to read it, decide
// the click was wrong, and reach the button, and a window that closes while
// they are still reading it is a confirm dialog with extra steps.
const UNDO_MS = 8000;

type Props = {
  bar: RowActionBar;
  profileId: string;
  name: string;
  missedMeetingId: string | null;
  // "Where I can help" shows one person's one next move, not their whole bar
  // (K.61): the block is a shortlist, and a second copy of Last recap and
  // Open <name> beside every face would make it the roster over again. The
  // control is the same object the row picks, from the same rowActions() call,
  // so the shortlist can never offer a different next move than the row it
  // sits above.
  compact?: boolean;
};

export function RosterRowActions({ bar, profileId, name, missedMeetingId, compact }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [undoId, setUndoId] = useState<string | null>(null);
  const [recapOpen, setRecapOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const run = useCallback((fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    setError(null);
    startTransition(async () => {
      // A server action can reject as well as return a failure — a dropped
      // connection, or a session that expired between the page load and the
      // click. Without this the row would sit on "Saving…" with nothing said.
      try {
        const res = await fn();
        if (res.ok) after?.();
        else setError(res.error ?? "Something went wrong.");
      } catch {
        setError("That did not reach the server. Try again.");
      }
    });
  }, []);

  const onMarkHeld = () => {
    const id = missedMeetingId;
    if (!id) return;
    run(
      () => markOneOnOneHeld(id),
      () => {
        setUndoId(id);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setUndoId(null), UNDO_MS);
      },
    );
  };

  const onUndo = () => {
    const id = undoId;
    if (!id) return;
    if (timer.current) clearTimeout(timer.current);
    setUndoId(null);
    run(() => undoMarkOneOnOneHeld(id));
  };

  const control = (a: RowAction, filled: boolean) => {
    if (a.href) {
      return (
        <Link
          key={a.id}
          href={a.href}
          className={filled ? "admin-btn coach-row-actions-filled" : "admin-btn"}
        >
          {a.label}
        </Link>
      );
    }
    const onClick =
      a.id === "confirm"
        ? () => run(() => confirmProposedDate(profileId))
        : a.id === "decline"
          ? () => run(() => declineProposedDate(profileId))
          : a.id === "mark-held"
            ? onMarkHeld
            : () => setRecapOpen(true);
    return (
      <button
        key={a.id}
        type="button"
        className={filled ? "admin-btn coach-row-actions-filled" : "admin-btn"}
        disabled={pending}
        onClick={onClick}
      >
        {pending && filled ? "Saving…" : a.label}
      </button>
    );
  };

  // The undo window belongs to mark-held wherever mark-held was clicked, so the
  // toast is built once and rendered by both shapes of this island.
  const toast = undoId ? (
    <div className="admin-toast-host">
      <div className="admin-toast" role="status">
        <span>That 1-1 is marked held.</span>
        <button type="button" className="coach-row-actions-undo" onClick={onUndo}>
          Undo
        </button>
      </div>
    </div>
  ) : null;

  if (compact) {
    return (
      <>
        {/* Named after the person even though it holds one control: five
            "Confirm Thursday 24 Sep" buttons down a block are otherwise
            indistinguishable to a screen reader (skill priority 1, aria-labels). */}
        <div className="coach-roster-help-do" role="group" aria-label={`What to do next with ${name}`}>
          {bar.filled && control(bar.filled, true)}
          {error && <span className="coach-row-actions-note">{error}</span>}
        </div>
        {toast}
      </>
    );
  }

  return (
    <>
      {/* The bar is one group so a screen reader announces the row's controls
          as the row's controls, named after the person they belong to — six
          identical "Open the prep" buttons down a page are otherwise
          indistinguishable (ui-ux-pro-max priority 1, aria-labels). */}
      <div className="coach-row-actions" role="group" aria-label={`What to do next with ${name}`}>
        {bar.filled && control(bar.filled, true)}
        {bar.quiet.map((a) => control(a, false))}
        {error && <span className="coach-row-actions-note">{error}</span>}
      </div>

      {toast}

      {recapOpen && <RecapDrawer profileId={profileId} name={name} onClose={() => setRecapOpen(false)} />}
    </>
  );
}

// The last recap, fetched when the drawer opens rather than with the roster: a
// recap body is long prose and at most one of them is ever read on this page.
function RecapDrawer({ profileId, name, onClose }: { profileId: string; name: string; onClose: () => void }) {
  const [state, setState] = useState<{ recap: LastRecapView } | { error: string } | null>(null);

  useEffect(() => {
    let live = true;
    lastRecapForRow(profileId)
      .then((res) => {
        if (live) setState(res.ok ? { recap: res.recap } : { error: res.error });
      })
      // A drawer that fails to load must say so rather than sit on "Loading…":
      // the coach opened it 90 seconds before a 1-1 and needs to know to look
      // somewhere else, not to keep waiting.
      .catch(() => {
        if (live) setState({ error: "That recap could not be loaded." });
      });
    return () => {
      live = false;
    };
  }, [profileId]);

  const heldOn = state && "recap" in state ? state.recap.heldOn : null;

  return (
    <DetailDrawer
      open
      onClose={onClose}
      eyebrow="Last recap"
      title={heldOn ? `1-1 on ${describeDay(heldOn)}` : name}
      action={
        <Link href={`/team/coaching/${profileId}?tab=log`} className="admin-btn admin-btn--sm">
          Open the log
        </Link>
      }
    >
      {state === null && <p className="admin-cell-muted">Loading…</p>}
      {state && "error" in state && <p className="admin-cell-muted">{state.error}</p>}
      {state && "recap" in state && state.recap.html === null && (
        <p className="admin-cell-muted">That 1-1 was held but never written up.</p>
      )}
      {state && "recap" in state && state.recap.html !== null && (
        // The HTML is remark output sanitized on the server (lib/markdown.ts),
        // which is the same path every other coaching document takes.
        <div className="admin-idea-plan" dangerouslySetInnerHTML={{ __html: state.recap.html }} />
      )}
    </DetailDrawer>
  );
}
