"use client";

import { useId, useState, type ReactNode } from "react";

// The roster row's phone disclosure (K.58). At a phone width a row shows the
// person, the one sentence about their next 1-1 and the row's action bar; the
// goal and the "since your last 1-1" cluster sit behind "More". A coach
// thumbing down six rows is looking for the two that want something today, and
// four sentences each turns that scan into a read (ui-ux-pro-max priority 8 —
// progressive disclosure, "Don't: overwhelm upfront").
//
// It is a toggle rather than a <details> because at 720px and up there is no
// disclosure at all: the wrapper becomes `display: contents` so its children
// join the row's grid directly, and the button is hidden. A <details> would
// need its closed state overridden by the same stylesheet, which is exactly the
// kind of rule that breaks quietly when a browser changes how it hides one.
//
// The button carries `aria-expanded` and `aria-controls`, so the state is real
// to a screen reader on a phone; at desktop the button is `display: none` and so
// leaves the accessibility tree with its collapsed state, while the content it
// named stays where it always was.
export function RosterRowMore({ name, children }: { name: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();

  return (
    <>
      <button
        type="button"
        className="coach-roster-more-toggle"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((was) => !was)}
      >
        {open ? "Less" : "More"} about {name}
      </button>
      {/* `data-open` rather than the `hidden` attribute, because at 720px and up
          this content is visible: `hidden` would also take it out of the
          accessibility tree, and a wide screen would be reading a row that is
          missing two of its facts. */}
      <div id={bodyId} className="coach-roster-more" data-open={open ? "true" : "false"}>
        {children}
      </div>
    </>
  );
}
