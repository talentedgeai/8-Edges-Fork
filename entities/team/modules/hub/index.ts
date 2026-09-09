// The client-hub module's door (ME-11): what a team member sees of the clients
// they are assigned to — the hub overview, programs, roadmap, board, meetings,
// invoices and team tabs. Siblings reach it only through this file.
export * from "./clients";
export * from "./client-proposals";
export * from "./program";
export * from "./roadmap";
// Client components; see the note in ../coaching/index.ts.
export * from "./ui/HubProgramsBand";
export * from "./ui/ProgramDeliveryCard";
export * from "./ui/HubTeamPanel";
export * from "./ui/InvoicesPanel";
export * from "./ui/MeetingsPanel";
