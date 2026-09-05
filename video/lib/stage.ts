import fs from "node:fs/promises";
import path from "node:path";
import type { BrowserContext, Page } from "@playwright/test";
import { ROOT, baseUrl } from "./env";

const CURSOR_ID = "__e8_cursor";

/**
 * Playwright's video does not draw the mouse pointer, so we draw our own and
 * let it follow the real events. Everything on screen a viewer reads as "a
 * person is doing this" comes from this overlay plus deliberate pacing.
 */
export async function installStageChrome(context: BrowserContext, privacy: string[] = []) {
  const privacyCss = privacy.length
    ? `${privacy.join(",")} { filter: blur(7px) !important; }`
    : "";
  await context.addInitScript(
    ({ cursorId, privacyCss }: { cursorId: string; privacyCss: string }) => {
      const paint = () => {
        if (document.getElementById(cursorId)) return;
        const style = document.createElement("style");
        style.textContent = `
          #${cursorId} {
            position: fixed; top: 0; left: 0; width: 22px; height: 22px;
            margin: -11px 0 0 -11px; border-radius: 50%;
            background: rgba(255,255,255,.92);
            box-shadow: 0 0 0 2px rgba(16,16,20,.55), 0 6px 18px rgba(16,16,20,.35);
            pointer-events: none; z-index: 2147483647; opacity: 0;
            transition: transform .08s ease-out, opacity .2s linear;
          }
          #${cursorId}.on { opacity: 1; }
          #${cursorId}.tap { transform: scale(.6); background: #6ff2c1; }
          html { scrollbar-width: none; }
          ::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
          *, *::before, *::after { caret-color: transparent !important; }
          ${privacyCss}
        `;
        document.head.appendChild(style);
        const dot = document.createElement("div");
        dot.id = cursorId;
        document.documentElement.appendChild(dot);
        addEventListener(
          "mousemove",
          (e) => {
            dot.classList.add("on");
            dot.style.left = e.clientX + "px";
            dot.style.top = e.clientY + "px";
          },
          true,
        );
        addEventListener("mousedown", () => dot.classList.add("tap"), true);
        addEventListener("mouseup", () => setTimeout(() => dot.classList.remove("tap"), 120), true);
      };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", paint);
      else paint();
    },
    { cursorId: CURSOR_ID, privacyCss },
  );
}

export type Stage = ReturnType<typeof makeStage>;

export function makeStage(page: Page) {
  let cursor = { x: 40, y: 40 };

  const sleep = (ms: number) => page.waitForTimeout(ms);

  async function moveTo(x: number, y: number, ms = 700) {
    // Real cursors do not teleport. Ease the move so the eye can follow it.
    const steps = Math.max(8, Math.round(ms / 16));
    const from = { ...cursor };
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
      await sleep(ms / steps);
    }
    cursor = { x, y };
  }

  async function pointAt(selector: string, ms = 700) {
    const el = page.locator(selector).first();
    await el.waitFor({ state: "visible" });
    await el.scrollIntoViewIfNeeded();
    const box = await el.boundingBox();
    if (!box) throw new Error(`No box for ${selector}`);
    await moveTo(box.x + box.width / 2, box.y + box.height / 2, ms);
    return box;
  }

  return {
    page,

    /** Show a full-frame brand card. See assets/cards. */
    async card(name: string) {
      await page.goto(cardUrl(baseUrl, name), { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(250);
    },

    /** Navigate and settle. Never records a half-painted page. */
    async goto(pathOrUrl: string, settleMs = 900) {
      await page.goto(pathOrUrl, { waitUntil: "networkidle" });
      await page.waitForTimeout(settleMs);
    },

    /** Hold the current frame. The single most useful direction in this rig. */
    async hold(seconds: number) {
      await sleep(seconds * 1000);
    },

    moveTo,
    pointAt,

    /** Move to the target, pause, then click. Reads as intent, not a jump cut. */
    async click(selector: string, { moveMs = 700, settleMs = 800 } = {}) {
      await pointAt(selector, moveMs);
      await sleep(200);
      await page.locator(selector).first().click();
      await sleep(settleMs);
    },

    async hover(selector: string, { moveMs = 700, dwellMs = 900 } = {}) {
      await pointAt(selector, moveMs);
      await sleep(dwellMs);
    },

    /** Slow scroll. Fast scrolling reads as noise and blurs in H.264. */
    async scroll(pixels: number, ms = 1600) {
      await page.evaluate(
        ({ pixels, ms }) =>
          new Promise<void>((resolve) => {
            const start = window.scrollY;
            const t0 = performance.now();
            const step = (now: number) => {
              const t = Math.min(1, (now - t0) / ms);
              const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
              window.scrollTo(0, start + pixels * e);
              if (t < 1) requestAnimationFrame(step);
              else resolve();
            };
            requestAnimationFrame(step);
          }),
        { pixels, ms },
      );
      await sleep(150);
    },

    /**
     * Push in on the payoff frame. A dense table at 1080p is unreadable in a
     * feed, so the beat that matters gets a deliberate zoom.
     */
    async pushIn(selector: string, scale = 1.35, ms = 700) {
      const box = await pointAt(selector, 400);
      await page.evaluate(
        ({ box, scale, ms }) => {
          const el = document.documentElement;
          el.style.transition = `transform ${ms}ms cubic-bezier(.22,.61,.36,1)`;
          el.style.transformOrigin = `${box.x + box.width / 2}px ${box.y + box.height / 2 + window.scrollY}px`;
          el.style.transform = `scale(${scale})`;
        },
        { box, scale, ms },
      );
      await sleep(ms + 150);
    },

    async pullOut(ms = 600) {
      await page.evaluate((ms) => {
        const el = document.documentElement;
        el.style.transition = `transform ${ms}ms cubic-bezier(.22,.61,.36,1)`;
        el.style.transform = "none";
      }, ms);
      await sleep(ms + 150);
    },

    /** Drag a card across a board, at a speed a human hand would manage. */
    async drag(fromSelector: string, toSelector: string, ms = 1200) {
      const from = await pointAt(fromSelector, 600);
      await page.mouse.down();
      await sleep(180);
      const to = await page.locator(toSelector).first().boundingBox();
      if (!to) throw new Error(`No box for ${toSelector}`);
      const steps = Math.round(ms / 16);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        await page.mouse.move(
          from.x + from.width / 2 + (to.x + to.width / 2 - from.x - from.width / 2) * t,
          from.y + from.height / 2 + (to.y + to.height / 2 - from.y - from.height / 2) * t,
        );
        await sleep(ms / steps);
      }
      await sleep(150);
      await page.mouse.up();
      await sleep(600);
    },

    /** Type at human speed, for the one or two beats that show typing. */
    async type(selector: string, text: string, delay = 55) {
      await pointAt(selector, 500);
      await page.locator(selector).first().click();
      await page.locator(selector).first().type(text, { delay });
      await sleep(400);
    },
  };
}

const CARD_PREFIX = "/__e8card/";

/**
 * Full-frame cards (the Stanford stat, the four outcomes) are HTML in
 * assets/cards, served back on the site's own origin so they can use the real
 * self-hosted Manrope and the real tokens. Nothing is approximated.
 */
export async function installCardRoute(context: BrowserContext, baseUrl: string) {
  const dir = path.join(ROOT, "assets", "cards");
  await context.route(`**${CARD_PREFIX}*`, async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop();
    const file = path.join(dir, `${name}.html`);
    const html = (await fs.readFile(file, "utf8")).replaceAll("{{BASE}}", baseUrl);
    await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html });
  });
}

export const cardUrl = (baseUrl: string, name: string) => `${baseUrl}${CARD_PREFIX}${name}`;
