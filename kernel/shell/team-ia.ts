// The team hub's information architecture: the slots, in display order.
//
// Widening scope, which is the order a member reads it in: what I am doing now,
// then me, then the people I am responsible for, then the company. The groups
// collapse; there are no subsections at this size.
//
// This file names no entity and holds no rows — each entity contributes its
// rows from its browser-safe door and app/nav.ts composes the contributions of
// the entities this deployment installs (ADR 0002). Rows that depend on the
// viewer rather than the deployment carry a `when` capability instead, which
// the sidebar resolves per request.
import type { NavSlot } from "./nav";

export const TEAM_SLOTS: NavSlot[] = [
  { section: null, group: null },
  { section: null, group: "My Work" },
  { section: null, group: "Me" },
  { section: null, group: "My Team" },
  { section: null, group: "Company" },
];
