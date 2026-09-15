"use client";

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";

// Decide whether local state should take a freshly rendered server value.
// Reference comparison is deliberate: server components produce a new array or
// object on every render, so a new identity means "the server re-rendered",
// and a mutation in flight means the optimistic local state must win until it
// settles. Kept pure so it can be unit-tested without a React renderer.
export function shouldAdoptServerValue<T>(prevServer: T, nextServer: T, pending: number): boolean {
  return pending === 0 && !Object.is(prevServer, nextServer);
}

export type ServerSyncControls = {
  // Number of mutations currently in flight. Boards pass `pending > 0` to
  // KanbanBoard's `disabled` so a second drag cannot start mid-write.
  pending: number;
  begin: () => void;
  end: () => void;
};

// Local state seeded from a server-rendered prop that keeps following the prop.
// Optimistic UIs here call `router.refresh()` after every mutation; without this
// hook the component would seed `useState` once and ignore every later prop, so
// server-side effects of a move (positions renumbered, closed dates, another
// admin's changes) stayed invisible until a hard reload.
//
// Contract: `serverValue` is mirrored into `state` whenever its identity changes
// and no mutation is in flight (`pending === 0`). `begin()` / `end()` bracket a
// mutation. A prop change seen while pending is recorded but not adopted, so the
// *next* change after `end()` is what syncs — the caller's `router.refresh()`
// on completion is what produces that change.
//
// Failure handling is "server-truth rollback": on a failed write, show the
// banner and `router.refresh()`; the hook re-syncs from what the server says.
export function useServerSyncedState<T>(
  serverValue: T,
): [T, Dispatch<SetStateAction<T>>, ServerSyncControls] {
  const [state, setState] = useState<T>(serverValue);
  const [seenServer, setSeenServer] = useState<T>(serverValue);
  const [pending, setPending] = useState(0);

  // Adjusting state in response to a prop change during render (rather than in
  // an effect) is the React-documented pattern: it avoids painting one frame of
  // stale data before the sync lands.
  if (!Object.is(seenServer, serverValue)) {
    setSeenServer(serverValue);
    if (shouldAdoptServerValue(seenServer, serverValue, pending)) setState(serverValue);
  }

  const begin = useCallback(() => setPending((n) => n + 1), []);
  const end = useCallback(() => setPending((n) => Math.max(0, n - 1)), []);

  return [state, setState, { pending, begin, end }];
}
