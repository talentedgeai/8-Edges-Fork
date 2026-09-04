import fs from "node:fs";
import path from "node:path";
import { test } from "@playwright/test";
import { getEpisode } from "../episodes";
import { STORAGE_STATE, baseUrl, episodeDir, viewport, zoom } from "../lib/env";
import { installCardRoute, installStageChrome } from "../lib/stage";

/**
 * One still per screen beat, for the animatic.
 *
 * Same routes, same zoom, same blur selectors as the real capture, so what the
 * preview shows is the frame the episode will open on rather than an artist's
 * impression of it. Cheap to re-run: no voiceover, no pacing, no assembly.
 *
 * A route that bounces to the login screen is recorded as unauthenticated
 * instead of being screenshotted, because a picture of a login form tells
 * nobody anything.
 */

const episode = getEpisode(process.env.E8_EPISODE);

type Shot = {
  id: string;
  index: number;
  route: string;
  file: string | null;
  status: "ok" | "needs-login" | "failed";
  note?: string;
};

test(`shots for ${episode.slug}`, async ({ browser }) => {
  const dir = path.join(episodeDir(episode.slug), "shots");
  fs.mkdirSync(dir, { recursive: true });

  const context = await browser.newContext({
    storageState: fs.existsSync(STORAGE_STATE) ? STORAGE_STATE : undefined,
    viewport,
    deviceScaleFactor: 1,
  });
  await installStageChrome(context, episode.privacy);
  await installCardRoute(context, baseUrl);
  const page = await context.newPage();

  const shots: Shot[] = [];

  for (const beat of episode.beats) {
    // Read the route back out of the beat's own action, so a shot cannot point
    // somewhere the episode does not.
    const source = beat.action?.toString() ?? "";
    // Every route the beat visits, in order. A beat that crosses two screens is
    // two stills, which is what the script means by "screen grabs".
    const routes = [...source.matchAll(/\bs\.goto\(\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);

    for (const [index, route] of routes.entries()) {
      const file = `${beat.id}-${index + 1}.jpg`;
      try {
        await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle", timeout: 45_000 });
        await page.waitForTimeout(1200);
        if (/\/admin\/login/.test(page.url())) {
          shots.push({ id: beat.id, index, route, file: null, status: "needs-login" });
          console.log(`${beat.id.padEnd(24)} ${route.padEnd(34)} needs login`);
          continue;
        }
        await page.screenshot({ path: path.join(dir, file), type: "jpeg", quality: 78 });
        shots.push({ id: beat.id, index, route, file, status: "ok" });
        console.log(`${beat.id.padEnd(24)} ${route.padEnd(34)} ok`);
      } catch (err) {
        const note = (err as Error).message.split("\n")[0];
        shots.push({ id: beat.id, index, route, file: null, status: "failed", note });
        console.warn(`${beat.id.padEnd(24)} ${route.padEnd(34)} failed`);
      }
    }
  }

  fs.writeFileSync(
    path.join(dir, "shots.json"),
    JSON.stringify({ slug: episode.slug, baseUrl, zoom, viewport, shots }, null, 2),
  );
  await context.close();

  const ok = shots.filter((s) => s.status === "ok").length;
  console.log(`\n${ok} of ${shots.length} screen beats captured → ${dir}`);
});
