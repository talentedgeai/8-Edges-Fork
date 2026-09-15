import { headers } from "next/headers";

// Structured logging: one JSON line per call so Vercel's log drain (and a
// human reading the function logs) can filter by level, request id or any
// structured field instead of grepping prose. Writes go to console.log /
// console.error only — Vercel captures both streams, and the console is the
// one sink every runtime (node, edge, tests) shares.

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown> & {
  // The caller's identity when it is known (an admin user id, a portal member
  // id). Optional because webhooks and crons have no actor.
  actorId?: string;
};

type LogLine = {
  level: LogLevel;
  msg: string;
  ts: string;
  requestId?: string;
  actorId?: string;
  [key: string]: unknown;
};

// Vercel stamps every invocation with `x-vercel-id`; a proxy or a test may
// set `x-request-id` explicitly, and that wins when present. `headers()` throws
// when called outside a request scope (crons, scripts, tests), so the read is
// guarded and the field is simply omitted there.
function currentRequestId(): string | undefined {
  try {
    const bag = headers();
    return bag.get("x-request-id") ?? bag.get("x-vercel-id") ?? undefined;
  } catch {
    return undefined;
  }
}

// `JSON.stringify` drops undefined values, turns a bigint into a throw and an
// Error into `{}`; the replacer keeps the line emitting rather than crashing
// the caller over a field it merely wanted to log.
function replacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  return value;
}

export function log(level: LogLevel, msg: string, fields: LogFields = {}): void {
  const requestId = currentRequestId();
  const line: LogLine = {
    ...fields,
    level,
    msg,
    ts: new Date().toISOString(),
    ...(requestId ? { requestId } : {}),
  };
  const serialised = JSON.stringify(line, replacer);
  // warn and error go to stderr so Vercel flags them as errors in the function
  // log view; everything else stays on stdout.
  if (level === "error" || level === "warn") console.error(serialised);
  else console.log(serialised);
}

// The single place an error-tracking vendor (Sentry, Axiom, ...) would be
// wired later: every caught-but-unhandled error in the app should pass through
// here, so adding a vendor is one edit rather than a sweep. Deliberately no
// vendor today — Vercel's own log capture is the sink.
export function reportError(err: unknown, context: Record<string, unknown> = {}): void {
  const error =
    err instanceof Error
      ? { name: err.name, message: err.message, stack: err.stack }
      : { name: "NonError", message: safeString(err), stack: undefined };
  log("error", error.message, { ...context, error });
}

function safeString(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, replacer) ?? String(value);
  } catch {
    return String(value);
  }
}
