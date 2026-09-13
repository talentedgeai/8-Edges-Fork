import { describe, expect, it } from "vitest";

import { collectReportingSubtree } from "@/kernel/identity/org-tree";

// dave -> khoa -> derek, michael; dave -> quan; mai reports to nobody here.
const rows = [
  { id: "dave", manager_id: null },
  { id: "khoa", manager_id: "dave" },
  { id: "quan", manager_id: "dave" },
  { id: "derek", manager_id: "khoa" },
  { id: "michael", manager_id: "khoa" },
  { id: "mai", manager_id: null },
];

describe("collectReportingSubtree", () => {
  it("returns the root and everyone under it, however deep", () => {
    expect(collectReportingSubtree(rows, "dave")).toEqual(["dave", "khoa", "quan", "derek", "michael"]);
  });

  it("stops at the root's own subtree", () => {
    expect(collectReportingSubtree(rows, "khoa")).toEqual(["khoa", "derek", "michael"]);
  });

  it("returns just the root for someone with no reports", () => {
    expect(collectReportingSubtree(rows, "derek")).toEqual(["derek"]);
  });

  it("terminates on a manager_id cycle", () => {
    const cyclic = [
      { id: "a", manager_id: "b" },
      { id: "b", manager_id: "a" },
    ];
    expect(collectReportingSubtree(cyclic, "a")).toEqual(["a", "b"]);
  });
});
