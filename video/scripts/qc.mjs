import fs from "node:fs";
import path from "node:path";
import { episodeSlug } from "./lib.mjs";
import { buildTimeline } from "./timeline.mjs";

/**
 * Per-episode QC, run before assembly so a failure costs a rerun of ffmpeg
 * rather than a repost. Four of these checks are the brand ones the series doc
 * asks for; the rest catch a take that went wrong while nobody was watching.
 *
 * "No client data on screen" is the one check a script cannot make. That stays
 * a human step, and the report says so.
 */

const MAX_LINE = 58; // 42 is the target, 58 is where a line starts to crowd the safe area.

function check(slug) {
  const t = buildTimeline(slug);
  const errors = [];
  const warnings = [];

  for (const cue of t.cues) {
    const text = cue.lines.join(" ");
    if (/[\u2014\u2013]/.test(text)) errors.push(`Em or en dash in caption: "${text}"`);
    if (/EDGE\s?8/.test(text)) errors.push(`"Edge8" written in caps: "${text}"`);
    if (cue.lines.length > 2) errors.push(`Caption over two lines: "${text}"`);
    for (const line of cue.lines) {
      if (line.length > MAX_LINE) warnings.push(`Caption line ${line.length} chars: "${line}"`);
    }
  }

  for (const beat of t.beats) {
    if (beat.warning) errors.push(`Beat "${beat.id}" action failed: ${beat.warning}`);
    if (beat.overran) warnings.push(`Beat "${beat.id}" ran past its voiceover. Screen leads the voice here.`);
    if (beat.vo.trim() && !beat.voFile) errors.push(`Beat "${beat.id}" has words but no voiceover file.`);
    if (/[\u2014\u2013]/.test(beat.vo)) errors.push(`Em or en dash in the script for "${beat.id}".`);
  }

  for (const segment of t.segments) {
    if (segment.kind === "card" && !fs.existsSync(segment.file)) {
      errors.push(`Missing card: ${path.basename(segment.file)}. Run the cards step.`);
    }
    if (segment.kind === "capture" && segment.to - segment.from <= 0) {
      errors.push("Capture segment has no length. The take did not record.");
    }
  }

  if (!fs.existsSync(path.join(t.dir, "capture.webm"))) errors.push("No capture.webm. The take did not record.");

  return { timeline: t, errors, warnings };
}

const slug = episodeSlug();
const { timeline, errors, warnings } = check(slug);

const minutes = `${Math.floor(timeline.duration / 60)}:${String(Math.round(timeline.duration % 60)).padStart(2, "0")}`;
console.log(`${slug}: ${minutes}, ${timeline.beats.length} beats, ${timeline.cues.length} caption cues`);
warnings.forEach((w) => console.warn(`  warn  ${w}`));
errors.forEach((e) => console.error(`  FAIL  ${e}`));
console.log("  human check: no client data on screen, names blurred where the script says so.");

if (errors.length) process.exit(1);
