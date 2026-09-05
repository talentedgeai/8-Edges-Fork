import { describe, expect, it } from "vitest";

import { contentTypeFor, looksLikeFileName, resolvePrivateDocPath } from "@/entities/library/lib/private-docs";

const ROOT = "/srv/app/private-docs/workflows/private";

describe("resolvePrivateDocPath", () => {
  it("resolves a plain nested document", () => {
    expect(resolvePrivateDocPath(ROOT, ["e8", "8-edges-business-model.html"])).toBe(
      `${ROOT}/e8/8-edges-business-model.html`,
    );
  });

  it("resolves an asset under a brand folder", () => {
    expect(
      resolvePrivateDocPath(ROOT, ["ai-officer-institute", "assets", "hero.webp"]),
    ).toBe(`${ROOT}/ai-officer-institute/assets/hero.webp`);
  });

  it("rejects a literal parent-directory segment", () => {
    expect(resolvePrivateDocPath(ROOT, ["..", "..", "package.json"])).toBeNull();
    expect(resolvePrivateDocPath(ROOT, ["e8", "..", "..", "..", "next.config.mjs"])).toBeNull();
  });

  it("rejects a percent-encoded traversal that Next has already decoded", () => {
    // /workflows/private/..%2F..%2Fpackage.json arrives as one decoded segment.
    expect(resolvePrivateDocPath(ROOT, ["../../package.json"])).toBeNull();
    expect(resolvePrivateDocPath(ROOT, ["..\\..\\package.json"])).toBeNull();
  });

  it("rejects an absolute path segment", () => {
    expect(resolvePrivateDocPath(ROOT, ["/etc/passwd"])).toBeNull();
  });

  it("rejects a NUL byte and an empty segment list", () => {
    expect(resolvePrivateDocPath(ROOT, ["e8", "a\u0000.html"])).toBeNull();
    expect(resolvePrivateDocPath(ROOT, [])).toBeNull();
    expect(resolvePrivateDocPath(ROOT, [""])).toBeNull();
  });

  it("rejects a sibling directory that merely shares the root's prefix", () => {
    // A naive startsWith(root) check would let "private-docs/workflows/private-secrets"
    // through; the guard must compare on a path boundary.
    expect(resolvePrivateDocPath(ROOT, ["..", "private-secrets", "x.html"])).toBeNull();
  });

  it("rejects a dotfile", () => {
    expect(resolvePrivateDocPath(ROOT, [".env"])).toBeNull();
  });
});

// e8/[slug] serves two different things depending on this answer: a moved
// static file, or a Supabase Storage document. Getting it wrong 404s a whole
// class of URL, which is exactly what happened before this split existed —
// isValidSlug rejects the dot, so every /e8/*.html document went missing the
// moment those files stopped being static.
describe("looksLikeFileName", () => {
  it("recognises the moved static documents by their extension", () => {
    expect(looksLikeFileName("8-edges-business-model.html")).toBe(true);
    expect(looksLikeFileName("hero.webp")).toBe(true);
  });

  it("treats an extension-less Storage slug as not a file", () => {
    expect(looksLikeFileName("claude-md-cleanup")).toBe(false);
    expect(looksLikeFileName("data-atlas")).toBe(false);
  });
});

describe("contentTypeFor", () => {
  it("maps the three extensions the library actually ships", () => {
    expect(contentTypeFor("x.html")).toBe("text/html; charset=utf-8");
    expect(contentTypeFor("x.webp")).toBe("image/webp");
    expect(contentTypeFor("x.svg")).toBe("image/svg+xml");
  });

  it("is case-insensitive about the extension", () => {
    expect(contentTypeFor("X.HTML")).toBe("text/html; charset=utf-8");
  });

  it("returns null for anything it does not know, so the route can 404", () => {
    expect(contentTypeFor("x.mjs")).toBeNull();
    expect(contentTypeFor("noextension")).toBeNull();
  });
});
