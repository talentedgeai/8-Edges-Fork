"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/entities/team/routes/(dashboard)/actions";
import type { TeamRole } from "@/kernel/identity/team-auth";
import { initials } from "@/kernel/ui/format";

// Lighter sibling of AdminSidebar: reuses the admin shell CSS but drops the brand
// switcher and collapsible offices. Flat nav grouped My Work / Me / My Team / Company. Items
// without `enabled` render as muted "soon" placeholders (their slice has not shipped
// yet), mirroring the admin nav so the shell always looks complete without dead links.
type NavItem = { label: string; href: string; ico: string; enabled?: boolean };
type NavGroup = { label: string | null; items: NavItem[] };

function companyGroup(): NavGroup {
  return {
    label: "Company",
    items: [
      { label: "Strategy", href: "/team/strategy", ico: "◆", enabled: true },
      { label: "Company Goals", href: "/team/company-goals", ico: "⊚", enabled: true },
      { label: "Core Values", href: "/team/values", ico: "♥", enabled: true },
      { label: "Org Chart", href: "/team/org", ico: "⌥", enabled: true },
      { label: "Directory", href: "/team/directory", ico: "☷", enabled: true },
      { label: "Gallery", href: "/team/gallery", ico: "▦", enabled: true },
      { label: "AIO Group Coaching", href: "/team/coaching-sessions", ico: "☰", enabled: true },
      { label: "Onboarding Deck", href: "/team/onboarding-deck", ico: "▷", enabled: true },
    ],
  };
}

// Coaching appears only for actors who coach >=1 person (coaching_profiles
// rows, not the manager role, dotted-line coaches included). Hiring follows the
// same idea, not the org "manager" role: it shows only to hiring managers, i.e.
// people who own a requisition (or admins). See isHiringManager in lib/team/hiring.
function myTeamGroup(isCoach: boolean, isHiringManager: boolean): NavGroup {
  return {
    label: "My Team",
    items: [
      ...(isCoach ? [{ label: "Coaching", href: "/team/coaching", ico: "◎", enabled: true }] : []),
      ...(isHiringManager ? [{ label: "Hiring", href: "/team/hiring", ico: "◇", enabled: true }] : []),
      { label: "Onboarding", href: "/team/onboarding", ico: "◐", enabled: true },
      { label: "Approvals", href: "/team/approvals", ico: "✓" },
    ],
  };
}

// Day-to-day execution: the things a member acts on for the company. "Clients"
// only shows for members assigned to a client company.
function myWorkGroup(hasClients: boolean): NavGroup {
  return {
    label: "My Work",
    items: [
      { label: "My Work Board", href: "/team/my-work-boards", ico: "☑", enabled: true },
      ...(hasClients ? [{ label: "Clients", href: "/team/clients", ico: "◔", enabled: true }] : []),
      { label: "Time Off", href: "/team/time-off", ico: "☼", enabled: true },
    ],
  };
}

// Personal growth and profile. "My Coach" shows for everyone; members without
// an active coaching cycle are redirected home by the page itself.
function meGroup(): NavGroup {
  return {
    label: "Me",
    items: [
      { label: "My Coach", href: "/team/my-coaching", ico: "◎", enabled: true },
      { label: "My FAST Goals", href: "/team/goals", ico: "◉", enabled: true },
      { label: "Reviews", href: "/team/reviews", ico: "★", enabled: true },
      { label: "Ideas", href: "/team/ideas", ico: "✦", enabled: true },
      { label: "Profile", href: "/team/profile", ico: "☺", enabled: true },
      { label: "My Equipment", href: "/team/equipment", ico: "▤", enabled: true },
    ],
  };
}

// Mirror of AdminSidebar's VIEWS: Admin and Team are separate apps, the
// switcher navigates between them. "Admin" is only live for team members who
// are also admins (see TeamActor.isAdmin in lib/team-auth.ts).
type View = { key: string; label: string; ico: string; href: string; current?: boolean };
const VIEWS: View[] = [
  { key: "team", label: "Team", ico: "☷", href: "/team", current: true },
  { key: "admin", label: "Admin", ico: "◈", href: "/admin" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/team") return pathname === "/team" || pathname === "/team/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TeamSidebar({
  name,
  avatarUrl = null,
  role,
  isAdmin,
  isCoach = false,
  hasClients = false,
  isHiringManager = false,
}: {
  name: string;
  avatarUrl?: string | null;
  role: TeamRole;
  isAdmin: boolean;
  isCoach?: boolean;
  // Team members assigned to a client see a "Clients" link under Me.
  hasClients?: boolean;
  // Hiring managers (req owners, or admins) see the Hiring link.
  isHiringManager?: boolean;
}) {
  const pathname = usePathname() ?? "";
  const [navOpen, setNavOpen] = useState(false);

  const groups: NavGroup[] = [
    { label: null, items: [{ label: "Home", href: "/team", ico: "◈", enabled: true }] },
    // Widening scope: my work, then me, then my team, then the company.
    myWorkGroup(hasClients),
    meGroup(),
    ...(role === "manager" || isCoach || isHiringManager
      ? [myTeamGroup(isCoach, isHiringManager)]
      : []),
    companyGroup(),
  ];

  // Nav starts fully collapsed: every labeled group is closed on load, so the
  // sidebar shows only the group labels until the user clicks one open.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.filter((g) => g.label).map((g) => [g.label as string, true])),
  );

  function toggleGroup(key: string) {
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  }
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const userInitials = initials(name);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setProfileMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [profileMenuOpen]);

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
        <strong>8 Edges Team</strong>
      </div>

      {navOpen && <div className="admin-scrim" onClick={() => setNavOpen(false)} />}

      <nav className={`admin-sidebar${navOpen ? " is-open" : ""}`} aria-label="Team">
        <div className="admin-brand">
          <span className="admin-brand-lead">
            8 Edges Team
          </span>
          <span className="admin-brand-actions">
            <button
              type="button"
              className="admin-avatarbtn"
              aria-haspopup="menu"
              aria-expanded={profileMenuOpen}
              aria-label="Switch view"
              onClick={() => setProfileMenuOpen((v) => !v)}
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
          <div className="admin-profilemenu" role="menu" aria-label="Switch view">
            <div className="admin-profilemenu-head">
              <span className="admin-avatarbtn admin-avatarbtn--lg" aria-hidden>
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- uploaded file of unknown size; next/image needs fixed dimensions
                  <img src={avatarUrl} alt="" />
                ) : (
                  userInitials
                )}
              </span>
              <span className="admin-profilemenu-email">{name}</span>
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
              const live = v.key === "admin" ? isAdmin : false;
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
                  title="Not an admin"
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

            <form action={signOut}>
              <button type="submit" className="admin-signout admin-profilemenu-signout">
                Sign out
              </button>
            </form>
          </div>
        )}

        <div className="admin-nav" onClick={() => setNavOpen(false)}>
          {groups.map((group, gi) => {
            const isCollapsed = Boolean(group.label && collapsed[group.label]);
            return (
            <div className="admin-nav-group" key={group.label ?? `g${gi}`}>
              {group.label && (
                <button
                  className="admin-nav-grouplabel admin-nav-grouptoggle"
                  aria-expanded={!isCollapsed}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleGroup(group.label as string);
                  }}
                >
                  {group.label}
                  <span className={`admin-nav-caret${isCollapsed ? " is-collapsed" : ""}`} aria-hidden>
                    ▾
                  </span>
                </button>
              )}
              {!isCollapsed &&
              group.items.map((item) =>
                item.enabled ? (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`admin-nav-link${isActive(pathname, item.href) ? " is-active" : ""}`}
                  >
                    <span className="admin-nav-ico" aria-hidden>
                      {item.ico}
                    </span>
                    {item.label}
                  </Link>
                ) : (
                  <span
                    key={item.href}
                    className="admin-nav-link u-disabled"
                    aria-disabled
                    title="Coming soon"
                  >
                    <span className="admin-nav-ico" aria-hidden>
                      {item.ico}
                    </span>
                    {item.label}
                    <span className="admin-nav-badge">soon</span>
                  </span>
                ),
              )}
            </div>
            );
          })}
        </div>

      </nav>
    </>
  );
}
