import Link from "next/link";
import Image from "next/image";
import type { CoachRosterRow } from "@/entities/coaching/lib/data/roster";
import {
  helpGroups,
  NO_GOAL_NOTE,
  type HelpGroup,
  type HelpGroupInput,
} from "@/entities/coaching/lib/help-lines";
import { rowActions } from "@/entities/coaching/lib/row-actions";
import { RosterRowActions } from "@/entities/coaching/ui/RosterRowActions";

// "Where I can help", grouped by person (K.61). The block used to be a flat
// list of sentences sorted by signal, which meant one person could appear three
// times, no line had a face, and the coach read five sentences to learn that
// three people were waiting. Khoa, on seeing it: "plain background with a bunch
// of text, it would not show me clearly who's who."
//
// So the person is the unit. An avatar and a name anchor each group, that
// person's lines sit under it shorn of their name, and the right-hand side
// carries the one move their own row would offer. Proximity does the work that
// five repetitions of a name was doing: everything about one person is inside
// one hairline-bounded band, and the eye finds a face before it reads a word
// (ui-ux-pro-max priority 6, Typography → Font Size Scale: "consistent type
// hierarchy aids scanning" — here the hierarchy is name over line, not five
// lines of one weight; and priority 9, navigation overload, which is why the
// list is capped).
//
// Nothing in here counts anything per person. The people are ordered by the
// category of their most urgent signal, which helpGroups decides and tests; a
// person with four lines never outranks a person with one.
export function HelpByPerson({ roster, today }: { roster: CoachRosterRow[]; today: string }) {
  const { groups, overflow, noGoalOnly, peopleWaiting } = helpGroups(roster.map(groupInput), today);
  if (groups.length === 0 && noGoalOnly.length === 0) return null;

  const byId = new Map(roster.map((r) => [r.profileId, r]));

  return (
    <section className="admin-card coach-roster-help">
      <div className="coach-roster-help-head">
        <h2 className="coach-roster-help-title">Where I can help</h2>
        {/* People, never flags. A count of signals would be a number that grows
            when somebody has a hard week, which is the metric this page does
            not keep (CLAUDE.md); a count of people is the size of the coach's
            week, which is what the sentence is for. */}
        {peopleWaiting > 0 && (
          <p className="coach-roster-help-count">
            {peopleWaiting} {peopleWaiting === 1 ? "person needs" : "people need"} you this week
          </p>
        )}
      </div>

      {groups.length > 0 && (
        <ul className="coach-roster-help-people">
          {groups.map((group) => (
            <li key={group.profileId} className="coach-roster-help-person">
              <PersonFace group={group} />
              <div className="coach-roster-help-who">
                <Link href={`/team/coaching/${group.profileId}`} className="coach-roster-help-name">
                  {group.name}
                </Link>
                <ul className="coach-roster-help-list">
                  {group.lines.map((line) => (
                    <li key={line.signal}>
                      <Link href={line.href} className="coach-roster-help-link">
                        {line.underName}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              <GroupAction row={byId.get(group.profileId) ?? null} today={today} />
            </li>
          ))}
        </ul>
      )}

      {/* What is over the cap is never dropped in silence: every one of these
          people still says the same thing on their own row, so the line says
          where they went and scrolls there (K.59). */}
      {overflow.length > 0 && (
        <p className="coach-roster-help-foot">
          <Link
            href={`#roster-${overflow[0].profileId}`}
            className="coach-roster-help-link coach-roster-help-more"
          >
            …and {overflow.length} more, further down
          </Link>
        </p>
      )}

      {/* One sentence for everybody who has no goal yet and nothing else
          waiting. It is a standing invitation rather than something owed this
          week, and a card each would have crowded out the date somebody is
          actually waiting on (skill priority 9 — overloaded lists). */}
      {noGoalOnly.length > 0 && (
        <p className="coach-roster-help-foot">
          {noGoalOnly.map((p, i) => (
            <span key={p.profileId}>
              {i > 0 && ", "}
              <Link href={p.href} className="coach-roster-help-link">
                {p.name}
              </Link>
            </span>
          ))}
          : {lowerFirst(NO_GOAL_NOTE)}
        </p>
      )}
    </section>
  );
}

// The same avatar element the roster row draws, at the smaller size this block
// gives it: one avatar system, one markup (CLAUDE.md rule 3). It is decorative
// here because the name is right beside it in text.
function PersonFace({ group }: { group: HelpGroup }) {
  if (!group.avatarUrl) {
    return (
      <span className="admin-avatar admin-avatar--tint coach-roster-help-face" aria-hidden>
        {group.name.slice(0, 1)}
      </span>
    );
  }
  return (
    <Image
      src={group.avatarUrl}
      alt=""
      width={32}
      height={32}
      className="admin-avatar coach-roster-help-face"
    />
  );
}

// The group's one move, taken from the same pure rowActions() the person's row
// calls with the same state — so the shortlist and the row can never disagree,
// and there is no second decision to keep in step. A row whose ball is with the
// member has no filled control at all, and then the group shows none.
function GroupAction({ row, today }: { row: CoachRosterRow | null; today: string }) {
  if (!row) return null;
  const bar = rowActions({
    profileId: row.profileId,
    name: row.member.name,
    proposedOn: row.proposedOn,
    proposedBy: row.proposedBy,
    nextOneOnOneOn: row.nextOneOnOneOn,
    agendaWritten: row.agendaWritten,
    todayISO: today,
    missedOn: row.missedOn,
    missedMeetingId: row.missedMeetingId,
    leave: row.leave,
    hasHeldOneOnOne: row.heldCount > 0,
  });
  if (!bar.filled) return null;
  return (
    <RosterRowActions
      bar={bar}
      profileId={row.profileId}
      name={row.member.name}
      missedMeetingId={row.missedMeetingId}
      compact
    />
  );
}

// The roster row reduced to the facts the help lines are written from, plus the
// face the group is anchored by. A projection rather than the row itself, so
// the pure module never depends on the loader's shape.
function groupInput(r: CoachRosterRow): HelpGroupInput {
  return {
    profileId: r.profileId,
    name: r.member.name,
    avatarUrl: r.member.avatarUrl,
    proposedOn: r.proposedOn,
    proposedBy: r.proposedBy,
    missedOn: r.missedOn,
    leave: r.leave,
    stuckSince: r.facts.stuckSince,
    hasGoal: r.goal !== null,
    nextOneOnOneOn: r.nextOneOnOneOn,
    agendaWritten: r.agendaWritten,
    heldCount: r.heldCount,
  };
}

// "No FAST goal yet — …" is a sentence on its own and a clause after a list of
// names; only its first letter differs, so it stays one constant.
function lowerFirst(text: string): string {
  return text.slice(0, 1).toLowerCase() + text.slice(1);
}
