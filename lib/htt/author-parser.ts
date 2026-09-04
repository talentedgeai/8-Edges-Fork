// Ported unchanged from the Human Token Tracker (lib/github/author-parser.ts).
// Parses the optional <!-- author: handle email --> block from a PR body.

export interface CoAuthor {
  handle: string;
  email: string;
}
export interface AuthorBlock {
  authorHandle: string | null;
  authorEmail: string | null;
  coAuthors: CoAuthor[];
}

const AUTHOR_RE = /<!--\s*author:\s*(\S+)\s+(\S+)\s*-->/i;
const COAUTHORS_RE = /<!--\s*co-authors:\s*(.+?)\s*-->/i;
const PAIR_RE = /(\S+)\s+(\S+)/;

const EMPTY: AuthorBlock = { authorHandle: null, authorEmail: null, coAuthors: [] };

export function parseAuthorBlock(body: string | null | undefined): AuthorBlock {
  if (!body) return { ...EMPTY };

  const author = AUTHOR_RE.exec(body);
  const co = COAUTHORS_RE.exec(body);

  const coAuthors: CoAuthor[] = co
    ? co[1]
        .split(",")
        .map((chunk) => {
          const m = PAIR_RE.exec(chunk.trim());
          return m ? { handle: m[1], email: m[2] } : null;
        })
        .filter((x): x is CoAuthor => x !== null)
    : [];

  return {
    authorHandle: author ? author[1] : null,
    authorEmail: author ? author[2] : null,
    coAuthors,
  };
}
