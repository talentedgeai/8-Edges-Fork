// The coaching module's door (ME-11; AR-27 lands inside this module). Sibling
// modules and the rest of the entity reach coaching only through this file —
// the generated ESLint zones enforce it for siblings — so the module can change
// its files without the rest of the team entity noticing.
export * from "./ai";
export * from "./cycle";

// Team Coaching Cycle data access (docs/plans/2026-07-25-team-coaching-cycle.md).
// The ONLY sanctioned path to the coaching_* tables. The coaching relationship
// is coach_id on coaching_profiles — deliberately NOT the org chart's
// manager_id and NOT actor.teamMemberScope, because dotted lines are
// first-class (My reports to Mai but is coached by Dave). That is why these
// tables are not in lib/team/data.ts's SCOPE_ALLOWLIST: their scope column is
// the coach, not the member.
//
// TWO TIERS, ENFORCED HERE:
//   coach tier  — every function prefixed coach* filters coach_id =
//                 actor.teamMemberId (from the JWT-derived actor, never client
//                 input) and re-derives ownership before any write.
//   member tier — every function prefixed my* filters team_member_id =
//                 actor.teamMemberId and selects ONLY member-visible fields:
//                 FAST goals, priorities, published OCEAN, commitments,
//                 check-ins, and shared recaps that have been PUBLISHED.
//                 Prep, transcripts, private summaries, private profile,
//                 trends and context never appear in a member-tier select.
// The client-safe vocabulary lives in ./types; re-exported so the server
// callers of this module keep one import.

// The data access is split by tier and concern under ./data/ (Q3, 2026-09-05);
// this index is the single import path callers keep. The client-safe
// vocabulary lives in ./types and the Saigon-date helpers in the kernel; both
// are re-exported so the server callers of this module keep one import. Row
// types that only this module's own components need stay on their data file.
export * from "./types";
export { saigonToday, addDays } from "@/kernel/config/dates";
export { getAdminRosterGoals, adminAddGoal, adminUpdateGoal, adminDeleteGoal } from "./data/admin-goals";
export { coachAddGoal, coachUpdateGoal, coachDeleteGoal, coachAddPriority, coachUpdatePriority, type OceanInput, coachSaveOcean, coachPublishOcean, coachSetRetentionRoot, coachSetMinutesLink, coachSetCadence, coachSetPrivateProfile } from "./data/coach-edits";
export { coachAddCommitment, coachReorderCommitments, coachUpdateCommitment, coachPushCommitmentToBoard } from "./data/commitments";
export { getEdgesLadderOptions, addGoalComment } from "./data/goals";
export { getMyCoaching, getTeamMemberActiveGoals, myUpdateCommitmentStatus, myAddCommitment, myUpdateCommitmentDetails, myDeleteCommitment, myReorderCommitments } from "./data/member";
export { type MyGoalInput, getMyGoals, ladderLabelFor, myAddGoal, myUpdateGoal, myDeleteGoal } from "./data/my-goals";
export { coachCreateOneOnOne, assertCoachOwnsMeeting, coachSaveTranscript, coachSaveSummaries, coachPublishSharedRecap, coachArchiveMeeting } from "./data/one-on-ones";
export { getCoachProfileDetail } from "./data/profile";
export { type RosterAttention, type CoachRosterRow, isCoach, isCoached, getCoachRoster, canManageRoster, getRosterCandidates, coachAddToRoster } from "./data/roster";
export { assertCoachOwnsProfile, getCoachingProfileIdForMember } from "./data/shared";
export { myAddTalkingPoint, myDeleteTalkingPoint, setTalkingPointAddressed } from "./data/talking-points";
export * from "./goal-notify";
export * from "./ladder";
export * from "./markdown";
export * from "./sessions";
export * from "./transcript";
// The client components are NOT re-exported here. They import this module's
// route actions, and those actions import this index for the data layer, so a
// re-export would close a cycle (index -> ui -> actions -> index) that the old
// ./data barrel used to keep open. Every caller already imports them by their
// concrete path (entities/team/modules/coaching/ui/*), which is also what keeps
// the server-only data layer out of the client bundle.
