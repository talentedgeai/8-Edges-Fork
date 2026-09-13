// The crm entity's server door. Deals, leads and inquiries, the meetings and call transcripts behind them, and the pipeline they move through.
//
// Its screens still live where they were and move here in a later slice; what
// moved first is ownership of the tables and the writers that touch them,
// because an entity that owns its data is the unit a deployment installs.
export * from "./lib/reads";
export * from "./lib/writes";
// The crm module moved here whole (RS-04).
export * from "./lib/affiliates";
export * from "./lib/call-analysis";
export * from "./lib/calls";
export * from "./lib/companies";
export * from "./lib/company-enums";
export * from "./lib/company-hub";
export * from "./lib/company-summary";
export * from "./lib/contacts";
export * from "./lib/contacts-summary";
export * from "./lib/invoices";
export * from "./lib/lead-stats";
export * from "./lib/meetings";
export * from "./lib/people-options";
export * from "./lib/people-sensitive";
export * from "./lib/portal";
export * from "./lib/portal-status";
export * from "./ui/CompanyRow";
export * from "./ui/CompanyDocuments";
export * from "./ui/InvitePortalButton";
// The Clients list's active/inactive view flag. A server component shared with
// the settings assume screen, so it sits in ui/ rather than in a route folder.
export * from "./ui/ClientsActiveToggle";
export * from "./ui/MeetingsTable";
export * from "./ui/PersonSelect";
export * from "./ui/SensitiveDetails";
export * from "./lib/sprint-extract";
// The lead journey and the account stage bumps, and the
// archive/restore/guarded-delete dispatcher for the archivable records. Both
// moved out of company-os with RS-04: every table they touch is a CRM table or
// a kernel one, and the screens that call them are CRM screens.
export * from "./lib/lifecycle";
export * from "./lib/mutations";
// The assume-identity control the settings screen renders.
export * from "./lib/assume-actions";
// The shared portal invite/resend/revoke engine and the self-serve sign-in mails.
export * from "./lib/portal-invite";
// The meetings panel a client hub renders; crm owns meetings (R.2).
export { MeetingsPanel } from "./ui/MeetingsPanel";
