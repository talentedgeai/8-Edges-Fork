import { defineConfig } from "@playwright/test";
import { OUT, STORAGE_STATE, baseUrl, viewport, zoom } from "./lib/env";

// One rig, two specs: episode.spec.ts records the screen, cards.spec.ts renders
// the title, end, and thumbnail PNGs off the brand kit page. Both run serially.
// Recording is wall-clock work, there is nothing to parallelise.
export default defineConfig({
  testDir: "./specs",
  outputDir: OUT + "/_playwright",
  timeout: 20 * 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./lib/global-setup.ts",
  use: {
    baseURL: baseUrl,
    storageState: STORAGE_STATE,
    viewport,
    deviceScaleFactor: zoom,
    // Headed is deliberate. Headless Chromium renders some CSS (backdrop
    // filters, scrollbar gutters) differently, and this footage ships.
    headless: process.env.E8_HEADLESS === "1",
    launchOptions: {
      args: ["--hide-scrollbars", "--force-device-scale-factor=" + zoom, "--font-render-hinting=none"],
    },
  },
});
