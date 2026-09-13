// The hiring entity's server door. Candidates, applications and the interview loop.
//
// Its screens still live where they were and move here in a later slice; what
// moved first is ownership of the tables and the writers that touch them,
// because an entity that owns its data is the unit a deployment installs.
export * from "./lib/reads";
export * from "./lib/writes";
// The ATS module moved here whole (RS-07): it only ever read hiring tables.
export * from "./lib/application-status";
export * from "./lib/applications";
export * from "./lib/ats/loop";
export * from "./lib/ats/pipeline";
export * from "./lib/ats/scorecard";
export * from "./lib/ats/stage-log";
export * from "./lib/candidate-sensitive";
export * from "./lib/interview-panel";
export * from "./lib/interview-panelist";
export * from "./lib/recruiting-options";
export * from "./lib/resume-extract";
export * from "./lib/resume-screen";
export * from "./lib/application-actions";
// Named types the team hub's hiring screens take from this door.
export type { Result as PipelineResult } from "./lib/ats/pipeline";
export type Recommendations = typeof import("./lib/interview-panel").RECOMMENDATIONS;
