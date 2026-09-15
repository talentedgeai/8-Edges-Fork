// The Boards entity's server door (RS-01, spec
// docs/engineering/2026-09-08-pluggable-entities-spec.md): boards, their
// columns and members, cards and their stage history, sprints and epics, plus
// the workboard read model every board surface renders.
//
// Boards was a module inside company-os until RS-01. It became an entity
// because the Workboard is the thing fork clients copy first and it has to be
// one folder: it owns its eight tables, reaches nothing but the kernel, and
// serves three surfaces — the admin boards and workboard, the team hub's board
// views and the client board in the portal. Only this file and client.ts may be
// imported from outside.
export * from "./lib/access";
export * from "./lib/actions";
export * from "./lib/blocker-actions";
export * from "./lib/card-helpers";
export * from "./lib/create";
export * from "./lib/data";
export * from "./lib/move-card";
export * from "./lib/move-to-board";
export * from "./lib/mutation";
export * from "./lib/notify";
export * from "./lib/types";
export * from "./lib/workboard";
export * from "./lib/workboard-reads";
// Cross-entity reads and writes of this entity's tables (design §4, ME-13).
export * from "./lib/reads";
export * from "./lib/writes";
// Board views the other surfaces render; the routes that host them are mounts
// and may import any door, so they take these here.
export { Workboard } from "./ui/Workboard";
export { SprintView } from "./ui/SprintView";
