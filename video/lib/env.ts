import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const OUT = path.join(ROOT, "out");
export const STORAGE_STATE = path.join(OUT, "_auth", "state.json");

// Node loads video/.env itself. No dotenv dependency: the rig should stay
// installable with a single npm i.
try {
  process.loadEnvFile(path.join(ROOT, ".env"));
} catch {
  // No .env yet. Everything below falls back to a default or throws on use.
}

export function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set. Copy video/.env.example to video/.env and fill it in.`);
  return v;
}

export const baseUrl = (process.env.E8_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

// Frame the whole rig agrees on. Everything downstream (cards, captions,
// assembly) is sized from these two numbers.
export const FRAME = { width: 1920, height: 1080 } as const;

// Browser zoom. The capture renders at FRAME / zoom CSS pixels and a matching
// device scale factor, so the video is 1920x1080 of real pixels, not an upscale
// of a smaller frame. 1.4 comes from the brand kit: the UI has to survive being
// watched at 380px wide.
export const zoom = Number(process.env.E8_ZOOM || 1.4);

export const viewport = {
  width: Math.round(FRAME.width / zoom),
  height: Math.round(FRAME.height / zoom),
};

export function episodeDir(slug: string): string {
  return path.join(OUT, slug);
}
