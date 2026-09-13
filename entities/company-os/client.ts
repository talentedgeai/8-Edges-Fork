// The company-os entity's client door (design §3, "two doors per entity").
// ./index.ts pulls the service-role Supabase client, the admin auth guard and
// next/headers, and a barrel is bundled whole, so a "use client" component may
// never import it. Only browser-safe code is re-exported here, and
// scripts/entity-client-doors.test.mjs walks this file's import graph to prove
// nothing server-only follows it into the browser.
//
// The admin UI primitives that used to sit here moved to kernel/ui with RS-09:
// none of them read data, and every entity's screens render them, so an entity
// owning them made the shell a dependency of everything.

// The country vocabulary the admin edit forms offer; a plain list, so it
// belongs on the browser-safe door rather than the server one.
export * from "@/entities/company-os/lib/countries";
// This entity's rows in the Admin shell's navigation (ADR 0002); the
// composition root hands them to the shell for the deployments that install it.
export { adminNav } from "./ui/nav";
