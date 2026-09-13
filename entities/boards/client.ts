// The Boards entity's browser-safe door: the card and lane shapes a "use
// client" board view needs. scripts/entity-client-doors.test.mjs proves nothing
// server-only is reachable from here.
export * from "./ui/board-view-types";
// This entity's rows in the Admin shell's navigation (ADR 0002); the
// composition root hands them to the shell for the deployments that install it.
export { adminNav } from "./ui/nav";
// This entity's rows in the team hub's navigation (ADR 0002).
export { teamNav } from "./ui/team-nav";
