// The C.9 sidebar matrix, asserted against the navigation this deployment
// actually ships — `TEAM_NAV` from the generated app/nav.ts, not a fixture.
// That matters: the rows are contributed by five separate entities and composed
// somewhere none of them can see, so a fixture would only prove the filter
// works on rows the test wrote itself. Reading the real nav means a row that
// loses its `when`, or an entity that contributes a row into the wrong group,
// fails here.
import { describe, expect, it } from "vitest";

// These assert the navigation of the edge8 deployment. On a tree generated for
// another deployment app/nav.ts composes a different set of entities and the
// matrices below are simply not the right ones, so the file steps aside.
const DEPLOYMENT = process.env.EDGE8_DEPLOYMENT ?? "edge8";
const describeEdge8 = DEPLOYMENT === "edge8" ? describe : describe.skip;
import { ADMIN_NAV, PORTAL_NAV, TEAM_NAV } from "@/app/nav";
import { entitlementKeys, gateByEntitlement } from "@/entities/portal/client";
import { filterNav, isSubsection, visibleTo, type NavSection } from "@/kernel/shell/nav";
import type { TeamRole } from "@/kernel/identity/team-auth";
import { capabilitiesOf } from "@/entities/team/client";

type Viewer = { role: TeamRole; coach?: boolean; hiring?: boolean; clients?: boolean };

// What this viewer's sidebar reads, group by group, top to bottom.
function sidebarOf(v: Viewer): Record<string, string[]> {
  const held = capabilitiesOf(v.role, v.coach ?? false, v.hiring ?? false, v.clients ?? false);
  const out: Record<string, string[]> = {};
  for (const section of filterNav(TEAM_NAV as NavSection[], held)) {
    for (const group of section.groups) {
      out[group.label ?? "(top)"] = group.items.map((i) => (isSubsection(i) ? `{${i.subheading}}` : i.label));
    }
  }
  return out;
}

const PLAIN: Viewer = { role: "employee" };

describeEdge8("the team hub sidebar", () => {
  it("shows a plain member no My Team group at all", () => {
    const nav = sidebarOf(PLAIN);
    // Every row in My Team is gated, so the group empties and filterNav drops
    // it — the team hub removes rows rather than muting them, unlike the portal.
    expect(nav["My Team"]).toBeUndefined();
    expect(nav["My Work"]).toEqual(["Workboard", "Time Off"]);
  });

  it("opens My Team for a coach, with Coaching but not Hiring", () => {
    const nav = sidebarOf({ role: "employee", coach: true });
    expect(nav["My Team"]).toEqual(["Coaching", "Onboarding", "Approvals"]);
  });

  it("opens My Team for a requisition owner, with Hiring but not Coaching", () => {
    const nav = sidebarOf({ role: "employee", hiring: true });
    expect(nav["My Team"]).toEqual(["Hiring", "Onboarding", "Approvals"]);
  });

  it("opens My Team for a manager, with neither Coaching nor Hiring", () => {
    // The org role opens the group; it does not make anyone a coach or a
    // hiring manager, which are held by coaching a person and owning a req.
    expect(sidebarOf({ role: "manager" })["My Team"]).toEqual(["Onboarding", "Approvals"]);
  });

  it("shows Clients only to a member with client assignments", () => {
    expect(sidebarOf(PLAIN)["My Work"]).not.toContain("Clients");
    expect(sidebarOf({ role: "employee", clients: true })["My Work"]).toEqual([
      "Workboard",
      "Clients",
      "Time Off",
    ]);
  });

  it("gives every viewer the same Me and Company rows, which nothing gates", () => {
    const me = ["My Coach", "My FAST Goals", "Reviews", "Ideas", "Profile", "My Equipment"];
    for (const v of [PLAIN, { role: "manager" } as Viewer, { role: "employee", coach: true } as Viewer]) {
      expect(sidebarOf(v)["Me"]).toEqual(me);
      expect(sidebarOf(v)["Company"]).toContain("Strategy");
    }
  });

  it("holds no capability for a viewer who is nothing in particular", () => {
    expect(capabilitiesOf("employee", false, false, false)).toEqual([]);
  });

  it("derives `manages` from any of the three, never from the role alone", () => {
    expect(capabilitiesOf("employee", true, false, false)).toContain("manages");
    expect(capabilitiesOf("employee", false, true, false)).toContain("manages");
    expect(capabilitiesOf("manager", false, false, false)).toContain("manages");
    // A client assignment is not a reason to see other people's work.
    expect(capabilitiesOf("employee", false, false, true)).toEqual(["clients"]);
  });
});

// The same idea for the portal: the entitlement rule has its own unit test
// beside the gate, on a fixture, because that file may not import app/. This
// runs the rule over the navigation the deployment actually composes, so a
// contributed row that loses its `when`, or a key nobody contributes, fails.
describeEdge8("the portal sidebar", () => {
  const NONE = Object.fromEntries(
    ["team", "timeOff", "invoices", "users", "companyProfile", "meetings", "board", "roadmap", "tokens"].map((k) => [k, false]),
  );
  const rowsOf = (held: Record<string, boolean>) =>
    gateByEntitlement(PORTAL_NAV as NavSection[], entitlementKeys(held)).flatMap((g) =>
      g.items.map((i) => (isSubsection(i) ? `{${i.subheading}}` : `${i.label}${i.enabled ? "" : " (soon)"}`)),
    );

  it("keeps every composed row for a client entitled to nothing, muted", () => {
    const rows = rowsOf(NONE);
    const gated = PORTAL_NAV.flatMap((s) => s.groups.flatMap((g) => g.items)).filter((i) => !isSubsection(i) && i.when);
    expect(gated.length).toBeGreaterThan(4);
    for (const item of gated) if (!isSubsection(item)) expect(rows).toContain(`${item.label} (soon)`);
    // and nothing is missing: the row count is the composed row count
    expect(rows.length).toBe(PORTAL_NAV.flatMap((s) => s.groups.flatMap((g) => g.items)).length);
  });

  it("uses only keys the entitlement resolver produces", () => {
    // A row gated on a key portalEntitlements never sets could never light up.
    const keys = new Set(Object.keys(NONE));
    const orphan = PORTAL_NAV.flatMap((s) => s.groups.flatMap((g) => g.items))
      .filter((i) => !isSubsection(i) && i.when && !keys.has(i.when))
      .map((i) => (isSubsection(i) ? "" : `${i.label} gated on ${i.when}`));
    expect(orphan).toEqual([]);
  });

  it("lights Users and Company Profile for an admin only", () => {
    const admin = rowsOf({ ...NONE, users: true, companyProfile: true });
    expect(admin).toContain("Users");
    expect(admin).toContain("Company Profile");
    expect(rowsOf(NONE)).toContain("Users (soon)");
  });
});

// The C.8 matrix against the real composed ADMIN_NAV. Two viewers, one
// difference: the subsections flagged superAdmin exist for a super-admin and
// not for a plain admin. Everything else — every group, every "soon" row — is
// identical for both, because a muted row is how the shell says "coming" and a
// missing row is how it says "not for you".
describeEdge8("the admin sidebar", () => {
  const flat = (sections: NavSection[]) =>
    sections.flatMap((s) =>
      s.groups.flatMap((g) =>
        g.items.map((i) =>
          isSubsection(i)
            ? `[${s.section ?? "-"}] ${g.label ?? "-"} / {${i.subheading}}: ${i.items.map((x) => x.label + (x.enabled ? "" : "~")).join(", ")}`
            : `[${s.section ?? "-"}] ${g.label ?? "-"} / ${i.label}${i.enabled ? "" : "~"}`,
        ),
      ),
    );
  const superAdmin = flat(visibleTo(ADMIN_NAV as NavSection[], true));
  const admin = flat(visibleTo(ADMIN_NAV as NavSection[], false));

  it("hides exactly the super-admin subsections from a plain admin, and nothing else", () => {
    const hidden = superAdmin.filter((row) => !admin.includes(row));
    // Two things are super-admin only: the ATS subsection, and the Agents row.
    expect(hidden).toEqual([
      "[Four Offices] Talent / {ATS}: Applications, Job Reqs, Candidate Pool",
      "[Workspace] - / Agents",
    ]);
    expect(admin.every((row) => superAdmin.includes(row))).toBe(true);
  });

  it("keeps every 'soon' row for both viewers, muted rather than dropped", () => {
    const soon = admin.filter((row) => /~/.test(row));
    expect(soon).toEqual([
      "[Operating System] Edges / Reviews~",
      "[Operating System] Company / Onboarding Deck~",
      "[Four Offices] Operations / {Workplace}: Equipment, Vendors, Gallery, Documents~, Surveys",
      "[Workspace] Settings / {Configuration}: Pipelines~, QuickBooks",
    ]);
  });

  it("ships the sections and groups in the order the shell declares", () => {
    const groups = ADMIN_NAV.flatMap((s) => s.groups.map((g) => `${s.section ?? "-"} / ${g.label ?? "-"}`));
    expect(groups).toEqual([
      "Operating System / Edges",
      "Operating System / Company",
      "Four Offices / Revenue",
      "Four Offices / Talent",
      "Four Offices / Operations",
      "Four Offices / Innovation",
      "Workspace / Settings",
      "Workspace / -",
    ]);
  });

  it("gives a super-admin every composed row, untouched", () => {
    expect(visibleTo(ADMIN_NAV as NavSection[], true)).toBe(ADMIN_NAV);
  });
});
