/**
 * Read EVERY row a query matches, not just the first page.
 *
 * Ported unchanged from the Human Token Tracker (lib/supabase/select-all.ts).
 * PostgREST caps an unpaginated `select()` at its `max-rows` setting (1000 on
 * Supabase) and returns the truncated set with no error and no warning, so any
 * read whose row count grows without bound must page.
 *
 * The loop advances by rows RECEIVED, never by rows requested, so it stays
 * correct even if the server's cap is smaller than `pageSize`. `count` comes
 * back on every page; when the server reports a total we stop the moment we
 * hold it, which also tells us a short page was genuinely the end.
 */
import type { PostgrestError } from "@supabase/supabase-js";

/** Supabase's default PostgREST `max-rows`. Requesting more per page gains nothing. */
export const SUPABASE_PAGE_SIZE = 1000;

/** Refuse to loop forever if a server keeps returning rows past any sane total. */
const MAX_PAGES = 200;

interface PagedResponse<T> {
  data: T[] | null;
  error: PostgrestError | null;
  count?: number | null;
}

interface SelectAllResult<T> {
  data: T[];
  error: PostgrestError | null;
}

/**
 * @param page Builds a FRESH query for the inclusive row range [from, to]. It
 *   must be a factory, not a single builder (a PostgREST builder is a thenable
 *   that can only be awaited once). Pass `{ count: 'exact' }` to `select()` so
 *   the total is available.
 * @returns Every matching row. On error, the rows gathered so far plus the
 *   error, so callers keep their existing throw-or-degrade behaviour.
 */
export async function selectAll<T>(
  page: (from: number, to: number) => PromiseLike<PagedResponse<T>>,
  pageSize: number = SUPABASE_PAGE_SIZE,
): Promise<SelectAllResult<T>> {
  const all: T[] = [];

  for (let pages = 0; pages < MAX_PAGES; pages += 1) {
    const { data, error, count } = await page(all.length, all.length + pageSize - 1);
    if (error) return { data: all, error };

    const batch = data ?? [];
    all.push(...batch);

    // No rows came back: the read is done (also keeps the loop finite).
    if (batch.length === 0) break;
    // The server told us the total and we now hold it.
    if (count != null && all.length >= count) break;
    // No total to compare against, and the page was short: treat as the end.
    if (count == null && batch.length < pageSize) break;
  }

  return { data: all, error: null };
}
