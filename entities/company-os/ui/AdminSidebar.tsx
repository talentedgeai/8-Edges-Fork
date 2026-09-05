"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/entities/company-os/routes/(dashboard)/actions";

// Nav is data-driven. `enabled: false` items render muted with a "soon" tag and
// are not navigable — flip them to `true` (and build the route) as each phase
// ships, so the shell always looks complete without dead 404 links.
type NavItem = { label: string; href: string; ico: string; enabled?: boolean; superAdmin?: boolean };
// `superAdmin: true` restricts a subsection (or a top-level item) to super
// admins (Dave & Mai). It is hidden for everyone else; the routes are gated
// server-side regardless (ATS route layouts + action gates), so this is a nav
// convenience, not the boundary.
type NavSubsection = { subheading: string; items: NavItem[]; superAdmin?: boolean };
type NavEntry = NavItem | NavSubsection;
type NavGroup = { label: string | null; items: NavEntry[]; collapsible?: boolean };
type NavSection = { section: string | null; groups: NavGroup[] };

const isSubsection = (e: NavEntry): e is NavSubsection => "subheading" in e;

// Nav starts fully collapsed: every collapsible group and every subsection is
// closed on load, so the sidebar shows only the top-level labels. Clicking a
// group (e.g. Revenue) reveals its subsections (CRM, Commerce, Marketing).
function buildCollapsed(): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const sect of NAV) {
    for (const group of sect.groups) {
      if (group.label && group.collapsible) map[group.label] = true;
      for (const entry of group.items) {
        if (isSubsection(entry)) map[`${group.label ?? ""}/${entry.subheading}`] = true;
      }
    }
  }
  return map;
}

// Three labeled sections (agreed 2026-08-09, see
// docs/product/eight-edges/eight-edges-engineering-plan.md): 8 EDGES points
// the company (Company Dashboard = the unchanged /admin home, plus the Edges
// pages), FOUR OFFICES runs it (the nested-by-office IA: every feature lives
// under a System inside an Office, see
// docs/product/four-offices-of-the-future.md), WORKSPACE configures it.
// Offices and Systems both collapse. Rows open the shared 360s.
const NAV: NavSection[] = [
  {
    section: "Operating System",
    groups: [
      {
        label: "Edges",
        collapsible: true,
        items: [
          { label: "Company Dashboard", href: "/admin", ico: "◈", enabled: true },
          // Client Hubs replaces the standalone Work Boards + Client Roadmaps:
          // pick a client, land on their hub (board + roadmap now editable there).
          { label: "Client Hubs", href: "/admin/client-hubs", ico: "▦", enabled: true },
          // Goals editing moved to the Company group below (single place; the
          // old /admin/edges/goals cascade board is unlinked but still routable).
          { label: "Sync", href: "/admin/edges/sync", ico: "☰", enabled: true },
          { label: "Issues", href: "/admin/edges/issues", ico: "◉", enabled: true },
          { label: "Reviews", href: "/admin/edges/reviews", ico: "✓" },
        ],
      },
      {
        // The company-visible pages the team reads under /team (Strategy →
        // Company Goals → individual goals), edited here. Shared components
        // render both surfaces; see components/company/*.
        label: "Company",
        collapsible: true,
        items: [
          { label: "Strategy", href: "/admin/company/strategy", ico: "◆", enabled: true },
          { label: "Company Goals", href: "/admin/company/goals", ico: "⊚", enabled: true },
          { label: "Core Values", href: "/admin/company/values", ico: "♥", enabled: true },
          { label: "Org Chart", href: "/admin/company/org", ico: "⌥", enabled: true },
          { label: "Onboarding Deck", href: "/admin/company/onboarding-deck", ico: "▷", enabled: true },
        ],
      },
    ],
  },
  {
    section: "Four Offices",
    groups: [
  {
    label: "Revenue",
    collapsible: true,
    items: [
      {
        subheading: "CRM",
        items: [
          { label: "Cockpit", href: "/admin/revenue", ico: "◎", enabled: true },
          { label: "Deals", href: "/admin/revenue/deals", ico: "$", enabled: true },
          { label: "Leads", href: "/admin/revenue/leads", ico: "◉", enabled: true },
          { label: "Inquiries", href: "/admin/revenue/inquiries", ico: "☰", enabled: true },
          { label: "Companies", href: "/admin/revenue/companies", ico: "▣", enabled: true },
          { label: "Clients", href: "/admin/revenue/clients", ico: "★", enabled: true },
          { label: "Contacts", href: "/admin/contacts", ico: "⚇", enabled: true },
          { label: "Meeting Notes", href: "/admin/revenue/meetings", ico: "☰", enabled: true },
          { label: "Sales Intelligence", href: "/admin/revenue/sales-intelligence", ico: "◭", enabled: true },
        ],
      },
      {
        subheading: "Commerce",
        items: [
          { label: "Orders", href: "/admin/revenue/orders", ico: "⛁", enabled: true },
          { label: "Invoices", href: "/admin/revenue/invoices", ico: "¤", enabled: true },
          { label: "AIO Pad", href: "/admin/revenue/aio-pad", ico: "⌂", enabled: true },
          { label: "Events", href: "/admin/revenue/events", ico: "✓", enabled: true },
          { label: "Products", href: "/admin/revenue/products", ico: "▦", enabled: true },
          { label: "Affiliates", href: "/admin/revenue/affiliates", ico: "%", enabled: true },
        ],
      },
      {
        subheading: "Marketing",
        items: [
          { label: "Overview", href: "/admin/revenue/marketing", ico: "◑", enabled: true },
          { label: "Campaigns", href: "/admin/revenue/marketing/campaigns", ico: "◎", enabled: true },
          { label: "Broadcasts", href: "/admin/revenue/marketing/broadcasts", ico: "✉", enabled: true },
          { label: "Brands", href: "/admin/revenue/marketing/brands", ico: "◈", enabled: true },
          { label: "Books", href: "/admin/revenue/marketing/books", ico: "❒", enabled: true },
        ],
      },
    ],
  },
  {
    label: "Talent",
    collapsible: true,
    items: [
      { label: "Cockpit", href: "/admin/talent", ico: "◎", enabled: true },
      {
        subheading: "People",
        items: [
          { label: "Team", href: "/admin/talent/team", ico: "☷", enabled: true },
          { label: "Onboarding", href: "/admin/talent/onboarding", ico: "◐", enabled: true },
          { label: "Probation", href: "/admin/talent/probation", ico: "◔", enabled: true },
        ],
      },
      {
        subheading: "ATS",
        superAdmin: true,
        items: [
          { label: "Applications", href: "/admin/talent/applications", ico: "⇉", enabled: true },
          { label: "Job Reqs", href: "/admin/talent/jobs", ico: "▤", enabled: true },
          { label: "Candidate Pool", href: "/admin/talent/candidate-pool", ico: "↥", enabled: true },
        ],
      },
    ],
  },
  {
    label: "Operations",
    collapsible: true,
    items: [
      { label: "Cockpit", href: "/admin/operations", ico: "◎", enabled: true },
      {
        subheading: "Time Off",
        items: [
          { label: "Requests", href: "/admin/operations/time-off/requests", ico: "☼", enabled: true },
          { label: "Policies", href: "/admin/operations/time-off/policies", ico: "☑", enabled: true },
          { label: "Time Off History", href: "/admin/operations/time-off/history", ico: "☷", enabled: true },
        ],
      },
      {
        subheading: "Contractors",
        items: [
          { label: "Work Requests", href: "/admin/operations/contractor-requests", ico: "✎", enabled: true },
          { label: "Contractors", href: "/admin/operations/contractors", ico: "⚒", enabled: true },
          { label: "Payments", href: "/admin/operations/contractor-payments", ico: "$", enabled: true },
        ],
      },
      {
        subheading: "Retreats",
        items: [
          { label: "Retreats P&L", href: "/admin/operations/retreats", ico: "◇", enabled: true },
        ],
      },
      {
        subheading: "Workplace",
        items: [
          { label: "Equipment", href: "/admin/operations/equipment", ico: "▤", enabled: true },
          { label: "Vendors", href: "/admin/operations/vendors", ico: "▥", enabled: true },
          { label: "Gallery", href: "/admin/operations/gallery", ico: "▦", enabled: true },
          { label: "Documents", href: "/admin/operations/documents", ico: "⎙" },
          { label: "Surveys", href: "/admin/operations/surveys", ico: "✎", enabled: true },
        ],
      },
      {
        subheading: "Insights",
        items: [
          { label: "Analytics", href: "/admin/operations/analytics", ico: "▲", enabled: true },
        ],
      },
    ],
  },
  {
    label: "Innovation",
    collapsible: true,
    items: [
      { label: "Cockpit", href: "/admin/innovation", ico: "◎", enabled: true },
      {
        subheading: "Ideas",
        items: [{ label: "Idea backlog", href: "/admin/innovation/ideas", ico: "✦", enabled: true }],
      },
    ],
  },
    ],
  },
  {
    section: "Workspace",
    groups: [
  {
    label: "Settings",
    collapsible: true,
    items: [
      {
        subheading: "Access",
        items: [
          { label: "Admins", href: "/admin/settings/admins", ico: "⚿", enabled: true },
          { label: "Assume", href: "/admin/settings/assume", ico: "⧉", enabled: true },
        ],
      },
      {
        subheading: "Configuration",
        items: [
          { label: "Pipelines", href: "/admin/settings/pipelines", ico: "⇶" },
          { label: "QuickBooks", href: "/admin/settings/quickbooks", ico: "⌁", enabled: true },
        ],
      },
    ],
  },
  // Agents sits at the top level of Workspace, a peer of Settings rather than
  // buried under it. Still super-admin only (Dave & Mai); the route is gated
  // server-side regardless.
  {
    label: null,
    items: [{ label: "Agents", href: "/admin/settings/agents", ico: "⟳", enabled: true, superAdmin: true }],
  },
    ],
  },
];

// The views a user can land in. Admin and Team are SEPARATE apps (/admin and
// /team); the switcher navigates between them rather than re-scoping /admin.
// `current` marks where we are now. "Team" is only live for admins who also
// have a linked, active team_members record (see hasTeamAccess() in
// lib/team-auth.ts) — everyone else sees it disabled.
type View = { key: string; label: string; ico: string; href: string; current?: boolean };
const VIEWS: View[] = [
  { key: "admin", label: "Admin", ico: "◈", href: "/admin", current: true },
  { key: "team", label: "Team", ico: "☷", href: "/team" },
];

// Every href in NAV, so isActive can tell an index link from a leaf without a
// hand-maintained list. This used to be `href === "/admin" || href ===
// "/admin/revenue"`, which meant adding any route nested under an existing nav
// item silently lit up both rows at once: the parent matched by prefix and the
// child matched exactly. Deriving it from the nav data means the next nested
// route just works.
const NAV_HREFS: string[] = NAV.flatMap((section) =>
  section.groups.flatMap((group) =>
    group.items.flatMap((entry) => (isSubsection(entry) ? entry.items : [entry])).map((item) => item.href),
  ),
);

// A link is an index when another nav item lives beneath it (/admin holds
// /admin/revenue, /admin/revenue/marketing holds .../campaigns). Index links
// match exactly so they do not light up on every child route.
const INDEX_HREFS = new Set(
  NAV_HREFS.filter((href) => NAV_HREFS.some((other) => other !== href && other.startsWith(`${href}/`))),
);

function isActive(pathname: string, href: string): boolean {
  if (INDEX_HREFS.has(href)) return pathname === href || pathname === `${href}/`;
  return pathname === href || pathname.startsWith(`${href}/`);
}

// No name/profile record yet, so derive a monogram from the email local part:
// "dave.hajdu@…" -> "DH", "dave@…" -> "DA".
function initials(email: string): string {
  const local = (email.split("@")[0] || email).trim();
  const parts = local.split(/[.\-_]+/).filter(Boolean);
  const raw = parts.length >= 2 ? parts[0][0] + parts[1][0] : local.slice(0, 2);
  return raw.toUpperCase();
}

export function AdminSidebar({
  user,
  avatarUrl,
  canSwitchToTeam,
  isSuperAdmin,
}: {
  user: { email: string };
  avatarUrl: string | null;
  canSwitchToTeam: boolean;
  isSuperAdmin: boolean;
}) {
  const pathname = usePathname() ?? "";
  const [navOpen, setNavOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(buildCollapsed);
  const userInitials = initials(user.email);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setProfileMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [profileMenuOpen]);

  function toggle(key: string) {
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  }

  function renderItem(item: NavItem, isSub: boolean) {
    const cls = `admin-nav-link${isActive(pathname, item.href) ? " is-active" : ""}${isSub ? " is-sub" : ""}`;
    if (item.enabled) {
      return (
        <Link key={item.href} href={item.href} className={cls}>
          <span className="admin-nav-ico" aria-hidden>
            {item.ico}
          </span>
          {item.label}
        </Link>
      );
    }
    return (
      <span
        key={item.href}
        className={`${cls} u-disabled`}
        aria-disabled
        title="Coming in a later phase"
      >
        <span className="admin-nav-ico" aria-hidden>
          {item.ico}
        </span>
        {item.label}
        <span className="admin-nav-badge">soon</span>
      </span>
    );
  }

  function renderSubsection(sub: NavSubsection, groupLabel: string | null) {
    const key = `${groupLabel ?? ""}/${sub.subheading}`;
    const subCollapsed = Boolean(collapsed[key]);
    return (
      <div key={`sub-${key}`}>
        <button
          className="admin-nav-subhead admin-nav-subtoggle"
          aria-expanded={!subCollapsed}
          onClick={(e) => {
            e.stopPropagation();
            toggle(key);
          }}
        >
          {sub.subheading}
          <span className={`admin-nav-caret${subCollapsed ? " is-collapsed" : ""}`} aria-hidden>
            ▾
          </span>
        </button>
        {!subCollapsed && (
          <div className="admin-nav-railgroup">
            {sub.items.map((item) => renderItem(item, true))}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="admin-mobilebar">
        <button
          className="admin-mobile-toggle"
          aria-label="Open navigation"
          onClick={() => setNavOpen(true)}
        >
          ☰
        </button>
        <strong>8 Edges</strong>
      </div>

      {navOpen && <div className="admin-scrim" onClick={() => setNavOpen(false)} />}

      <nav className={`admin-sidebar${navOpen ? " is-open" : ""}`} aria-label="Admin">
        <div className="admin-brand">
          <span className="admin-brand-lead">
            8 Edges
          </span>
          <span className="admin-brand-actions">
            <button
              type="button"
              className="admin-iconbtn"
              aria-disabled
              aria-label="Inbox"
              title="Inbox (coming soon)"
            >
              ✉
            </button>
            <button
              type="button"
              className="admin-avatarbtn"
              aria-haspopup="menu"
              aria-expanded={profileMenuOpen}
              aria-label="Profile and views"
              onClick={() => {
                setProfileMenuOpen((v) => !v);
              }}
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- uploaded file of unknown size; next/image needs fixed dimensions
                <img src={avatarUrl} alt="" />
              ) : (
                userInitials
              )}
            </button>
          </span>
        </div>

        {profileMenuOpen && (
          <div className="admin-profilemenu-backdrop" onClick={() => setProfileMenuOpen(false)} />
        )}
        {profileMenuOpen && (
          <div className="admin-profilemenu" role="menu" aria-label="Profile and views">
            <div className="admin-profilemenu-head">
              <span className="admin-avatarbtn admin-avatarbtn--lg" aria-hidden>
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- uploaded file of unknown size; next/image needs fixed dimensions
                  <img src={avatarUrl} alt="" />
                ) : (
                  userInitials
                )}
              </span>
              <span className="admin-profilemenu-email">{user.email}</span>
            </div>

            <div className="admin-profilemenu-label">Switch view</div>
            {VIEWS.map((v) => {
              if (v.current) {
                return (
                  <span key={v.key} className="admin-profilemenu-item" role="menuitem" aria-current="true">
                    <span className="admin-profilemenu-ico" aria-hidden>
                      {v.ico}
                    </span>
                    {v.label}
                    <span className="admin-profilemenu-here">Current</span>
                  </span>
                );
              }
              const live = v.key === "team" ? canSwitchToTeam : false;
              if (live) {
                return (
                  <Link
                    key={v.key}
                    href={v.href}
                    className="admin-profilemenu-item"
                    role="menuitem"
                    onClick={() => setProfileMenuOpen(false)}
                  >
                    <span className="admin-profilemenu-ico" aria-hidden>
                      {v.ico}
                    </span>
                    {v.label}
                  </Link>
                );
              }
              return (
                <span
                  key={v.key}
                  className="admin-profilemenu-item is-disabled"
                  role="menuitem"
                  aria-disabled
                  title="No linked team account"
                >
                  <span className="admin-profilemenu-ico" aria-hidden>
                    {v.ico}
                  </span>
                  {v.label}
                  <span className="admin-nav-badge">n/a</span>
                </span>
              );
            })}

            <div className="admin-profilemenu-sep" />

            <span
              className="admin-profilemenu-item is-disabled"
              role="menuitem"
              aria-disabled
              title="Coming soon"
            >
              <span className="admin-profilemenu-ico" aria-hidden>
                ☺
              </span>
              My profile
              <span className="admin-nav-badge">soon</span>
            </span>

            <form action={signOut}>
              <button type="submit" className="admin-signout admin-profilemenu-signout">
                Sign out
              </button>
            </form>
          </div>
        )}

        <div className="admin-nav" onClick={() => setNavOpen(false)}>
          {NAV.map((sect, si) => (
            <div key={sect.section ?? `s${si}`}>
              {sect.section && <div className="admin-nav-sectlabel">{sect.section}</div>}
              {sect.groups.map((group, gi) => {
            const label = group.label;
            const isCollapsed = Boolean(label && group.collapsible && collapsed[label]);
            return (
            <div className="admin-nav-group" key={label ?? `g${gi}`}>
              {label && group.collapsible ? (
                <button
                  className="admin-nav-grouplabel admin-nav-grouptoggle"
                  aria-expanded={!isCollapsed}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(label);
                  }}
                >
                  {label}
                  <span className={`admin-nav-caret${isCollapsed ? " is-collapsed" : ""}`} aria-hidden>
                    ▾
                  </span>
                </button>
              ) : (
                label && <div className="admin-nav-grouplabel">{label}</div>
              )}
              {!isCollapsed &&
              group.items.map((entry) =>
                isSubsection(entry)
                  ? entry.superAdmin && !isSuperAdmin
                    ? null
                    : renderSubsection(entry, label)
                  : entry.superAdmin && !isSuperAdmin
                    ? null
                    : renderItem(entry, false),
              )}
            </div>
            );
              })}
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}
