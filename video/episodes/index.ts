import type { Episode } from "../lib/episode";
import intro from "./eight-edges-intro";
import e01 from "./e01-company-dashboard";

// One entry per recordable film. E02 to E16 land here as they are scripted;
// nothing else in the rig changes when they do.
export const EPISODES: Episode[] = [intro, e01];

export function getEpisode(slug: string | undefined): Episode {
  if (!slug) {
    throw new Error(
      `E8_EPISODE is not set. Known episodes: ${EPISODES.map((e) => e.slug).join(", ")}`,
    );
  }
  const found = EPISODES.find((e) => e.slug === slug);
  if (!found) {
    throw new Error(`Unknown episode "${slug}". Known: ${EPISODES.map((e) => e.slug).join(", ")}`);
  }
  return found;
}
