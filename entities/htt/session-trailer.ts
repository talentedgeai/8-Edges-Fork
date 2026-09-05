// Ported from the Human Token Tracker (lib/sync/session-trailer.ts).
//
// Parses the session trailer that client repos' committed git hook stamps on Claude
// Code commits and (via CLAUDE.md instruction) into PR bodies:
//
//   Claude-Session: 9bee5f4a-d72e-4a8d-8a02-3880a578078a
//   Claude-Session-Start: 2026-09-01T09:14:03+10:00
//
// so a PR can be paired to its session with no telemetry — the capture channel for
// locked-down contributor machines. Pure and dependency-free. The PR body is the
// primary carrier (already fetched by the sync, zero extra API calls); reading the
// same trailer off the PR's commits is a planned fallback.
// Spec: human-token-tracker docs/plans/2026-09-01-session-start-trailer.md

interface ParsedSessionTrailer {
  sessionId: string;
  /** ISO 8601 as written in the trailer (offset preserved). */
  startedAt: string;
}

// Line-anchored so prose mentioning "Claude-Session" can't match. The id accepts any
// uuid-ish token rather than strictly v4 — the value is an opaque grouping key, and
// over-strict validation would silently drop rows on a future id format change.
const SESSION_LINE = /^\s*Claude-Session:\s*([0-9a-fA-F][0-9a-fA-F-]{7,63})\s*$/m;
const START_LINE = /^\s*Claude-Session-Start:\s*(\S+)\s*$/m;

/**
 * Extract the trailer pair from a PR body. Returns null unless BOTH lines are present
 * and the start parses as a real instant — a half-trailer can't pair anything, so
 * storing it would only manufacture confusing rows.
 */
export function parseSessionTrailer(
  body: string | null | undefined,
): ParsedSessionTrailer | null {
  if (!body) return null;
  const session = SESSION_LINE.exec(body);
  const start = START_LINE.exec(body);
  if (!session || !start) return null;
  if (Number.isNaN(Date.parse(start[1]))) return null;
  return { sessionId: session[1].toLowerCase(), startedAt: start[1] };
}

/**
 * Ingest sanity gate (spec decision 4): a self-reported start must precede the work it
 * claims to precede. The PR's opened_at is the earliest server-side instant we hold
 * without an extra commits fetch, so the gate is start < opened_at — strictly, since a
 * session cannot begin at the moment its PR opens. Rejected trailers are dropped,
 * never clamped; the columns simply stay null.
 */
export function trailerIsSane(startedAtIso: string, openedAtIso: string | null): boolean {
  if (!openedAtIso) return false;
  const start = Date.parse(startedAtIso);
  const opened = Date.parse(openedAtIso);
  if (Number.isNaN(start) || Number.isNaN(opened)) return false;
  return start < opened;
}
