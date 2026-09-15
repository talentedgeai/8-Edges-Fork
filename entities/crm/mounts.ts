// What `app/` needs to mount this entity's routes and cannot derive: the
// route-segment config and the stylesheets, neither of which Next sees through
// a re-export. Everything else about a mount — its path, and the names Next
// binds it by — comes from the route itself (scripts/gen-app-mounts.mjs).
//
// Keys are paths within this entity. Nothing imports this file; the generator
// reads it, and `npm run check:app-mounts` fails when `app/` disagrees with it.
import type { RouteMounts } from "@/kernel/config/route-mount";

/** @generator */
export const mounts: RouteMounts = {
  "crons/revenue-snapshot": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/contacts/[id]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/contacts/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/affiliates/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/clients/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/companies/[id]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/companies/[id]/programs/[programId]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/companies/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/deals/[id]/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/admin/(dashboard)/revenue/deals/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/inquiries/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/leads/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/meetings/[id]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/meetings/new/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/meetings/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/billing/clients/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/billing/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/data-health/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/demand/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/market/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/pipeline/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/sales-intelligence/[id]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/revenue/sales-intelligence/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/pipeline/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/demand/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/billing/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/market/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/data-health/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/deals/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/deals/[id]/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/team/(dashboard)/revenue/leads/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/inquiries/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/companies/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/companies/[id]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/companies/[id]/programs/[programId]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/clients/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/meetings/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/meetings/new/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/meetings/[id]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/sales-intelligence/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/sales-intelligence/[id]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/revenue/affiliates/page": {
    segment: { dynamic: "force-dynamic" },
  },
};
