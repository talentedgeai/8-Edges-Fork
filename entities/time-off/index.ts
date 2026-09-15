// The Time Off entity's server door (FS-01/FS-03, spec
// docs/engineering/2026-09-08-pluggable-entities-spec.md): the leave vocabulary
// and working-day arithmetic every leave screen shares, the approver
// resolution, and the balances computed from each policy's rules.
//
// Time off was a module inside team until FS-03. It became an entity because it
// is a self-contained thing a deployment may leave out: it owns its three tables,
// reaches only the kernel and company-os's door (selectStaffAssignments and
// selectTeamDirectory, for who approves a member's leave and who took it — which
// is why it sits at layer 3, above company-os), and serves two surfaces from one
// folder — the admin screens under /admin/operations/time-off and the employee's
// own page at /team/time-off. Only this file and client.ts may be imported from
// outside.
// Cross-entity reads and writes of this entity's tables (design §4, ME-13).
export * from "./lib/reads";
export * from "./lib/writes";
export * from "./lib/approver";
export * from "./lib/leave";
// Balances computed from a policy's rules (plan: private-docs/workflows/private/e8/pto-policies-plan.html).
export * from "./lib/balance";
export * from "./lib/policy";
export * from "./lib/balances";
// Balance warnings and the manager's sign-off (recorded in the audit log).
export * from "./lib/review";
// Client component, exported here as well so server pages can render it; the
// browser-safe door re-exports it for "use client" callers.
export * from "./ui/TimeOffCalendar";
// The policy card every surface shows (server component).
export * from "./ui/PolicyCard";
// The per-person balance shelf: dates, the ledger and the leave history (server component).
export * from "./ui/LeaveShelf";
