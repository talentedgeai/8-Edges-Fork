import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  OUT,
  argOf,
  episodeDir,
  episodeSlug,
  hasFlag,
  probeSeconds,
  readJson,
  required,
  requireFfmpeg,
  writeJson,
} from "./lib.mjs";

/**
 * ElevenLabs voiceover.
 *
 *   node scripts/voice.mjs list                      every voice on the account
 *   node scripts/voice.mjs audition                  the shortlist, same lines, one file each
 *   node scripts/voice.mjs render <episode-slug>     one mp3 per beat, plus vo.json
 *
 * One mp3 per beat, not one per episode. That is what lets the capture pace
 * itself to the audio and lets assembly place each beat's voice at the frame
 * where that beat actually starts.
 */

const API = "https://api.elevenlabs.io/v1";

/**
 * The pick: Brian. American, mid-range, unhurried, reads a declarative sentence
 * without selling it. The audience is a CEO being told something true, so the
 * voice has to sound like a colleague, not a trailer.
 *
 * Alternates worth hearing before you commit, which is what `audition` is for.
 * Voices are resolved by name against your own library, so an id change on
 * ElevenLabs' side does not break the rig.
 */
const SHORTLIST = ["Brian", "Chris", "Daniel", "George", "Sarah", "Jessica"];

const AUDITION_TEXT =
  "You run a company of two hundred people. You know the strategy. But do the other one hundred ninety nine actually know how to execute it? " +
  "Stanford looked at fifty one successful AI programs. 77% of the work was not the AI technology. It was the data, and redesigning the workflows.";

function settings() {
  return {
    stability: Number(process.env.E8_VOICE_STABILITY || 0.45),
    similarity_boost: Number(process.env.E8_VOICE_SIMILARITY || 0.8),
    style: Number(process.env.E8_VOICE_STYLE || 0),
    use_speaker_boost: true,
    speed: Number(process.env.E8_VOICE_SPEED || 1.0),
  };
}

async function api(pathname, init = {}) {
  const res = await fetch(`${API}${pathname}`, {
    ...init,
    headers: { "xi-api-key": required("ELEVENLABS_API_KEY"), ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`ElevenLabs ${pathname} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res;
}

async function voices() {
  const res = await api("/voices");
  const body = await res.json();
  return body.voices || [];
}

async function resolveVoiceId(name) {
  if (process.env.E8_VOICE_ID && !name) return process.env.E8_VOICE_ID;
  const wanted = (name || process.env.E8_VOICE_NAME || "Brian").toLowerCase();
  const list = await voices();
  const hit = list.find((v) => v.name?.toLowerCase() === wanted);
  if (!hit) {
    throw new Error(
      `No voice named "${wanted}" on this account. Add it from the ElevenLabs voice library, ` +
        `or set E8_VOICE_ID. Available: ${list.map((v) => v.name).join(", ")}`,
    );
  }
  return hit.voice_id;
}

async function speak({ voiceId, text, previous, next, file }) {
  const res = await api(`/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: process.env.E8_VOICE_MODEL || "eleven_multilingual_v2",
      voice_settings: settings(),
      // Context on both sides keeps prosody continuous across beat boundaries,
      // so a 17 beat film does not sound like 17 separate takes.
      previous_text: previous || undefined,
      next_text: next || undefined,
    }),
  });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

const hash = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);

async function cmdList() {
  for (const v of await voices()) {
    const labels = Object.values(v.labels || {}).join(", ");
    console.log(`${v.name.padEnd(18)} ${v.voice_id}  ${labels}`);
  }
}

async function cmdAudition() {
  const names = (argOf("--voices") || SHORTLIST.join(",")).split(",").map((s) => s.trim());
  const dir = path.join(OUT, "_audition");
  fs.mkdirSync(dir, { recursive: true });
  for (const name of names) {
    try {
      const voiceId = await resolveVoiceId(name);
      const file = path.join(dir, `${name.toLowerCase()}.mp3`);
      await speak({ voiceId, text: argOf("--text") || AUDITION_TEXT, file });
      console.log(`${name.padEnd(12)} ${file}`);
    } catch (err) {
      console.warn(`${name.padEnd(12)} skipped: ${err.message}`);
    }
  }
  console.log(`\nListen on a phone speaker, not headphones. That is where this gets watched.`);
  console.log(`Then set E8_VOICE_NAME in video/.env and keep it for the whole series.`);
}

async function cmdRender() {
  requireFfmpeg();
  const slug = episodeSlug(1);
  const dir = episodeDir(slug);
  const manifest = readJson(path.join(dir, "episode.json"));
  const voDir = path.join(dir, "vo");
  const existing = fs.existsSync(path.join(voDir, "vo.json")) ? readJson(path.join(voDir, "vo.json")) : null;
  const cached = new Map((existing?.beats || []).map((b) => [b.id, b]));
  const voiceId = await resolveVoiceId(argOf("--voice"));
  const force = hasFlag("--force");

  const beats = [];
  for (const [i, beat] of manifest.beats.entries()) {
    const file = path.join(voDir, `${String(i + 1).padStart(2, "0")}-${beat.id}.mp3`);
    if (!beat.vo?.trim()) {
      beats.push({ id: beat.id, file: null, seconds: 0, hash: null });
      continue;
    }
    const sig = hash(`${voiceId}|${JSON.stringify(settings())}|${beat.vo}`);
    const prior = cached.get(beat.id);
    if (!force && prior?.hash === sig && fs.existsSync(file)) {
      beats.push(prior);
      console.log(`${beat.id.padEnd(24)} cached  ${prior.seconds.toFixed(2)}s`);
      continue;
    }
    await speak({
      voiceId,
      text: beat.vo,
      previous: manifest.beats[i - 1]?.vo,
      next: manifest.beats[i + 1]?.vo,
      file,
    });
    const seconds = probeSeconds(file);
    beats.push({ id: beat.id, file: path.basename(file), seconds, hash: sig });
    console.log(`${beat.id.padEnd(24)} ${seconds.toFixed(2)}s`);
  }

  const total = beats.reduce((sum, b) => sum + b.seconds, 0);
  writeJson(path.join(voDir, "vo.json"), {
    slug,
    voiceId,
    voiceName: process.env.E8_VOICE_NAME || null,
    model: process.env.E8_VOICE_MODEL || "eleven_multilingual_v2",
    settings: settings(),
    totalSeconds: total,
    beats: beats.map((b) => ({ ...b, file: b.file ? path.basename(String(b.file)) : null })),
  });
  const m = Math.floor(total / 60);
  console.log(`\nVoiceover ${m}:${String(Math.round(total % 60)).padStart(2, "0")} across ${beats.length} beats.`);
}

const cmd = process.argv[2];
const run = { list: cmdList, audition: cmdAudition, render: cmdRender }[cmd];
if (!run) {
  console.error("Usage: node scripts/voice.mjs <list|audition|render> [episode-slug]");
  process.exit(1);
}
run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
