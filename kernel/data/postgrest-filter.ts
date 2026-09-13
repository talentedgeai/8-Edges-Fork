// Making user text safe to put inside a PostgREST filter string.
//
// PostgREST parses `or(...)` and `like(...)` arguments as its own little
// grammar, so a term that reaches one of them unfiltered is not just a bad
// search — a comma or a paren ends the current condition and starts one of the
// typist's choosing. Both the deal referrer typeahead and the invoice company
// typeahead build such a string, and they are in different entities, so the
// helper belongs to the data kernel rather than to either of them.

/** Strips the characters PostgREST reads as filter syntax. The referrer
 *  typeahead drops a raw term into an `or(...)` string, where a stray comma or
 *  paren would either break the filter or add a condition of the caller's
 *  choosing. */
export function stripPostgrestMetacharacters(term: string): string {
  return term.replace(/[,%()*\\]/g, "");
}
