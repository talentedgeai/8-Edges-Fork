"use client";

// The coach's first visit to somebody's profile (L.13).
//
// The mirror of what the member's Overview does on ITS first visit (K.27):
// one block, one action, and a plain sentence about what fills the page in.
// Not six tiles saying "nothing" six ways, which is what a coach with a new
// person actually saw.
//
// Two things it is careful about:
//
// - it is about the RELATIONSHIP, not the person. "You have not had a 1-1 with
//   Derek yet" is a fact about a calendar; "Derek has no goals" is a report
//   card. The first is what a coach can act on and the second is the thing this
//   codebase does not write.
// - it carries no count, no rate and no red. There is nothing behind here, so
//   there is nothing to be behind ON.

export function FirstMeeting({ name, onSchedule }: { name: string; onSchedule: () => void }) {
  return (
    <section className="admin-card admin-coach-section coach-first">
      <div className="admin-card-title">You and {name} have not met yet</div>
      <p className="admin-hint">
        Book the first 1-1 and this page fills itself in: what you agree becomes the commitments below, their goal
        appears once they write it, and the prep is drafted from both before each conversation.
      </p>
      <p className="admin-hint">
        Nothing is missing here — there is simply nothing behind you two yet.
      </p>
      <div className="admin-form-actions">
        <button type="button" className="admin-btn admin-btn--growth" onClick={onSchedule}>
          Schedule the first 1-1
        </button>
      </div>
    </section>
  );
}
