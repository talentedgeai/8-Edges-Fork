// The ideas entity's server door. Ideas, the issues raised against them, their trend reports and the agent sync packets.
//
// Its screens still live where they were and move here in a later slice; what
// moved first is ownership of the tables and the writers that touch them,
// because an entity that owns its data is the unit a deployment installs.
export * from "./lib/reads";
export * from "./lib/writes";
// The ideas module itself, moved out of company-os with its screens.
export * from "./lib/ideas";
export * from "./lib/ai/idea-trends";
export * from "./lib/ai/idea-plan";
