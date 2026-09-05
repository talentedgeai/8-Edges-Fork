/**
 * The Human Token Tracker's public surface (design §3, rule 1 and 2).
 *
 * Everything else in `entities/htt/` is private to the entity: `app/` and other
 * entities import this file and nothing deeper, so the tracker can be reshaped
 * without a search across the repo. What is exported here is what someone
 * outside actually needs — the telemetry ingest the public `/api/ingest`
 * endpoint drives, the token relinker it calls afterwards, and the cached repo
 * story the team dashboard renders.
 *
 * `tables.ts` is the entity's other declaration file and is deliberately not
 * re-exported here: it is read by the ownership gate and by htt's own code, not
 * by other entities.
 */
export {
  verifyCommitter,
  resolveRepo,
  buildEndBody,
  buildManHourBodies,
  buildHumanEndBody,
  type TelemetryEntry,
} from "./session-ingest";
export { relinkRepoTokens } from "./token-attribution";
export { getRepoStory, type RepoStoryBlock } from "./project-summaries";

// Cross-entity writes to this entity's tables (design §4, ME-13).
export * from "./lib/writes";
