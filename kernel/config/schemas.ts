import type { ZodIssue } from "zod";

// Turns a failed `safeParse` into the one-line `error` string a server action
// returns. Each issue is prefixed with its field path so the user (and the
// developer reading a log) can tell which input was wrong; issues on the root
// object have no path and are reported bare. Actions should never hand the raw
// `ZodError` to the client — its message is a JSON dump, not a sentence.
export function zodIssuesToMessage(issues: ZodIssue[]): string {
  if (issues.length === 0) return "Invalid input.";
  return issues
    .map((issue) => (issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message))
    .join("; ");
}
