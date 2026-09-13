"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/entities/team/lib/actions";
import type { TeamRole } from "@/kernel/identity/team-auth";
import { capabilitiesOf } from "./team-nav-gate";
import { initials } from "@/kernel/ui/format";
import { filterNav, isSubsection, type NavGroup, type NavItem, type NavSection } from "@/kernel/shell/nav";

// Lighter sibling of AdminSidebar: reuses the admin shell CSS but drops the brand
// switcher and collapsible offices. Flat nav grouped My Work / Me / My Team / Company. Items
// without `enabled` render as muted "soon" placeholders (their slice has not shipped
// yet), mirroring the admin nav so the shell always looks complete without dead links.
//
// The rows themselves are no longer here. Each entity contributes them from its
// browser-safe door and app/nav.ts composes the ones this deployment installs
// (ADR 0002, RS-14); this component is handed the result and filters it by the
// capabilities of the person looking.

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
  sections,
  name,
  avatarUrl = null,
  role,
  isAdmin,
  isCoach = false,
  hasClients = false,
  isHiringManager = false,
}: {
  // Composed by the composition root from the installed entities (app/nav.ts).
  sections: NavSection[];
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

  const groups: NavGroup[] = filterNav(
    sections,
    capabilitiesOf(role, isCoach, isHiringManager, hasClients),
  ).flatMap((section) => section.groups);

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
              // The team hub's IA has no subsections, so every entry is a row.
              group.items.filter((e): e is NavItem => !isSubsection(e)).map((item) =>
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
