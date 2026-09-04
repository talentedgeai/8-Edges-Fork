import fs from "node:fs";
import path from "node:path";
import { test } from "@playwright/test";
import { getEpisode } from "../episodes";
import { FRAME, STORAGE_STATE, baseUrl, episodeDir, viewport, zoom } from "../lib/env";
import { installCardRoute, installStageChrome, makeStage } from "../lib/stage";

/**
 * Records one episode. The voiceover is the master clock: if out/<slug>/vo/vo.json
 * exists, every beat is held for exactly as long as its audio runs, so screen and
 * voice line up at every beat boundary without a manual edit. Without it the rig
 * falls back to a 145 wpm estimate, which is fine for a rehearsal pass.
 */

const episode = getEpisode(process.env.E8_EPISODE);
const WARMUP_SECONDS = 2;
const WORDS_PER_MINUTE = 145;

function estimateSeconds(vo: string): number {
  const words = vo.trim().split(/\s+/).filter(Boolean).length;
  return words ? (words / WORDS_PER_MINUTE) * 60 : 0;
}

function readVoDurations(dir: string): Record<string, number> {
  const file = path.join(dir, "vo", "vo.json");
  if (!fs.existsSync(file)) return {};
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { beats: { id: string; seconds: number }[] };
  return Object.fromEntries(parsed.beats.map((b) => [b.id, b.seconds]));
}

test(`record ${episode.slug}`, async ({ browser }) => {
  const dir = episodeDir(episode.slug);
  const videoDir = path.join(dir, "video");
  fs.rmSync(videoDir, { recursive: true, force: true });
  fs.mkdirSync(videoDir, { recursive: true });

  const voSeconds = readVoDurations(dir);
  if (!Object.keys(voSeconds).length) {
    console.warn("No vo.json found. Pacing from a 145 wpm estimate, so this is a rehearsal take.");
  }

  const context = await browser.newContext({
    storageState: fs.existsSync(STORAGE_STATE) ? STORAGE_STATE : undefined,
    viewport,
    deviceScaleFactor: zoom,
    recordVideo: { dir: videoDir, size: { width: FRAME.width, height: FRAME.height } },
  });
  const t0 = Date.now();
  const at = () => (Date.now() - t0) / 1000;

  await installStageChrome(context, episode.privacy);
  await installCardRoute(context, baseUrl);

  const page = await context.newPage();
  const stage = makeStage(page);

  // Warmup: the screencast takes a moment to reach a steady frame rate, and the
  // first paint of the admin shell is not something anyone should see.
  await page.goto(`${baseUrl}/admin`, { waitUntil: "networkidle" });
  await page.waitForTimeout(WARMUP_SECONDS * 1000);

  const rows: {
    id: string;
    start: number;
    end: number;
    voSeconds: number;
    overran: boolean;
    warning: string | null;
  }[] = [];

  for (const beat of episode.beats) {
    const start = at();
    const spoken = voSeconds[beat.id] ?? estimateSeconds(beat.vo);
    const target = Math.max(spoken + (beat.hold ?? 0), beat.minSeconds ?? 0);
    let warning: string | null = null;

    try {
      await beat.action?.(page, stage);
    } catch (err) {
      // A missing selector must not cost a three minute take. Note it, hold the
      // frame, keep rolling. QC surfaces it before assembly.
      warning = (err as Error).message.split("\n")[0];
      console.warn(`beat "${beat.id}": ${warning}`);
    }

    const spent = at() - start;
    if (spent < target) await page.waitForTimeout((target - spent) * 1000);
    const end = at();
    rows.push({
      id: beat.id,
      start,
      end,
      voSeconds: spoken,
      overran: spent > target + 0.25,
      warning,
    });
    console.log(
      `${beat.id.padEnd(24)} ${start.toFixed(1)}s → ${end.toFixed(1)}s  (vo ${spoken.toFixed(1)}s)${
        spent > target + 0.25 ? "  OVERRAN" : ""
      }`,
    );
  }

  const duration = at();
  const video = page.video();
  await context.close(); // Flushes the webm to disk.

  const recorded = video ? await video.path() : null;
  const capture = path.join(dir, "capture.webm");
  if (recorded) {
    fs.rmSync(capture, { force: true });
    fs.renameSync(recorded, capture);
  }

  fs.writeFileSync(
    path.join(dir, "beats.json"),
    JSON.stringify(
      {
        slug: episode.slug,
        // Everything before the first beat is warmup and gets trimmed in assembly.
        leadTrim: rows[0]?.start ?? 0,
        duration,
        zoom,
        recordedAt: new Date().toISOString(),
        beats: rows,
      },
      null,
      2,
    ),
  );
  console.log(`capture: ${capture}`);
});
