// The crm module's door (ME-12; AR-24 lands inside this module): people,
// companies, contacts, deals, pipelines, portal invites and status, meetings
// and invoices.
// Sibling modules and the rest of the entity reach crm only through this file —
// the generated ESLint zones enforce it for siblings — so the module can change
// its files without the rest of the company-os entity noticing.
export * from "./affiliates";
export * from "./call-analysis";
export * from "./calls";
export * from "./companies";
export * from "./company-enums";
export * from "./company-hub";
export * from "./company-summary";
export * from "./contacts";
export * from "./contacts-summary";
export * from "./invoices";
export * from "./lead-stats";
export * from "./meetings";
export * from "./people-options";
export * from "./people-sensitive";
export * from "./portal";
// portal-invite is deliberately absent: it imports the admin auth guard, and a
// door that carries a session guard drags it into every consumer of the entity
// index. The two portal modules that provision a member import the concrete
// file through the lib/admin/portal-invite shim, and
// entities/portal/portal-entity.test.ts pins them.
export * from "./portal-status";
// Client components. A server module may re-export them; a client component
// importing this index would pull the data layer into its bundle, which is why
// the old components/admin/* shims point at the concrete files.
// Client components that call a colocated server action are not exported here:
// a door that re-exports them pulls the route action, and through it the team
// entity, back into this entity's own index (an import/no-cycle warning), so
// the routes that render them import the concrete file.
export * from "./ui/CompanyRow";
export * from "./ui/MeetingsTable";
export * from "./ui/PersonSelect";
export * from "./ui/SensitiveDetails";
