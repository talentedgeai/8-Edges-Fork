// Build a querystring for admin list pages, merging the current searchParams
// with overrides. Pass null/"" to drop a key. Used by sortable headers,
// pagination, and search to preserve unrelated filters.

export type SearchParamsObj = Record<string, string | string[] | undefined>;

export function mergeQuery(
  current: SearchParamsObj,
  overrides: Record<string, string | number | null | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    if (v === undefined) continue;
    params.set(k, Array.isArray(v) ? v[0] : v);
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null || v === undefined || v === "") params.delete(k);
    else params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
