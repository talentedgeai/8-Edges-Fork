// The boards module's door (ME-12; AR-26 lands inside this module): board data,
// access, the card helpers, sprints, the read-only client view and the board
// views. The card move itself is team's (entities/team/lib/move-card.ts, Q2):
// it ends by writing a coaching commitment, a team table, so it sits above.
// Sibling modules and the rest of the entity reach boards only through this file —
// the generated ESLint zones enforce it for siblings — so the module can change
// its files without the rest of the company-os entity noticing.
export * from "./access";
export * from "./card-helpers";
export * from "./client-view";
export * from "./create";
export * from "./data";
export * from "./notify";
export * from "./sprint-extract";
export * from "./types";
// Client components that call a colocated server action are not exported here:
// a door that re-exports them pulls the route action, and through it the team
// entity, back into this entity's own index (an import/no-cycle warning), so
// the routes that render them import the concrete file.
