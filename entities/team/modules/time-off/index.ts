// The time-off module's door (ME-11): the leave vocabulary and working-day
// arithmetic every leave screen shares, the approver resolution, and the Day
// Off (day-off.app) importer. The team entity owns the time_off, leave_* and
// holidays tables (design §4), which is why the vocabulary moved here out of
// lib/admin/time-off; the admin screens still reach it through that shim.
export * from "./approver";
export * from "./leave";
export * from "./dayoff/client";
export * from "./dayoff/import";
export * from "./dayoff/types";
// Client component; see the note in ../coaching/index.ts.
export * from "./ui/TimeOffCalendar";
