import fs from "node:fs";
import path from "node:path";
import { test } from "@playwright/test";
import { getEpisode } from "../episodes";
import { FRAME, baseUrl, episodeDir } from "../lib/env";
import { cardUrl, installCardRoute } from "../lib/stage";

/**
 * Renders this episode's title card, end card, and thumbnail as PNGs.
 *
 * The cards are not re-drawn here. They are screenshots of the approved brand
 * kit page at /workflows/private/e8/edge8-video-brand-kit.html, driven at exact
 * frame size, which is what the kit's handoff section asks for. Restyle the kit
 * and the cards follow, with nothing to keep in step by hand.
 */

const episode = getEpisode(process.env.E8_EPISODE);
const BRAND_KIT = "/workflows/private/e8/edge8-video-brand-kit.html";

test(`render cards for ${episode.slug}`, async ({ browser }) => {
  const dir = path.join(episodeDir(episode.slug), "cards");
  fs.mkdirSync(dir, { recursive: true });

  const context = await browser.newContext({
    viewport: { width: FRAME.width + 120, height: FRAME.height + 160 },
    deviceScaleFactor: 1,
  });
  await installCardRoute(context, baseUrl);
  const page = await context.newPage();

  if (episode.number !== null) {
    await page.goto(`${baseUrl}${BRAND_KIT}`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);

    // Pick the episode, then take the preview off "fit to width" so every
    // canvas sits at exactly 1920 x 1080 (1280 x 720 for the thumbnail).
    await page.selectOption("#ep", String(Number(episode.number)));
    await page.click("#zoomBtn");
    await page.waitForTimeout(400);

    if (episode.endCard === "talk-to-e8") {
      await page.evaluate(() => {
        const cta = document.querySelector("#cvEnd .cta");
        if (cta) cta.textContent = "Talk to Edge8.";
      });
    }

    await page.locator("#cvTitle").screenshot({ path: path.join(dir, "title.png") });
    await page.locator("#cvEnd").screenshot({ path: path.join(dir, "end.png") });
    await page.locator("#cvThumb").screenshot({ path: path.join(dir, "thumbnail.png") });
  }

  if (episode.endCard === "intro-film") {
    await page.setViewportSize({ width: FRAME.width, height: FRAME.height });
    await page.goto(cardUrl(baseUrl, "end-intro-film"), { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(dir, "end.png") });
  }

  await context.close();
  console.log(`cards: ${dir}`);
});
