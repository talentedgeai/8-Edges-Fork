import { describeDay } from "./cadence";
import { diffDays } from "@/kernel/config/dates";
import { AGENDA_LEAD_DAYS } from "./help-lines";
import { missWorthPrompting, type LeaveSpan } from "./leave-window";

// What the coach's roster row offers, and which single control is the filled
// one (K.57, doc §C.3). "Prepare" was the same button on every row whatever the
// row said, which is the "specific button labels" defect: a label that names
// the next move ("Write the agenda", "Mark it held") tells a coach what the row
// is waiting for before they have read a word of it.
//
// The rule this module exists to hold is "one dominant element" applied per row
// rather than per page: at most one filled button, everything else a quiet
// outline. Keeping the choice here — pure, no React, no data client — is what
// lets every state be asserted in a test instead of clicked through.
//
// Nothing here ranks or scores anybody (CLAUDE.md): the state is a fact about a
// booking, and the same state always produces the same bar for every person.

export type RowActionId =
  | "confirm"
  | "decline"
  | "mark-held"
  | "last-recap"
  | "write-agenda"
  | "open-prep"
  | "rebook"
  | "propose"
  | "open";

export type RowAction = {
  id: RowActionId;
  label: string;
  // The destination when the control is a link. Null marks the three controls
  // the row performs itself: confirm, decline and mark-held are server actions
  // done from the row, and last-recap opens the drawer.
  href: string | null;
};

export type RowActionState = {
  profileId: string;
  // The person's display name, which "Open <name>" spells out rather than
  // saying "Open" or "View" — the escape hatch should name where it goes.
  name: string;
  proposedOn: string | null;
  proposedBy: string | null;
  nextOneOnOneOn: string | null;
  agendaWritten: boolean;
  // Today in Saigon, so a blank agenda is only urgent inside the same window
  // the help list uses; a first 1-1 two weeks out has nothing to prepare yet.
  todayISO: string;
  // The booking whose day passed without the 1-1 being marked held, and its
  // meeting row — mark-held writes to that row, so without the id there is
  // nothing to mark and the row falls through to its next state.
  missedOn: string | null;
  missedMeetingId: string | null;
  // When this person was away (L.2); absent on callers that predate it.
  leave?: LeaveSpan[];
  // Whether a 1-1 has ever been held, which is the only precondition the row
  // can know cheaply. Whether that 1-1 carries a written recap is answered by
  // the drawer's own load, not by a roster-wide read of every recap body.
  hasHeldOneOnOne: boolean;
};

export type RowActionBar = { filled: RowAction | null; quiet: RowAction[] };

// The previous recap as the drawer receives it. It lives in this pure module
// rather than beside the action that returns it because a "use server" file may
// export nothing but async functions, and the browser half needs the shape.
export type LastRecapView = { heldOn: string; html: string | null };

function profileHref(profileId: string): string {
  return `/team/coaching/${profileId}?tab=next`;
}

// The order is the order of obligation, not the order of the columns: a date
// the member proposed is the only state where somebody else is waiting on the
// coach, so it outranks a booking that passed unmarked, which in turn outranks
// prep the coach owes only themselves.
export function rowActions(state: RowActionState): RowActionBar {
  const href = profileHref(state.profileId);
  const tail: RowAction[] = [];
  if (state.hasHeldOneOnOne) tail.push({ id: "last-recap", label: "Last recap", href: null });
  tail.push({ id: "open", label: `Open ${state.name}`, href });

  if (state.proposedOn && state.proposedBy === "member") {
    return {
      filled: { id: "confirm", label: `Confirm ${describeDay(state.proposedOn)}`, href: null },
      quiet: [{ id: "decline", label: "Suggest another", href: null }, ...tail],
    };
  }

  if (state.missedOn && state.missedMeetingId) {
    // A 1-1 the person was away for did not quietly fail to happen — it was
    // never going to (L.2). "Mark it held" as the one filled action would be
    // the page asking a coach to record a holiday as a meeting, so the day
    // simply needs a new one: Rebook leads and marking it held stays available
    // for the coach who did talk to them anyway.
    if (!missWorthPrompting(state.missedOn, state.leave ?? [])) {
      return {
        filled: { id: "rebook", label: "Rebook", href },
        quiet: [{ id: "mark-held", label: "Mark it held", href: null }, ...tail],
      };
    }
    return {
      filled: { id: "mark-held", label: "Mark it held", href: null },
      quiet: [{ id: "rebook", label: "Rebook", href }, ...tail],
    };
  }

  if (state.nextOneOnOneOn) {
    if (state.agendaWritten) return { filled: { id: "open-prep", label: "Open the prep", href }, quiet: tail };
    // The same window the help list uses (AGENDA_LEAD_DAYS): inside it the
    // agenda is the move; before it the row says nothing is waiting, which is
    // what the week line and the help list already say about that person
    // (Khoa saw "Write the agenda" on a first 1-1 thirteen days out, 2026-09-17).
    const away = diffDays(state.todayISO, state.nextOneOnOneOn);
    if (away <= AGENDA_LEAD_DAYS) return { filled: { id: "write-agenda", label: "Write the agenda", href }, quiet: tail };
    return { filled: null, quiet: [{ id: "open-prep", label: "Open the prep", href }, ...tail] };
  }

  // The coach has put a day forward and the member has not answered it: the
  // ball is theirs, so nothing on this row is filled. This is doc §C.3's
  // "nothing pending" row — a row with nothing to answer should not compete for
  // the eye with the rows that do.
  if (state.proposedOn) return { filled: null, quiet: tail };

  return { filled: { id: "propose", label: "Propose a day", href }, quiet: tail };
}
