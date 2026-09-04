// One place that decides how a person's name is written and ordered.
//
// company_os.people.full_name is not a consistent shape: it holds Vietnamese
// order ("Nguyễn Chí Hiếu" = Family Middle Given) for some people and Western
// order ("Khoa Doan" = Given Family) for others, so its first token is a family
// name for one row and a given name for the next. Sorting or abbreviating it
// gives a different answer per person.
//
// people.display_name is the fix: Given + Family, in that order, using the name
// the person actually goes by. Everything user-facing reads it through
// personName() and orders with byFirstName().

export type NamedPerson = {
  display_name?: string | null;
  preferred_name?: string | null;
  full_name?: string | null;
  email?: string | null;
};

// Strips accents so "Đức" files under D and a search for "duc" finds "Đức".
// Đ/đ are not decomposable, so NFD leaves them behind and they need the
// explicit pass below.
export function foldDiacritics(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/Đ/g, "D")
    .replace(/đ/g, "d")
    .toLowerCase();
}

// What to show. display_name is authoritative; the rest is fallback for people
// who have never been through the roster (CRM contacts, old assignees).
export function personName(person: NamedPerson | null | undefined): string {
  if (!person) return "Unknown";
  return (
    person.display_name?.trim() ||
    person.preferred_name?.trim() ||
    person.full_name?.trim() ||
    person.email?.trim() ||
    "Unnamed"
  );
}

// First name first, because display_name puts the given name first. Falls
// through to the whole name so two people called Minh keep a stable order.
export function byFirstName(a: string, b: string): number {
  const af = foldDiacritics(a);
  const bf = foldDiacritics(b);
  const first = af.split(/\s+/)[0].localeCompare(bf.split(/\s+/)[0]);
  return first !== 0 ? first : af.localeCompare(bf);
}

// True when every whitespace-separated term in the query appears somewhere in
// the name, accent-insensitively. "ng th" matches "Thành Nguyễn".
export function matchesPersonQuery(name: string, query: string): boolean {
  const terms = foldDiacritics(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const hay = foldDiacritics(name);
  return terms.every((t) => hay.includes(t));
}
