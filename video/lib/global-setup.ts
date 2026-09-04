import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { STORAGE_STATE, baseUrl, required } from "./env";

const MAX_AGE_MS = 8 * 60 * 60 * 1000;

// Signs the demo admin in once and caches the session, so no episode ever
// records the login screen. Password sign-in, not the magic link: the rig has
// no mailbox.
export default async function globalSetup() {
  if (process.env.E8_SKIP_LOGIN === "1") return;

  const fresh =
    fs.existsSync(STORAGE_STATE) &&
    Date.now() - fs.statSync(STORAGE_STATE).mtimeMs < MAX_AGE_MS &&
    process.env.E8_FORCE_LOGIN !== "1";
  if (fresh) return;

  const email = required("E8_DEMO_EMAIL");
  const password = required("E8_DEMO_PASSWORD");

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/admin/login`, { waitUntil: "domcontentloaded" });
    await page.fill("#email", email);
    await page.fill("#password", password);
    await page.click('button:has-text("Sign in")');
    await page.waitForURL((url) => url.pathname.startsWith("/admin") && !url.pathname.includes("/login"), {
      timeout: 30_000,
    });
    fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
    await context.storageState({ path: STORAGE_STATE });
  } finally {
    await browser.close();
  }
}
