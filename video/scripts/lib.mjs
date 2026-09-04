import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const OUT = path.join(ROOT, "out");

try {
  process.loadEnvFile(path.join(ROOT, ".env"));
} catch {
  // No .env. Callers that need a value fail with a readable message.
}

export const FRAME = { width: 1920, height: 1080 };
export const FPS = 30;
export const TITLE_CARD_SECONDS = 3;
export const DEFAULT_END_CARD_SECONDS = 6;

export const episodeDir = (slug) => path.join(OUT, slug);

export function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set. Copy video/.env.example to video/.env and fill it in.`);
  return v;
}

export function readJson(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${path.relative(ROOT, file)}. Run the earlier step first.`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

export function have(bin) {
  const probe = spawnSync(bin, ["-version"], { stdio: "ignore" });
  return probe.status === 0;
}

export function requireFfmpeg() {
  if (have("ffmpeg") && have("ffprobe")) return;
  throw new Error(
    "ffmpeg and ffprobe are not on PATH.\n" +
      "  Windows: winget install Gyan.FFmpeg\n" +
      "  macOS:   brew install ffmpeg",
  );
}

export const PLAYWRIGHT_CLI = path.join(ROOT, "node_modules", "@playwright", "test", "cli.js");

/** Runs the Playwright CLI through node, so no shell and no .cmd shim. */
export function playwright(args, env = {}) {
  if (!fs.existsSync(PLAYWRIGHT_CLI)) {
    throw new Error("Playwright is not installed. Run: cd video && npm install && npm run install:browser");
  }
  run(process.execPath, [PLAYWRIGHT_CLI, ...args], { cwd: ROOT, env: { ...process.env, ...env } });
}

export function run(bin, args, opts = {}) {
  const res = spawnSync(bin, args, { stdio: "inherit", ...opts });
  if (res.status !== 0) throw new Error(`${bin} exited ${res.status}`);
}

export function probeSeconds(file) {
  const res = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file],
    { encoding: "utf8" },
  );
  if (res.status !== 0) throw new Error(`ffprobe failed on ${file}`);
  return Number(String(res.stdout).trim());
}

export function argOf(flag, fallback = undefined) {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

export const hasFlag = (flag) => process.argv.includes(flag);

/** Positional argument after the script name, minus any flags. */
export function positional(index = 0) {
  const rest = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  // Drop values that belong to a flag.
  const flagValues = new Set();
  process.argv.forEach((a, i) => {
    if (a.startsWith("--") && process.argv[i + 1] && !process.argv[i + 1].startsWith("-")) {
      flagValues.add(process.argv[i + 1]);
    }
  });
  return rest.filter((a) => !flagValues.has(a))[index];
}

export function episodeSlug(index = 0) {
  const slug = positional(index) || process.env.E8_EPISODE;
  if (!slug) throw new Error("No episode. Pass a slug, for example: node scripts/render.mjs e01-company-dashboard");
  return slug;
}
