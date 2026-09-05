// Turning a parsed form/action input into a PostgREST patch body.
//
// The two things every admin update action needs from that conversion:
//   - a key the caller did not send is absent, not `undefined` — PostgREST
//     serializes an `undefined` value as a null write, so leaving it in would
//     blank a column the form never touched;
//   - an empty string is `null`, because an emptied optional text field means
//     "clear this", not "store the empty string".
//
// Actions whose columns need more than that (arrays to trim, numeric strings to
// coerce) keep their own richer `clean` next to the schema that defines them.
export function toPatch(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    out[k] = typeof v === "string" && v.trim() === "" ? null : v;
  }
  return out;
}
