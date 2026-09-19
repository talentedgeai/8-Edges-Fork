// The navigation contract between a surface's shell and the entities installed
// in it (ADR 0002, docs/adr/0002-kernel-shells-and-entity-contributions.md).
//
// A surface — Admin, the team hub, the client portal — is a shell the kernel
// owns: the layout, the sidebar chrome and the information architecture. The IA
// is a product decision about how the company is organised, not a fact about
// any one entity, so the skeleton below lives with the shell and names only
// empty slots. Each entity contributes the items that belong in a slot, from its
// browser-safe door, and the composition root hands the shell the contributions
// of the entities this deployment installs (app/nav.ts, generated).
//
// The consequence is the one ADR 0002 wanted: dropping an entity from a
// deployment drops its nav rows with it, and no entity has to know that another
// one exists.

/** A single navigable row. `enabled: false` renders muted with a "soon" tag and
 *  does not navigate, so a shell can look complete before a route exists. */
export type NavItem = {
  label: string;
  href: string;
  ico: string;
  enabled?: boolean;
  /** Hidden for everyone but super admins. The route is gated server-side
   *  regardless — this is a nav convenience, never the boundary. */
  superAdmin?: boolean;
  /** A capability key the viewer must hold for this row to appear: "coach" on
   *  the team hub, an entitlement on the portal. Deployment decides which rows
   *  exist at all; this decides which of them *this* person sees. The route is
   *  gated server-side regardless. */
  when?: string;
};

/** A labelled run of rows inside a group, e.g. "CRM" inside Revenue. */
export type NavSubsection = { subheading: string; items: NavItem[]; superAdmin?: boolean };
export type NavEntry = NavItem | NavSubsection;
export type NavGroup = { label: string | null; items: NavEntry[]; collapsible?: boolean };
export type NavSection = { section: string | null; groups: NavGroup[] };

export const isSubsection = (e: NavEntry): e is NavSubsection => "subheading" in e;

// ── The skeleton ────────────────────────────────────────────────────────────
// A slot is addressed by section, group and (optionally) subheading. The shell
// declares the slots in display order; a contribution names one and supplies
// rows. `order` breaks ties inside a slot so two entities contributing to the
// same subheading land in a stable order rather than in install order.

export type SlotId = { section: string | null; group: string | null; subheading?: string };

export type NavSlot = SlotId & {
  /** Rendered even when no installed entity contributes to it. */
  collapsible?: boolean;
  superAdmin?: boolean;
};

export type NavContribution = SlotId & { order: number; items: NavItem[] };

const sameSlot = (a: SlotId, b: SlotId) =>
  a.section === b.section && a.group === b.group && (a.subheading ?? null) === (b.subheading ?? null);

/**
 * Fill a shell's slots with the contributions of the entities installed here.
 *
 * Slots nobody contributes to are dropped rather than rendered empty: a
 * deployment without the CRM entity should show no CRM subheading at all, not a
 * heading with nothing under it. Groups and sections left empty by that go the
 * same way, so the IA collapses cleanly around what is installed.
 *
 * A contribution naming a slot the shell does not declare is a bug in the
 * entity, not a reason to render something the IA never planned for, so it
 * throws rather than appending an unplaced row.
 */
export function composeNav(slots: NavSlot[], contributions: NavContribution[]): NavSection[] {
  for (const c of contributions) {
    if (!slots.some((s) => sameSlot(s, c))) {
      throw new Error(
        `nav contribution names no slot in this shell: ${c.section ?? "-"} / ${c.group ?? "-"} / ${c.subheading ?? "-"}`,
      );
    }
  }
  const itemsFor = (slot: NavSlot): NavItem[] =>
    contributions
      .filter((c) => sameSlot(slot, c))
      .sort((a, b) => a.order - b.order)
      .flatMap((c) => c.items);

  const sections: NavSection[] = [];
  for (const slot of slots) {
    const items = itemsFor(slot);
    if (items.length === 0) continue;
    let section = sections.find((s) => s.section === slot.section);
    if (!section) {
      section = { section: slot.section, groups: [] };
      sections.push(section);
    }
    let group = section.groups.find((g) => g.label === slot.group);
    if (!group) {
      group = { label: slot.group, items: [], ...(slot.collapsible ? { collapsible: true } : {}) };
      section.groups.push(group);
    }
    if (slot.subheading) {
      group.items.push({
        subheading: slot.subheading,
        items,
        ...(slot.superAdmin ? { superAdmin: true } : {}),
      });
    } else {
      group.items.push(...items);
    }
  }
  return sections;
}

// ── Active-link resolution ──────────────────────────────────────────────────
// Derived from the composed nav rather than a hand-maintained list. It used to
// be `href === "/admin" || href === "/admin/revenue"`, which meant adding any
// route nested under an existing nav item silently lit up both rows at once: the
// parent matched by prefix and the child matched exactly.

/**
 * Drop the rows this viewer does not hold the capability for, then the
 * subsections, groups and sections that leaves empty — the same collapse
 * composeNav does for an uninstalled entity, one axis down.
 */
export function filterNav(sections: NavSection[], capabilities: Iterable<string>): NavSection[] {
  const held = new Set(capabilities);
  const keep = (item: NavItem) => !item.when || held.has(item.when);
  const out: NavSection[] = [];
  for (const section of sections) {
    const groups: NavGroup[] = [];
    for (const group of section.groups) {
      const items: NavEntry[] = [];
      for (const entry of group.items) {
        if (isSubsection(entry)) {
          const kept = entry.items.filter(keep);
          if (kept.length > 0) items.push({ ...entry, items: kept });
        } else if (keep(entry)) {
          items.push(entry);
        }
      }
      if (items.length > 0) groups.push({ ...group, items });
    }
    if (groups.length > 0) out.push({ ...section, groups });
  }
  return out;
}

export function navHrefs(sections: NavSection[]): string[] {
  return sections.flatMap((section) =>
    section.groups.flatMap((group) =>
      group.items.flatMap((entry) => (isSubsection(entry) ? entry.items : [entry])).map((item) => item.href),
    ),
  );
}

/** A link is an index when another nav item lives beneath it (/admin holds
 *  /admin/revenue). Index links match exactly, so they do not light up on every
 *  child route. */
export function indexHrefs(hrefs: string[]): Set<string> {
  return new Set(hrefs.filter((href) => hrefs.some((other) => other !== href && other.startsWith(`${href}/`))));
}

export function makeIsActive(sections: NavSection[]): (pathname: string, href: string) => boolean {
  const index = indexHrefs(navHrefs(sections));
  return (pathname, href) => {
    if (index.has(href)) return pathname === href || pathname === `${href}/`;
    return pathname === href || pathname.startsWith(`${href}/`);
  };
}

/**
 * The admin shell's view of a composed navigation for one viewer. A row or
 * subsection flagged `superAdmin` is removed for a plain admin — it is not
 * muted, because the rows behind it are for people who may not know they
 * exist. Everything else stays exactly as composed, including rows that are
 * `enabled: false`, which the shell renders muted as "soon" rather than
 * dropping, so the sidebar reads as complete before a route ships.
 *
 * Pure, so the C.8 sidebar matrix can be asserted against the real ADMIN_NAV
 * without rendering; AdminNav applies it and renders what comes back.
 */
export function visibleTo(sections: NavSection[], isSuperAdmin: boolean): NavSection[] {
  if (isSuperAdmin) return sections;
  const keep = (e: NavEntry) => !e.superAdmin;
  return sections.map((section) => ({
    ...section,
    groups: section.groups.map((group) => ({ ...group, items: group.items.filter(keep) })),
  }));
}
