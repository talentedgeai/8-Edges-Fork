// The coaching entity's browser-safe door (design §3, "two doors per entity").
// ./index.ts pulls the service-role Supabase client and the coaching guards, so
// a "use client" component may never import it; only browser-safe code is
// re-exported here and scripts/entity-client-doors.test.mjs proves it.
//
// What is here is what a client component outside the entity renders: the goal
// vocabulary the admin goals editor shows and the ladder picker beside it.
export {
  GOAL_STATUS_LABELS,
  type AdminMemberGoals,
  type CoachingGoal,
  type EdgesOptions,
  type GoalStatus,
} from "./lib/types";
export { ladderValue, parseLadder } from "./lib/ladder";
export { LadderSelect } from "./ui/LadderSelect";
// This entity's rows in the team hub's navigation (ADR 0002).
export { teamNav } from "./ui/team-nav";
