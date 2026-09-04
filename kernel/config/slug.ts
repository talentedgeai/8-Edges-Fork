// The one slug rule for the codebase. Six local `slugify`s used to disagree on
// accent handling (three mangled Vietnamese titles into stray dashes), on the
// length cap, and on whether the result could be empty, so the same title
// produced different slugs depending on which admin page created the row.
//
// Rules: NFD-decompose so accented Latin (including Vietnamese ơ/ư/â/ê and tone
// marks) becomes base letter + combining marks, strip the marks, replace đ/Đ
// explicitly (they do not decompose), lowercase, collapse every non-alphanumeric
// run to a single dash, trim dashes, cap the length (default 80) and trim again
// so the cut never leaves a trailing dash. Uniqueness is the caller's job — each
// call site dedupes or relies on its table's unique constraint. An empty or
// symbol-only input yields "" so callers can substitute their own fallback.
export function slugify(text: string, max = 80): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}
