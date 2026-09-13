// The generated app/ follows the deployment, and so do the three hand-written
// surface shells: a shell is kept only when the entity that owns its surface
// is installed. Without this the minimal deployment carried the team hub's
// layout — which imports the team and coaching doors — with no page under it.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { generateMounts, installedEntities, orphanLayouts, SURFACE_LAYOUT_OWNER } from "./gen-app-mounts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("surface shells follow their entity", () => {
  it("keeps all three shells for the full catalogue", () => {
    expect(orphanLayouts(installedEntities(root, "edge8"))).toEqual([]);
  });

  it("drops the team shell for a deployment without the team entity", () => {
    const installed = installedEntities(root, "minimal");
    expect(installed.has("team")).toBe(false);
    expect(orphanLayouts(installed)).toEqual(["app/team/(dashboard)/layout.tsx"]);
  });

  it("names an owner for every shell, and only shells", () => {
    expect(Object.keys(SURFACE_LAYOUT_OWNER).sort()).toEqual([
      "app/admin/(dashboard)/layout.tsx",
      "app/portal/(dashboard)/layout.tsx",
      "app/team/(dashboard)/layout.tsx",
    ]);
  });

  it("mounts the counts the docs quote — 398 for edge8, 140 for minimal", () => {
    // The numbers appear in CLAUDE.md and the PR text; a generator change that
    // moves them should have to say so here.
    expect(Object.keys(generateMounts(root, "edge8")).length).toBe(398);
    expect(Object.keys(generateMounts(root, "minimal")).length).toBe(140);
  });

  it("generates no page under a shell it drops", () => {
    // A dropped shell with a page still under it would be a build error; the
    // two decisions come from the same installed set, so they cannot disagree.
    const files = Object.keys(generateMounts(root, "minimal"));
    expect(files.some((f) => f.startsWith("app/team/"))).toBe(false);
  });
});
