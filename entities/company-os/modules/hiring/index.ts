// The hiring module's door (ME-12; AR-25 lands inside this module): the ATS
// pipeline, applications, interviews, requisition loops, resume extraction and
// screening, and the AI interview panelist.
// Sibling modules and the rest of the entity reach hiring only through this file —
// the generated ESLint zones enforce it for siblings — so the module can change
// its files without the rest of the company-os entity noticing.
export * from "./application-status";
export * from "./applications";
export * from "./ats/loop";
export * from "./ats/pipeline";
export * from "./ats/scorecard";
export * from "./ats/stage-log";
export * from "./candidate-sensitive";
export * from "./interview-panel";
export * from "./interview-panelist";
export * from "./recruiting-options";
export * from "./resume-extract";
export * from "./resume-screen";
// Client components that call a colocated server action are not exported here:
// a door that re-exports them pulls the route action, and through it the team
// entity, back into this entity's own index (an import/no-cycle warning), so
// the routes that render them import the concrete file.
