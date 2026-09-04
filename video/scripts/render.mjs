import path from "node:path";
import { ROOT, episodeSlug, hasFlag, playwright, requireFfmpeg, run } from "./lib.mjs";

/**
 * One episode, end to end.
 *
 *   node scripts/render.mjs e01-company-dashboard
 *
 * Order matters. The voiceover is rendered before the capture because the
 * capture paces itself to the audio: beats hold for exactly as long as the
 * voice runs, which is what keeps screen and words together without an editor.
 *
 * Flags:
 *   --skip-vo       reuse the voiceover already in out/<slug>/vo
 *   --skip-capture  reuse the take already in out/<slug>/capture.webm
 *   --skip-cards    reuse the PNGs already in out/<slug>/cards
 */

const slug = episodeSlug();
const env = { E8_EPISODE: slug };
const node = (script, args = []) => run(process.execPath, [path.join(ROOT, "scripts", script), slug, ...args], {
  cwd: ROOT,
  env: { ...process.env, ...env },
});

requireFfmpeg();

console.log(`\n1/6  manifest`);
playwright(["test", "specs/manifest.spec.ts"], { ...env, E8_SKIP_LOGIN: "1" });

if (!hasFlag("--skip-vo")) {
  console.log(`\n2/6  voiceover`);
  run(process.execPath, [path.join(ROOT, "scripts", "voice.mjs"), "render", slug], { cwd: ROOT, env: { ...process.env, ...env } });
} else console.log(`\n2/6  voiceover (skipped)`);

if (!hasFlag("--skip-capture")) {
  console.log(`\n3/6  capture`);
  playwright(["test", "specs/episode.spec.ts"], env);
} else console.log(`\n3/6  capture (skipped)`);

if (!hasFlag("--skip-cards")) {
  console.log(`\n4/6  cards`);
  playwright(["test", "specs/cards.spec.ts"], env);
} else console.log(`\n4/6  cards (skipped)`);

console.log(`\n5/6  captions and QC`);
node("captions.mjs");
node("qc.mjs");

console.log(`\n6/6  assembly`);
node("assemble.mjs");
