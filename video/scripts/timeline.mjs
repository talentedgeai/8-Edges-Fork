import path from "node:path";
import { DEFAULT_END_CARD_SECONDS, TITLE_CARD_SECONDS, episodeDir, readJson } from "./lib.mjs";

/**
 * The one clock the whole rig agrees on.
 *
 * Captions and assembly both derive from this, so a caption can never drift
 * from the frame it belongs to: there is only one place that decides when a
 * beat starts in the finished film.
 *
 * Capture time  = recorded time minus the warmup lead.
 * Final time    = capture time, plus the title card if it was cut in earlier.
 */

const MAX_LINE = 42; // Brand kit: about 42 characters per line, max 2 lines.
const MIN_CUE = 1.1;

export function chunkCaptions(vo) {
  const clauses = vo
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.,:;?!])\s+/)
    .filter(Boolean);

  const lines = [];
  let line = "";
  for (const clause of clauses) {
    // Break on clause, never mid-phrase. A clause longer than a line gets split
    // on the last word that fits.
    if (!line) line = clause;
    else if ((line + " " + clause).length <= MAX_LINE) line += " " + clause;
    else {
      lines.push(line);
      line = clause;
    }
    while (line.length > MAX_LINE) {
      const cut = line.lastIndexOf(" ", MAX_LINE);
      lines.push(line.slice(0, cut > 0 ? cut : MAX_LINE).trim());
      line = line.slice(cut > 0 ? cut : MAX_LINE).trim();
    }
  }
  if (line) lines.push(line);

  const cues = [];
  for (let i = 0; i < lines.length; i += 2) cues.push(lines.slice(i, i + 2));
  return cues;
}

export function buildTimeline(slug) {
  const dir = episodeDir(slug);
  const episode = readJson(path.join(dir, "episode.json"));
  const recorded = readJson(path.join(dir, "beats.json"));
  const vo = readJson(path.join(dir, "vo", "vo.json"));

  const voById = new Map(vo.beats.map((b) => [b.id, b]));
  const lead = recorded.leadTrim || 0;
  const captureEnd = Math.max(...recorded.beats.map((b) => b.end)) - lead;

  // Where the title card is cut in, in capture time. Null means no card.
  const cardBeat = episode.titleCardAfter
    ? recorded.beats.find((b) => b.id === episode.titleCardAfter)
    : null;
  const titleAt = cardBeat ? cardBeat.end - lead : null;
  const titleSeconds = cardBeat ? TITLE_CARD_SECONDS : 0;
  const shift = (captureTime) => captureTime + (titleAt !== null && captureTime >= titleAt ? titleSeconds : 0);

  const beats = recorded.beats.map((b) => {
    const captureStart = b.start - lead;
    const voBeat = voById.get(b.id);
    const start = shift(captureStart);
    return {
      id: b.id,
      captureStart,
      captureEnd: b.end - lead,
      start,
      end: shift(b.end - lead),
      voFile: voBeat?.file ? path.join(dir, "vo", voBeat.file) : null,
      voSeconds: voBeat?.seconds || 0,
      vo: episode.beats.find((e) => e.id === b.id)?.vo || "",
      captions: episode.beats.find((e) => e.id === b.id)?.captions || null,
      warning: b.warning || null,
      overran: b.overran || false,
    };
  });

  const endSeconds = episode.endCardSeconds || DEFAULT_END_CARD_SECONDS;

  const segments = [];
  if (titleAt !== null) {
    segments.push({ kind: "capture", from: 0, to: titleAt });
    segments.push({ kind: "card", file: path.join(dir, "cards", "title.png"), seconds: titleSeconds });
    segments.push({ kind: "capture", from: titleAt, to: captureEnd });
  } else {
    segments.push({ kind: "capture", from: 0, to: captureEnd });
  }
  segments.push({ kind: "card", file: path.join(dir, "cards", "end.png"), seconds: endSeconds });

  const cues = [];
  for (const beat of beats) {
    if (!beat.vo.trim() || !beat.voSeconds) continue;
    const blocks = beat.captions || chunkCaptions(beat.vo);
    const weights = blocks.map((b) => b.join(" ").length);
    const total = weights.reduce((a, c) => a + c, 0) || 1;
    let at = beat.start;
    blocks.forEach((lines, i) => {
      const share = (weights[i] / total) * beat.voSeconds;
      const seconds = Math.max(MIN_CUE, share);
      cues.push({ start: at, end: Math.min(at + seconds, beat.start + beat.voSeconds + 0.35), lines });
      at += share;
    });
  }

  const duration = captureEnd + titleSeconds + endSeconds;

  return { slug, dir, episode, beats, segments, cues, duration, captureEnd, titleAt, titleSeconds, endSeconds };
}
