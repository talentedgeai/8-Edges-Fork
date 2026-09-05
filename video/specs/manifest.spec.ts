import fs from "node:fs";
import path from "node:path";
import { test } from "@playwright/test";
import { getEpisode } from "../episodes";
import { episodeDir } from "../lib/env";

/**
 * Dumps the episode definition to out/<slug>/episode.json so the Node side of
 * the rig (voiceover, captions, assembly) reads one manifest instead of
 * importing TypeScript. Runs before anything else. No browser involved.
 */
/**
 * Reads the stage directions back out of a beat's action, in order, so the
 * manifest carries what the screen does as data. Derived rather than restated:
 * a beat cannot say it opens the deals board while its code opens something
 * else. Feeds the animatic and the shot list.
 */
function stepsOf(action: unknown): { fn: string; args: string[] }[] {
  if (typeof action !== "function") return [];
  const source = action.toString();
  const steps: { fn: string; args: string[] }[] = [];
  for (const match of source.matchAll(/\bs\.(\w+)\(([^)]*)\)/g)) {
    steps.push({
      fn: match[1],
      // Split on commas that are not inside a quoted selector.
      args: [...match[2].matchAll(/"([^"]*)"|'([^']*)'|`([^`]*)`|([^,\s][^,]*)/g)]
        .map((a) => (a[1] ?? a[2] ?? a[3] ?? a[4] ?? "").trim())
        .filter(Boolean),
    });
  }
  return steps;
}

test("write episode manifest", async () => {
  const episode = getEpisode(process.env.E8_EPISODE);
  const dir = episodeDir(episode.slug);
  fs.mkdirSync(dir, { recursive: true });
  const manifest = {
    slug: episode.slug,
    number: episode.number,
    arc: episode.arc,
    title: episode.title,
    titleCardAfter: episode.titleCardAfter,
    endCard: episode.endCard,
    endCardSeconds: episode.endCardSeconds ?? null,
    beats: episode.beats.map((b) => ({
      id: b.id,
      vo: b.vo,
      captions: b.captions ?? null,
      hold: b.hold ?? 0,
      minSeconds: b.minSeconds ?? 0,
      steps: stepsOf(b.action),
    })),
  };
  fs.writeFileSync(path.join(dir, "episode.json"), JSON.stringify(manifest, null, 2));
  console.log(`manifest: ${path.join(dir, "episode.json")} (${manifest.beats.length} beats)`);
});
