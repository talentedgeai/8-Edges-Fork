import Link from "next/link";
import Image from "next/image";
import { PageHead } from "@/kernel/ui/PageHead";
import type { CoachRosterRow } from "@/entities/coaching/lib/data/roster";
import type { RosterCandidate } from "@/entities/coaching/lib/data/roster";
import {
  goalLine,
  nextMeetingLine,
  sinceCluster,
} from "@/entities/coaching/lib/help-lines";
import { weekLine, type WeekLineInput } from "@/entities/coaching/lib/week-line";
import type { PracticeFacts } from "@/entities/coaching/lib/practice-facts";
import { practiceIsBare } from "@/entities/coaching/lib/practice-facts";
import { PracticeTiles } from "@/entities/coaching/ui/PracticeTiles";
import { PracticeDetail } from "@/entities/coaching/ui/PracticeDetail";
import { AddToRoster } from "@/entities/coaching/ui/AddToRoster";
import { HelpByPerson } from "@/entities/coaching/ui/HelpByPerson";
import { RosterRowActions } from "@/entities/coaching/ui/RosterRowActions";
import { RosterRowMore } from "@/entities/coaching/ui/RosterRowMore";
import { rowActions } from "@/entities/coaching/lib/row-actions";

// The coach's roster, rendered (K.46). A server component that takes rows
// somebody else has already loaded and guarded, so the route stays a guard plus
// two loads and the markup can be looked at on its own.
//
// The shape is deliberate. One row per person and nothing twice, because the
// old page said everything in a table and then again in a card. Every fact is a
// sentence in the coach's voice, because a dash in a cell tells a coach nothing
// they can do. Signals are gathered into "Where I can help" as requests
// addressed to the coach rather than flags counted against a person: nothing
// here scores, ranks or sorts anybody, and there is no red state (CLAUDE.md).
// Mode C/M/D, the loose root and the 80/15/5 target live on the person's own
// profile, beside the conversation they describe (K.47), never here.
export function CoachRosterView({
  roster,
  candidates,
  practice,
  today,
}: {
  roster: CoachRosterRow[];
  candidates: RosterCandidate[];
  // Four aggregates about the practice (K.54). Carried as its own prop rather
  // than derived here from the rows, because the type that has no person column
  // is what enforces the no-ranking rule, and deriving it here would lose that.
  practice: PracticeFacts;
  today: string;
}) {
  // Where "Plan the week" lands: the first person with no next 1-1 on the
  // calendar, which is what planning a week means here. With everybody booked
  // there is nothing to fix, so it goes to the top of the list rather than
  // nowhere — a header action that sometimes does nothing is worse than one
  // that always moves the page.
  const needsDate = roster.find((r) => !r.nextOneOnOneOn) ?? roster[0] ?? null;

  // A roster nobody has ever met and nobody has a date with has no practice to
  // draw yet: every tile would be a zero, and four zeroes are a worse answer
  // than one sentence saying what to do (redesign §A.19; skill UX guideline
  // Feedback → Empty States, "show helpful message and action"). A roster whose
  // 1-1s have happened but whose calendar is empty is *not* this case — the
  // days-since and commitment tiles are still about something real — so the
  // test is both halves, not just the missing date.
  // Fact-based, not date-based: the tiles earn the screen when they have
  // something to report, and a date the calendar carries now counts as a
  // planned 1-1, so a roster with dates keeps its tiles (review, 2026-09-18).
  const bare = roster.length > 0 && practiceIsBare(practice);

  return (
    <>
      <PageHead
        title="Coaching"
        // One quiet line about the coach's week rather than a count of the
        // people on the roster: what a coach opens this page to learn is how
        // much of the week is already booked, not how many names they own.
        sub={weekLine(roster.map(weekInput), today)}
        // The header's action is the weekly job, not the yearly one: adding
        // somebody happens a handful of times a year and preparing happens
        // every week, so "Add someone" moves to the foot of the page and the
        // most prominent control is the one most often wanted (§A.20).
        action={
          needsDate ? (
            <Link href={`#roster-${needsDate.profileId}`} className="admin-btn admin-btn--sm">
              Plan the week
            </Link>
          ) : undefined
        }
      />

      {/* Under the week line, which stays the page's one-sentence summary for
          a phone and for a screen reader that has heard enough. The tiles are
          the same week looked at as a practice rather than as a calendar. */}
      {roster.length > 0 && !bare && (
        /* The disclosure belongs to the tiles it expands, so the two sit in one
           group rather than the fold floating between the tiles and the help
           block (review, 2026-09-18). */
        <div className="coach-practice">
          <PracticeTiles facts={practice} />
          <PracticeDetail facts={practice} />
        </div>
      )}

      {bare && (
        <p className="admin-empty coach-empty">
          Nobody has a first 1-1 yet — propose one from a row below, and the rest of this page
          fills in from what happens in them.
        </p>
      )}

      {/* The shortlist, grouped by person (K.61). Its markup and its grouping
          live in their own file because they are a screen of their own on top
          of a page of rows, and this file is already the roster. */}
      <HelpByPerson roster={roster} today={today} />

      {/* The shortlist ends and the roster begins. Without this line the two
          ran together as one column of cards, and a reader arriving at the
          third card could not tell whether they were still reading the five
          people who need something or the whole roster. One line, a hairline
          and a section's worth of space above it — no card, because a heading
          that needs a card is a third section rather than the seam between
          two (ui-ux-pro-max priority 9, navigation hierarchy). */}
      {roster.length > 0 && (
        <div className="coach-roster-heading">
          <h2 className="coach-roster-heading-title">The people you coach</h2>
          {/* The count lives here rather than at the foot now: it is the size
              of the thing the heading names, and printing it twice on one page
              would make the reader check whether the two agreed. */}
          <span className="coach-roster-count">
            {roster.length} {roster.length === 1 ? "person" : "people"}
          </span>
        </div>
      )}

      <div className="coach-roster">
        {roster.map((r, i) => (
          // The index is only ever used to decide which avatars are above the
          // fold and may be fetched eagerly. Nothing here is ordered by a
          // number that belongs to a person.
          <PersonRow key={r.profileId} row={r} today={today} index={i} />
        ))}
      </div>

      {roster.length === 0 && (
        <p className="admin-empty coach-empty">
          Your roster is where the people you coach live. Add someone and their first 1-1 date, and
          this page will tell you what to prepare.
        </p>
      )}

      {/* The foot of the list: the control that changes who is on it. It
          belongs here rather than in the page head — adding somebody happens a
          few times a year and preparing happens every week. The count that
          used to sit beside it has moved up to the roster's own heading, where
          it is next to the words it counts. */}
      <div className="coach-roster-foot">
        <AddToRoster candidates={candidates} />
      </div>
    </>
  );
}

// The projection for the header's week line: it aggregates and never
// names anybody, so it needs four facts and none of them identify a person.
function weekInput(r: CoachRosterRow): WeekLineInput {
  return {
    nextOneOnOneOn: r.nextOneOnOneOn,
    proposedOn: r.proposedOn,
    proposedBy: r.proposedBy,
    kept: r.facts.kept,
  };
}

// One person, given a shape (K.58). The row is a `1fr 200px` grid from 720px
// up: the person and the two sentences that say what is next on the left, the
// "since your last 1-1" cluster in a column of its own behind a hairline, and
// the action bar as a footer line across both. Every fact is still a sentence —
// the no-chips, no-flags instinct of K.46 was right — but the sentences no
// longer all weigh the same, which is what made ten rows read as a wall of grey
// prose (doc §A.15). On a phone the grid collapses to one column and the two
// quieter facts go behind "More".
function PersonRow({ row, today, index }: { row: CoachRosterRow; today: string; index: number }) {
  const since = sinceCluster(row.lastHeldOn, row.facts, today);
  return (
    <article className="admin-card coach-roster-row" id={`roster-${row.profileId}`}>
      <div className="coach-roster-head">
        {row.member.avatarUrl ? (
          <Image
            src={row.member.avatarUrl}
            alt=""
            width={44}
            height={44}
            // Only the first two rows are above the fold on any screen this
            // page is read on; the rest wait until they are scrolled to
            // (ui-ux-pro-max priority 3 — lazy loading). The width and height
            // are fixed either way, so nothing shifts when one arrives.
            loading={index < 2 ? "eager" : "lazy"}
            className="admin-avatar admin-avatar--lg"
          />
        ) : (
          <span className="admin-avatar admin-avatar--lg admin-avatar--tint" aria-hidden>
            {row.member.name.slice(0, 1)}
          </span>
        )}
        <div className="coach-roster-who">
          <Link href={`/team/coaching/${row.profileId}`} className="coach-roster-name">
            {row.member.name}
          </Link>
          {row.member.positionTitle && (
            <div className="coach-roster-role">{row.member.positionTitle}</div>
          )}
        </div>
      </div>

      <p className="coach-roster-next">
        {nextMeetingLine(
          {
            nextOneOnOneOn: row.nextOneOnOneOn,
            agendaWritten: row.agendaWritten,
            heldCount: row.heldCount,
          },
          today,
        )}
      </p>
      <RosterRowMore name={row.member.name}>
        <p className="coach-roster-goal">{goalLine(row.goal, today)}</p>
        {/* The right-hand column. It is a list rather than the sentence it
            used to be so the row has two shapes to read instead of four lines
            of the same one; the hairline that holds it is the only new mark on
            the row, and there is still no chip and no status colour. */}
        <div className="coach-roster-aside">
          <p className="coach-roster-aside-eyebrow">{since.eyebrow}</p>
          {since.items.length > 0 ? (
            <ul className="coach-roster-aside-list">
              {since.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="coach-roster-aside-note">{since.note}</p>
          )}
        </div>
      </RosterRowMore>

      {/* The row's action bar (K.57): the row's state picks the one filled
          button, and a proposal is one of those states rather than a second
          widget in its own footer. The choice itself is rowActions', which is
          pure and tested; this file only hands it the row. */}
      <RosterRowActions
        bar={rowActions({
          profileId: row.profileId,
          name: row.member.name,
          proposedOn: row.proposedOn,
          proposedBy: row.proposedBy,
          nextOneOnOneOn: row.nextOneOnOneOn,
          agendaWritten: row.agendaWritten,
          todayISO: today,
          missedOn: row.missedOn,
          leave: row.leave,
          missedMeetingId: row.missedMeetingId,
          hasHeldOneOnOne: row.heldCount > 0,
        })}
        profileId={row.profileId}
        name={row.member.name}
        missedMeetingId={row.missedMeetingId}
      />
    </article>
  );
}
