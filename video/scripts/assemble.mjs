import fs from "node:fs";
import path from "node:path";
import { FPS, FRAME, ROOT, argOf, episodeSlug, hasFlag, requireFfmpeg, run } from "./lib.mjs";
import { buildTimeline } from "./timeline.mjs";

/**
 * ffmpeg assembly. One pass, no intermediate files:
 *
 *   capture (trimmed)  →  title card cut in at the first beat boundary
 *                      →  rest of capture  →  end card
 *   voiceover beats laid at the frame each beat actually starts on
 *   captions burned in from captions.ass
 *
 * Everything about when is decided in timeline.mjs. This file only speaks
 * ffmpeg.
 */

const slug = episodeSlug();
const t = buildTimeline(slug);

/** ffmpeg filter arguments treat a backslash and a colon as syntax, and a
 *  Windows path is made of both. */
const escapeFilterPath = (p) => p.split("\\").join("/").split(":").join("\\:");

// Fonts for libass. The site ships a variable woff2 that libass cannot read, so
// the burn-in uses the static Manrope TTFs in public/fonts. Drop a
// Manrope-SemiBold.ttf into video/assets/fonts to hit the specified weight 600
// exactly; that directory wins when it exists.
const localFonts = path.join(ROOT, "assets", "fonts");
const fontsDir = fs.existsSync(localFonts) && fs.readdirSync(localFonts).some((f) => /\.(ttf|otf)$/i.test(f))
  ? localFonts
  : path.join(ROOT, "..", "public", "fonts");

const capture = path.join(t.dir, "capture.webm");
const captions = path.join(t.dir, "captions.ass");
const output = argOf("--out", path.join(t.dir, `${slug}.mp4`));

const inputs = [];
const filters = [];
const videoLabels = [];

inputs.push("-i", capture);
let nextInput = 1;

t.segments.forEach((segment, i) => {
  const label = `v${i}`;
  if (segment.kind === "capture") {
    filters.push(
      `[0:v]trim=start=${segment.from.toFixed(3)}:end=${segment.to.toFixed(3)},setpts=PTS-STARTPTS,` +
        `scale=${FRAME.width}:${FRAME.height}:flags=lanczos,fps=${FPS},setsar=1[${label}]`,
    );
  } else {
    inputs.push("-loop", "1", "-framerate", String(FPS), "-t", segment.seconds.toFixed(3), "-i", segment.file);
    filters.push(
      `[${nextInput}:v]scale=${FRAME.width}:${FRAME.height}:flags=lanczos,fps=${FPS},setsar=1,` +
        `format=yuv420p,setpts=PTS-STARTPTS[${label}]`,
    );
    nextInput += 1;
  }
  videoLabels.push(`[${label}]`);
});

filters.push(`${videoLabels.join("")}concat=n=${videoLabels.length}:v=1:a=0[vcat]`);

// Captions are burned after the concat so they can sit over a card too, and the
// path stays relative because ffmpeg's filter syntax and a Windows drive letter
// do not get along. ffmpeg runs with cwd set to the episode directory.
const subtitles = fs.existsSync(captions)
  ? `[vcat]subtitles=filename=captions.ass:fontsdir='${escapeFilterPath(fontsDir)}'[vout]`
  : `[vcat]null[vout]`;
filters.push(subtitles);

const voiced = t.beats.filter((b) => b.voFile && fs.existsSync(b.voFile));
const audioLabels = [];
for (const beat of voiced) {
  inputs.push("-i", beat.voFile);
  const ms = Math.round(beat.start * 1000);
  const label = `a${audioLabels.length}`;
  filters.push(`[${nextInput}:a]aresample=48000,adelay=${ms}|${ms},apad[${label}]`);
  audioLabels.push(`[${label}]`);
  nextInput += 1;
}

if (audioLabels.length) {
  // normalize=0 keeps each beat at its recorded level. With normalize on, amix
  // ducks every voice line by the number of inputs, which is 17 kinds of quiet.
  filters.push(`${audioLabels.join("")}amix=inputs=${audioLabels.length}:normalize=0:dropout_transition=0[amix]`);
  filters.push(`[amix]atrim=0:${t.duration.toFixed(3)},loudnorm=I=-16:TP=-1.5:LRA=11[aout]`);
} else {
  console.warn("No voiceover found. Rendering a silent cut.");
}

const args = [
  "-y",
  ...inputs,
  "-filter_complex",
  filters.join(";"),
  "-map",
  "[vout]",
  ...(audioLabels.length ? ["-map", "[aout]"] : []),
  "-t",
  t.duration.toFixed(3),
  "-c:v",
  "libx264",
  "-preset",
  "slow",
  "-crf",
  "18",
  "-pix_fmt",
  "yuv420p",
  "-r",
  String(FPS),
  ...(audioLabels.length ? ["-c:a", "aac", "-b:a", "192k", "-ar", "48000"] : []),
  "-movflags",
  "+faststart",
  output,
];

if (hasFlag("--dry-run")) {
  console.log(`ffmpeg ${args.map((a) => (a.includes(" ") ? JSON.stringify(a) : a)).join(" ")}`);
  process.exit(0);
}

requireFfmpeg();
run("ffmpeg", args, { cwd: t.dir });
console.log(`\n${output}`);
console.log(
  `${Math.floor(t.duration / 60)}:${String(Math.round(t.duration % 60)).padStart(2, "0")}` +
    ` · ${FRAME.width}x${FRAME.height} · ${voiced.length} voiceover beats · ${t.cues.length} caption cues`,
);
