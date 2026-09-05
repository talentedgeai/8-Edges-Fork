// The team entity's client door (multi-entity design §3, "two doors per
// entity", ME-13). ./index.ts pulls next/headers and the service-role Supabase
// client, and a barrel is bundled whole, so a "use client" component may never
// import it. This file is the other door: only browser-safe code is re-exported
// here (client components, types, constants, pure helpers), and
// scripts/entity-client-doors.test.mjs walks its import graph to prove nothing
// server-only follows it into the browser.
//
// Like the index, it lists what a client component outside the entity consumes
// today — the admin goals editor's coaching vocabulary and ladder picker, and
// the leave vocabulary the admin time-off board, the calendar and the portal
// decision queue render — not what might be useful: knip reports an export
// nothing imports.
export {
  GOAL_STATUS_LABELS,
  type AdminMemberGoals,
  type CoachingGoal,
  type EdgesOptions,
  type GoalStatus,
} from "./modules/coaching/types";
export { ladderValue, parseLadder } from "./modules/coaching/ladder";
export { LadderSelect } from "./modules/coaching/ui/LadderSelect";
export {
  LEAVE_TYPES,
  LEAVE_TYPE_LABEL,
  countWorkingDays,
  formatDays,
  statusTone,
  type LeaveType,
} from "./modules/time-off/leave";
// The Day Off import report, rendered by the admin import runner (type only).
export type { ImportReport } from "./modules/time-off/dayoff/import";
