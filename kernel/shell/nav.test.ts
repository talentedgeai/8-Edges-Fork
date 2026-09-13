import { describe, expect, it } from "vitest";
import { composeNav, makeIsActive, type NavContribution, type NavSlot } from "./nav";

const SLOTS: NavSlot[] = [
  { section: "OS", group: "Edges", collapsible: true },
  { section: "Offices", group: "Revenue", collapsible: true },
  { section: "Offices", group: "Revenue", subheading: "CRM" },
  { section: "Offices", group: "Revenue", subheading: "Commerce" },
  { section: "Offices", group: "Talent", subheading: "ATS", superAdmin: true },
];

const row = (label: string, href: string) => ({ label, href, ico: "*", enabled: true });

describe("composeNav", () => {
  it("orders rows inside a slot by order, not by which entity contributed first", () => {
    const late: NavContribution = { section: "OS", group: "Edges", order: 20, items: [row("B", "/b")] };
    const early: NavContribution = { section: "OS", group: "Edges", order: 10, items: [row("A", "/a")] };
    const [section] = composeNav(SLOTS, [late, early]);
    expect(section.groups[0].items.map((i) => "label" in i && i.label)).toEqual(["A", "B"]);
  });

  it("drops a slot nobody contributes to, and the group and section it empties", () => {
    const sections = composeNav(SLOTS, [
      { section: "Offices", group: "Revenue", subheading: "CRM", order: 10, items: [row("Deals", "/deals")] },
    ]);
    // No OS section at all, no Commerce subheading, no ATS: a deployment
    // without those entities shows no empty headings.
    expect(sections.map((s) => s.section)).toEqual(["Offices"]);
    expect(sections[0].groups).toHaveLength(1);
    expect(sections[0].groups[0].items).toHaveLength(1);
  });

  it("keeps the slot's own flags — collapsible on the group, superAdmin on the subsection", () => {
    const [section] = composeNav(SLOTS, [
      { section: "Offices", group: "Talent", subheading: "ATS", order: 10, items: [row("Jobs", "/jobs")] },
    ]);
    const [sub] = section.groups[0].items;
    expect("subheading" in sub && sub.superAdmin).toBe(true);
  });

  it("refuses a contribution naming a slot this shell does not declare", () => {
    expect(() =>
      composeNav(SLOTS, [{ section: "Offices", group: "Revenue", subheading: "Nope", order: 1, items: [] }]),
    ).toThrow(/names no slot/);
  });
});

describe("makeIsActive", () => {
  const sections = composeNav(SLOTS, [
    { section: "Offices", group: "Revenue", order: 5, items: [row("Cockpit", "/admin/revenue")] },
    {
      section: "Offices",
      group: "Revenue",
      subheading: "CRM",
      order: 10,
      items: [row("Deals", "/admin/revenue/deals")],
    },
  ]);
  const isActive = makeIsActive(sections);

  it("matches an index link exactly, so a child route does not light up its parent", () => {
    expect(isActive("/admin/revenue", "/admin/revenue")).toBe(true);
    expect(isActive("/admin/revenue/deals", "/admin/revenue")).toBe(false);
  });

  it("matches a leaf link by prefix, so a detail page keeps its row lit", () => {
    expect(isActive("/admin/revenue/deals/abc", "/admin/revenue/deals")).toBe(true);
  });
});
