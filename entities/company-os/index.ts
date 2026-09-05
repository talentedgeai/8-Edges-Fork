// The company-os entity's front door — the /admin Company OS: CRM, hiring,
// boards, campaigns, settings, QuickBooks, equipment, operations, revenue
// events and innovation (docs/engineering/2026-09-03-multi-entity-design.md,
// ME-12). Opened early by ME-06; the implementation moved under
// entities/company-os with ME-12.
//
// Another entity may only reach company-os through this file — an entity
// imports another entity only through its index.ts (design §3 rule 2), and the
// boundary zones and scripts/check-entity-imports.mjs both treat this path as
// the sanctioned door. The four AR modules come through their own doors; the
// rest is listed by the caller that consumes it, so a change here can be
// weighed against who breaks.
//
// This is a server-only barrel: the modules below build the service-role
// Supabase client at load (design §3, "two doors"). A client component takes
// what it needs from ./client.ts, the browser-safe door. Nothing that reads an
// auth session belongs here at all.
//
// Route bodies (routes/, api/, crons/) are deliberately absent: app/ imports
// those files directly, because Next reads a route's segment config from the
// route file and a page is not a library export.

// AR modules (design §2): each is reached only through its own index, and every
// export another entity used to take from a module file now comes through here.
export * from "./modules/crm";
export * from "./modules/hiring";
export * from "./modules/boards";
export * from "./modules/campaigns";

// --- retreats: the guest itinerary at /my-retreat/[slug] -------------------
// The event agenda, which company-os owns (company_os.event_agenda_blocks and
// event_agenda_staff). The client-safe types, labels and grouping come from
// event-agenda-shared; only `getEventAgenda` touches the database.
export * from "@/entities/company-os/lib/event-agenda-shared";
export { getEventAgenda } from "@/entities/company-os/lib/event-agenda";

// --- portal: the survey engine (ME-09) -------------------------------------
// The portal owns the survey tables, but the field model, the answer validator
// and the row shapes are still the admin survey builder's; the public runner at
// /surveys/[slug] and its two API routes read them from here.
export { validateAnswer } from "@/entities/company-os/lib/surveys";
export type { FieldConfig, SurveyFieldRow, SurveyRow } from "@/entities/company-os/lib/surveys";

// --- portal: portal membership status (ME-09) ------------------------------
// Whether a portal person has ever signed in, for the client-admin user list.
// The invite/resend/revoke engine itself is exported at the bottom of this file.
export type { PortalStatus } from "@/entities/company-os/modules/crm/portal-status";

// --- portal: contractor work requests (ME-09) ------------------------------
// The portal owns contractor_work_* and drives the state machine, but the
// status vocabulary, the admin-side path a notification links to and the QBO
// billing step are company-os's.
export {
  WORK_REQUEST_STATUS_LABEL,
  formatHours,
  workRequestPath,
  workRequestTone,
} from "@/entities/company-os/lib/contractors";
export type { WorkRequestStatus } from "@/entities/company-os/lib/contractors";
// Invoicing a client company for hours (QBO + the invoices ledger); the
// work-request half of billing is portal's (Q2).
export { billableRateCents, invoiceCompanyForHours } from "@/entities/company-os/lib/client-invoicing";

// --- portal: the client board and the meeting plan (ME-09) -----------------
// The read-only client view of a company's task board, shared with the team
// client hub so both surfaces render the same thing, and the renderer for a
// meeting's plan markdown.
export type { ClientBoardCard, ClientBoardColumn } from "@/entities/company-os/modules/boards/client-view";
export { renderPlanMarkdown } from "@/entities/company-os/lib/plan-markdown";

// --- portal: admin UI the portal reuses (ME-09) ----------------------------
// Tabs, the bar chart and the view toggle are admin components the portal
// screens render as-is. AR-30/31/34 decide which of them become part of the
// shared design system; until then they stay company-os's and the portal takes
// them from this door. (The time-off calendar renders team's leave vocabulary,
// so it is team's — entities/team/modules/time-off/ui — since Q2.)
export { Tabs } from "@/entities/company-os/ui/Tabs";
export type { TabDef } from "@/entities/company-os/ui/Tabs";
export { BarChart } from "@/entities/company-os/ui/charts/BarChart";
export { ViewToggle } from "@/entities/company-os/ui/ViewToggle";

// --- team: the /team workspace (ME-11) --------------------------------------
// The team entity used to import 75 company-os modules directly — admin views,
// lib/admin helpers, board data, the ATS pipeline. Everything it still needs is
// listed here, grouped by the company-os module it comes from, so ME-12 can see
// what has to keep working when those modules move under entities/company-os.
//
// Two of the team's client components (the hub "my tasks" strip and the work
// boards page) need the priority vocabulary, `RECOMMENDATIONS` and
// `EQUIPMENT_TYPES` as values. A client component cannot import this barrel,
// so their server pages take the values from here and pass them down as
// props; `Recommendations` is the prop type for that. (The card move itself is
// team's since Q2 — entities/team/lib/move-card.ts — and BoardView takes it
// as its `onMove` prop.)
export { ClientCards } from "@/entities/company-os/ui/ClientCards";
export type { CompanyRow } from "@/entities/company-os/modules/crm/ui/CompanyRow";
// The board views call colocated server actions, so their module door leaves
// them out (see modules/boards/index.ts); the team's board pages take them here.
export { BoardView } from "@/entities/company-os/modules/boards/ui/BoardView";
export { SprintView } from "@/entities/company-os/modules/boards/ui/SprintView";
export { FilterBar } from "@/entities/company-os/ui/FilterBar";
export { CompanyGoalsObjectives } from "@/entities/company-os/ui/company/CompanyGoalsObjectives";
export { CoreValuesGrid } from "@/entities/company-os/ui/company/CoreValuesGrid";
export type { ValueRow } from "@/entities/company-os/ui/company/CoreValuesGrid";
export { OnboardingDeckEmbed } from "@/entities/company-os/ui/company/OnboardingDeckEmbed";
export { OrgChart } from "@/entities/company-os/ui/company/OrgChart";
export { StrategyView } from "@/entities/company-os/ui/company/StrategyView";
export { TeamGoalsPanel } from "@/entities/company-os/ui/company/TeamGoalsPanel";
export { EQUIPMENT_TYPES, specSummary, statusLabel } from "@/entities/company-os/lib/equipment-shared";
export type { RecommendationKey } from "@/entities/company-os/modules/hiring/interview-panel";
export type { AdminMeetingRow } from "@/entities/company-os/modules/crm/meetings";
export type { SensitiveRow } from "@/entities/company-os/modules/crm/people-sensitive";
export { getProbationRows } from "@/entities/company-os/lib/probation";
export { listEntity } from "@/entities/company-os/lib/query";
export { getAssignmentsForCompany } from "@/entities/company-os/lib/staff-assignments";
export { STAGE_CONTRACT, STAGE_DISCOVERY, STAGE_LEAD, STAGE_NEUTRAL, STAGE_PROPOSAL, STAGE_WON } from "@/entities/company-os/lib/stageColors";
export { parseStoredAnswer } from "@/entities/company-os/lib/surveys";
export { generateIdeaPlan } from "@/entities/company-os/lib/ai/idea-plan";
export type { LoopStep } from "@/entities/company-os/modules/hiring/ats/loop";
export type { Result as PipelineResult } from "@/entities/company-os/modules/hiring/ats/pipeline";
export type { ScorecardInput } from "@/entities/company-os/modules/hiring/ats/scorecard";
export type { ClientBoardView } from "@/entities/company-os/modules/boards/client-view";
export type { BoardDetail } from "@/entities/company-os/modules/boards/data";
export type { MoveCard, TaskPriority } from "@/entities/company-os/modules/boards/types";
export type { StrategyRow } from "@/entities/company-os/lib/company/edges-shared";
export { getCompanyGoals } from "@/entities/company-os/lib/company/goals";
export { parseStrategy } from "@/entities/company-os/lib/company/strategy";
export { IDEA_STATUS_LABEL, OFFICE_LABEL, ideaStatusTone, officeTone } from "@/entities/company-os/lib/ideas";
export type { IdeaOffice, IdeaStatus } from "@/entities/company-os/lib/ideas";
export type { AiScreenSummary } from "@/entities/company-os/modules/hiring/resume-screen";
export type Recommendations = typeof import("@/entities/company-os/modules/hiring/interview-panel").RECOMMENDATIONS;

// --- portal, assistant: portal membership provisioning (ME-13) -------------
// The shared invite/resend/revoke engine and the self-serve sign-in mails.
// Earlier this was kept off the door because it imports the admin auth
// helpers; every consumer of this barrel is server-side now that the client
// door exists, so the concern that a label-only import drags a guard along
// no longer applies.
export {
  invitePortalMemberCore,
  resendPortalLinkCore,
  revokePortalMemberCore,
  sendSelfServePasswordReset,
  sendSelfServeSignInLink,
} from "@/entities/company-os/modules/crm/portal-invite";

// --- CRM lifecycle and inbound signups (Q2) --------------------------------
// The lead journey and the account stage bumps, and the retreat signup that
// records an inquiry and promotes the person. Moved here from team and site:
// every write is to a CRM table, and the callers — the site's contact form,
// the retreats event actions, the billing checkout route, the admin inquiries
// and deals actions — are mounts or entities on this layer or above.
export * from "./lib/lifecycle";
export { recordRetreatSignup } from "./lib/signups";

// Cross-entity writes to this entity's tables (design §4, ME-13).
export * from "./lib/writes";
