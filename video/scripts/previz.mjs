import fs from "node:fs";
import path from "node:path";
import { ROOT, TITLE_CARD_SECONDS, DEFAULT_END_CARD_SECONDS, argOf, episodeDir, episodeSlug, readJson } from "./lib.mjs";
import { chunkCaptions } from "./timeline.mjs";

/**
 * Animatic. Plays the episode before a frame of it exists.
 *
 *   node scripts/previz.mjs eight-edges-intro
 *
 * Beats run at their real length, captions appear where they will appear, and
 * the cards are the cards. Screen beats stand in as a labelled frame carrying
 * the route and the stage directions, both read out of the episode file rather
 * than restated here.
 *
 * Timings come from out/<slug>/vo/vo.json when the voiceover has been rendered.
 * Until then they are a 145 wpm estimate, and the page says so.
 */

const WORDS_PER_MINUTE = 145;
const CARD_DIR = path.join(ROOT, "assets", "cards");

const estimate = (vo) => (vo.trim() ? (vo.trim().split(/\s+/).length / WORDS_PER_MINUTE) * 60 : 0);

/**
 * Scopes a card's own CSS under its frame, so the animatic shows the real card
 * rather than a second drawing of it. Cards are small, flat stylesheets: a few
 * element and class rules plus the odd keyframe.
 */
function scopeCard(name, html) {
  const scope = `.card[data-card="${name}"]`;
  const css = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
  const body = html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<meta[^>]*>|<title>[\s\S]*?<\/title>/g, "");

  const out = [];
  let rest = css.replace(/@font-face\s*{[^}]*}/g, "");

  // Keyframes are lifted whole and renamed, so two cards cannot collide.
  rest = rest.replace(/@keyframes\s+([\w-]+)\s*{([\s\S]*?})\s*}/g, (_, animation, frames) => {
    out.push(`@keyframes ${name}-${animation} {${frames}}`);
    return "";
  });

  for (const rule of rest.split("}")) {
    const [rawSelector, decls] = rule.split("{");
    if (!decls || !rawSelector.trim()) continue;
    const selectors = rawSelector
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        if (s === ":root" || s === "html" || s === "body" || s === "html, body") return scope;
        return `${scope} ${s}`;
      });
    out.push(`${selectors.join(", ")} { ${decls.trim().replace(/animation:\s*([\w-]+)/g, `animation: ${name}-$1`)} }`);
  }
  return { css: out.join("\n"), body: body.trim() };
}

function loadCards() {
  const cards = {};
  for (const file of fs.readdirSync(CARD_DIR).filter((f) => f.endsWith(".html"))) {
    const name = path.basename(file, ".html");
    cards[name] = scopeCard(name, fs.readFileSync(path.join(CARD_DIR, file), "utf8"));
  }
  return cards;
}

/**
 * Real stills from specs/shots.spec.ts, inlined so the animatic is one file
 * that can be published or mailed. A beat with no still falls back to a
 * labelled placeholder rather than pretending.
 */
function loadShots(slug) {
  const dir = path.join(episodeDir(slug), "shots");
  const index = path.join(dir, "shots.json");
  if (!fs.existsSync(index)) return {};
  const shots = {};
  for (const shot of readJson(index).shots) {
    if (shot.status !== "ok" || !shot.file) continue;
    const file = path.join(dir, shot.file);
    if (!fs.existsSync(file)) continue;
    (shots[shot.id] ||= []).push({
      route: shot.route,
      src: "data:image/jpeg;base64," + fs.readFileSync(file).toString("base64"),
    });
  }
  return shots;
}

function frameFor(beat) {
  const card = [...beat.steps].reverse().find((s) => s.fn === "card");
  if (card) return { kind: "card", card: card.args[0] };
  const route = beat.steps.find((s) => s.fn === "goto");
  return { kind: "ui", route: route ? route.args[0] : null };
}

const direction = (step) => {
  const args = step.args.join(", ");
  return `${step.fn}(${args})`;
};

function build(slug, shots) {
  const dir = episodeDir(slug);
  const episode = readJson(path.join(dir, "episode.json"));
  const voFile = path.join(dir, "vo", "vo.json");
  const rendered = fs.existsSync(voFile) ? readJson(voFile) : null;
  const voById = new Map((rendered?.beats || []).map((b) => [b.id, b.seconds]));

  const frames = [];
  const cues = [];
  let at = 0;

  episode.beats.forEach((beat) => {
    const spoken = voById.get(beat.id) ?? estimate(beat.vo);
    const seconds = Math.max(spoken + (beat.hold || 0), beat.minSeconds || 0);
    const frame = frameFor(beat);
    if (frame.kind === "ui" && shots[beat.id]?.length) {
      frame.kind = "shot";
      frame.routes = shots[beat.id].map((s) => s.route);
    }
    frames.push({
      ...frame,
      id: beat.id,
      start: at,
      end: at + seconds,
      vo: beat.vo,
      spoken,
      hold: beat.hold || 0,
      directions: beat.steps.map(direction),
    });

    if (spoken > 0) {
      const blocks = beat.captions || chunkCaptions(beat.vo);
      const weights = blocks.map((b) => b.join(" ").length);
      const total = weights.reduce((a, c) => a + c, 0) || 1;
      let cueAt = at;
      blocks.forEach((lines, i) => {
        const share = (weights[i] / total) * spoken;
        cues.push({ start: cueAt, end: Math.min(cueAt + Math.max(1.1, share), at + spoken + 0.35), lines });
        cueAt += share;
      });
    }
    at += seconds;

    if (episode.titleCardAfter === beat.id) {
      frames.push({
        kind: "title",
        id: "title-card",
        start: at,
        end: at + TITLE_CARD_SECONDS,
        vo: "",
        spoken: 0,
        hold: TITLE_CARD_SECONDS,
        directions: ["title card, cut in at the first beat boundary"],
      });
      at += TITLE_CARD_SECONDS;
    }
  });

  const endSeconds = episode.endCardSeconds || DEFAULT_END_CARD_SECONDS;
  frames.push({
    kind: episode.endCard === "intro-film" ? "card" : "end",
    card: episode.endCard === "intro-film" ? "end-intro-film" : undefined,
    id: "end-card",
    start: at,
    end: at + endSeconds,
    vo: "",
    spoken: 0,
    hold: endSeconds,
    directions: ["end card"],
  });
  at += endSeconds;

  const screenFrames = frames.filter((f) => f.kind === "ui" || f.kind === "shot");
  return {
    episode,
    frames,
    cues,
    duration: at,
    timedFrom: rendered ? "voiceover" : "estimate",
    screens: { total: screenFrames.length, real: screenFrames.filter((f) => f.kind === "shot").length },
  };
}

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const escape = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function page(data, cards, shots) {
  const { episode, frames, cues, duration, timedFrom, screens } = data;
  const cardCss = Object.values(cards)
    .map((c) => c.css)
    .join("\n");
  const cardMarkup = Object.entries(cards)
    .map(([name, c]) => `<div class="card" data-card="${name}" hidden>${c.body}</div>`)
    .join("\n");

  const railRows = frames
    .map(
      (f, i) => `
      <button class="row" data-seek="${f.start.toFixed(2)}" data-frame="${i}">
        <span class="t">${clock(f.start)}</span>
        <span class="rowBody">
          <span class="rowHead">
            <span class="id">${escape(f.id)}</span>
            <span class="tag tag--${f.kind}">${f.kind === "ui" || f.kind === "shot" ? escape(f.route || "screen") : f.kind}</span>
          </span>
          ${f.vo ? `<span class="vo">${escape(f.vo)}</span>` : ""}
        </span>
      </button>`,
    )
    .join("");

  const seriesRail =
    episode.number === null
      ? ""
      : Array.from({ length: 17 }, (_, i) => {
          const current = i === Number(episode.number);
          return `<i class="${current ? "on" : i < Number(episode.number) ? "done" : ""}"></i>`;
        }).join("");

  return `<title>${escape(episode.title)} Animatic</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@200..800&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
  /* Deliberately single theme. This is an edit suite: the frame is judged
     against black, in both the brand kit and the feed it ships to. */
  :root {
    --ground: #0b0b0e;
    --surface: #16161b;
    --surface-2: #1e1e25;
    --line: rgba(255,255,255,.09);
    --text: #f3f4f6;
    --muted: #8b8f97;
    --mint: #6ff2c1;
    --blue: #287be8;
    --dark: #101014;
    --sans: 'Manrope', system-ui, -apple-system, sans-serif;
    --mono: 'JetBrains Mono', ui-monospace, monospace;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--ground);
    color: var(--text);
    font-family: var(--sans);
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 1440px; margin: 0 auto; padding: 28px 26px 60px; }

  header { display: flex; flex-wrap: wrap; gap: 16px 28px; align-items: baseline; padding-bottom: 20px; border-bottom: 1px solid var(--line); }
  .eyebrow { font-size: 12px; font-weight: 800; letter-spacing: .22em; text-transform: uppercase; color: var(--mint); }
  h1 { margin: 4px 0 0; font-size: 30px; font-weight: 800; letter-spacing: -.025em; }
  .meta { margin-left: auto; display: flex; gap: 22px; font-family: var(--mono); font-size: 12px; color: var(--muted); }
  .meta b { display: block; color: var(--text); font-size: 15px; font-weight: 500; font-variant-numeric: tabular-nums; }

  .note { margin: 18px 0 0; padding: 11px 14px; border: 1px solid var(--line); border-left: 2px solid var(--mint); border-radius: 3px; background: var(--surface); color: var(--muted); font-size: 13.5px; line-height: 1.5; }
  .note b { color: var(--text); font-weight: 600; }

  .grid { display: grid; grid-template-columns: minmax(0,1fr) 372px; gap: 24px; margin-top: 22px; align-items: start; }
  @media (max-width: 1040px) { .grid { grid-template-columns: minmax(0,1fr); } }

  /* Stage */
  .stage { position: relative; width: 100%; aspect-ratio: 16/9; background: #000; border: 1px solid var(--line); border-radius: 4px; overflow: hidden; }
  .frame { position: absolute; inset: 0; }
  .frame[hidden] { display: none; }

  /* A real still of the page the beat lands on. object-fit: cover because the
     grab is taken at the capture's own aspect, not the browser window's. */
  .shot { width: 100%; height: 100%; object-fit: cover; display: block; }
  .shotTag { position: absolute; right: calc(24px * var(--k)); top: calc(24px * var(--k)); padding: calc(7px * var(--k)) calc(14px * var(--k)); border-radius: 3px; background: rgba(16,16,20,.72); font-family: var(--mono); font-size: calc(20px * var(--k)); color: var(--mint); }

  /* A screen beat has not been shot yet. Say so plainly instead of faking a UI. */
  .ui { display: grid; grid-template-rows: auto 1fr; height: 100%; background: linear-gradient(180deg, #14141a, #0d0d11); }
  .chrome { display: flex; align-items: center; gap: 10px; padding: calc(14px * var(--k)) calc(18px * var(--k)); border-bottom: 1px solid rgba(255,255,255,.07); }
  .dot { width: calc(11px * var(--k)); height: calc(11px * var(--k)); border-radius: 50%; background: rgba(255,255,255,.14); }
  .url { margin-left: calc(10px * var(--k)); padding: calc(6px * var(--k)) calc(14px * var(--k)); border-radius: 999px; background: rgba(255,255,255,.06); font-family: var(--mono); font-size: calc(15px * var(--k)); color: var(--muted); }
  .uiBody { display: grid; place-content: center; gap: calc(16px * var(--k)); text-align: center; padding: calc(40px * var(--k)); }
  .uiKicker { font-family: var(--mono); font-size: calc(15px * var(--k)); letter-spacing: .2em; text-transform: uppercase; color: var(--blue); }
  .uiTitle { font-size: calc(46px * var(--k)); font-weight: 800; letter-spacing: -.025em; }
  .uiSteps { display: flex; flex-wrap: wrap; gap: calc(8px * var(--k)); justify-content: center; }
  .uiSteps span { padding: calc(6px * var(--k)) calc(12px * var(--k)); border: 1px solid rgba(255,255,255,.12); border-radius: 3px; font-family: var(--mono); font-size: calc(15px * var(--k)); color: var(--muted); }

  /* Cards render at true 1920 x 1080 and scale to the stage, exactly as the
     brand kit previews them. */
  .cardHost { position: absolute; inset: 0; overflow: hidden; }
  .card { position: absolute; top: 0; left: 0; width: 1920px; height: 1080px; transform-origin: top left; transform: scale(var(--k)); }
  ${cardCss}
  /* After the card rules on purpose. A card's own body rule carries its own
     display, height, and margin at equal specificity, and would otherwise win
     the cascade and collapse the frame. */
  .cardHost .card {
    position: absolute !important; top: 0 !important; left: 0 !important;
    width: 1920px !important; height: 1080px !important; margin: 0 !important;
    transform-origin: top left !important; transform: scale(var(--k)) !important;
  }
  .card[hidden] { display: none !important; }

  /* Brand kit title and end cards, specced in section 02 and 03. */
  .kit { position: absolute; top: 0; left: 0; width: 1920px; height: 1080px; transform-origin: top left; transform: scale(var(--k)); background: var(--dark); color: #fff; font-family: var(--sans); }
  .kit .pad { position: absolute; left: 160px; top: 300px; max-width: 1400px; }
  .kit .arc { margin: 0; font-size: 26px; font-weight: 800; letter-spacing: .24em; text-transform: uppercase; color: var(--mint); }
  .kit .no { margin: 18px 0 0; font-size: 88px; font-weight: 800; color: var(--mint); line-height: 1; }
  .kit .t { margin: 10px 0 0; font-size: 112px; font-weight: 800; letter-spacing: -.025em; line-height: 1.02; }
  .kit .mark { position: absolute; left: 160px; top: 948px; font-size: 30px; font-weight: 700; color: rgba(255,255,255,.62); }
  .kit .mark i { display: inline-block; width: 13px; height: 13px; border-radius: 50%; background: var(--mint); margin-right: 12px; }
  .kit .rail { position: absolute; left: 160px; top: 995px; width: 1600px; display: flex; gap: 6px; }
  .kit .rail i { flex: 1; height: 5px; background: rgba(255,255,255,.16); }
  .kit .rail i.done { background: rgba(111,242,193,.42); }
  .kit .rail i.on { background: var(--mint); }
  .kit.end { display: grid; place-content: center; text-align: center; }
  .kit.end .line { margin: 0; font-size: 104px; font-weight: 800; letter-spacing: -.025em; line-height: 1.1; }
  .kit.end .cta { margin: 46px 0 0; font-size: 42px; font-weight: 700; color: var(--mint); }
  .kit.end .sig { margin: 22px 0 0; font-size: 34px; font-weight: 500; color: rgba(255,255,255,.55); }

  /* Caption, at the brand kit's own values scaled to the stage. */
  .caption { position: absolute; left: 0; right: 0; bottom: calc(160px * var(--k)); display: flex; flex-direction: column; align-items: center; gap: calc(4px * var(--k)); pointer-events: none; }
  .caption span { background: rgba(16,16,20,.86); padding: calc(8px * var(--k)) calc(22px * var(--k)); border-radius: calc(6px * var(--k)); font-size: calc(52px * var(--k)); font-weight: 600; line-height: 1.24; color: #fff; }
  .guides { position: absolute; inset: calc(96px * var(--k)); border: 1px dashed rgba(111,242,193,.32); pointer-events: none; }
  .guides[hidden] { display: none; }

  /* Transport */
  .transport { margin-top: 14px; display: flex; align-items: center; gap: 14px; }
  button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }
  .play { width: 46px; height: 46px; border-radius: 50%; background: var(--mint); color: #0b0b0e; display: grid; place-items: center; font-size: 15px; font-weight: 800; flex: none; }
  .play:focus-visible, .row:focus-visible, .toggle:focus-visible { outline: 2px solid var(--mint); outline-offset: 2px; }
  .scrub { flex: 1; -webkit-appearance: none; appearance: none; height: 4px; border-radius: 2px; background: var(--surface-2); }
  .scrub::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%; background: var(--mint); }
  .scrub::-moz-range-thumb { width: 14px; height: 14px; border: 0; border-radius: 50%; background: var(--mint); }
  .time { font-family: var(--mono); font-size: 13px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .time b { color: var(--text); font-weight: 500; }
  .toggle { font-family: var(--mono); font-size: 12px; letter-spacing: .06em; color: var(--muted); border: 1px solid var(--line); border-radius: 3px; padding: 7px 10px; }
  .toggle[aria-pressed="true"] { color: var(--mint); border-color: rgba(111,242,193,.4); }

  .now { margin-top: 16px; padding: 15px 17px; border: 1px solid var(--line); border-radius: 4px; background: var(--surface); }
  .nowHead { display: flex; align-items: baseline; gap: 12px; }
  .nowHead h2 { margin: 0; font-size: 15px; font-weight: 700; letter-spacing: -.01em; }
  .nowHead .t { font-family: var(--mono); font-size: 12px; color: var(--muted); }
  .steps { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 12px; }
  .steps span { font-family: var(--mono); font-size: 12px; color: var(--muted); border: 1px solid var(--line); border-radius: 3px; padding: 5px 9px; }
  .nowVo { margin: 12px 0 0; font-size: 14.5px; line-height: 1.6; color: #c9ccd2; max-width: 62ch; }

  /* Beat rail */
  .rail { border: 1px solid var(--line); border-radius: 4px; background: var(--surface); max-height: 78vh; overflow-y: auto; }
  .railHead { position: sticky; top: 0; z-index: 1; padding: 13px 16px; background: var(--surface); border-bottom: 1px solid var(--line); font-size: 12px; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; color: var(--muted); }
  .row { display: flex; gap: 12px; width: 100%; text-align: left; padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,.05); }
  .row:hover { background: var(--surface-2); }
  .row[data-current="true"] { background: rgba(111,242,193,.07); box-shadow: inset 2px 0 0 var(--mint); }
  .row .t { font-family: var(--mono); font-size: 12px; color: var(--muted); padding-top: 2px; font-variant-numeric: tabular-nums; }
  .rowBody { display: grid; gap: 5px; min-width: 0; }
  .rowHead { display: flex; align-items: center; gap: 8px; }
  .id { font-size: 13.5px; font-weight: 700; }
  .tag { font-family: var(--mono); font-size: 10.5px; letter-spacing: .04em; padding: 2px 6px; border-radius: 2px; border: 1px solid var(--line); color: var(--muted); }
  .tag--card { color: var(--mint); border-color: rgba(111,242,193,.35); }
  .tag--title, .tag--end { color: #fff; border-color: rgba(255,255,255,.3); }
  .vo { font-size: 12.5px; line-height: 1.5; color: var(--muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

  @media (prefers-reduced-motion: reduce) { * { animation-duration: .001ms !important; transition: none !important; } }
</style>

<div class="wrap">
  <header>
    <div>
      <p class="eyebrow">${escape(episode.arc)} · animatic</p>
      <h1>${escape(episode.title)}</h1>
    </div>
    <div class="meta">
      <div>runtime<b>${clock(duration)}</b></div>
      <div>beats<b>${episode.beats.length}</b></div>
      <div>captions<b>${cues.length}</b></div>
      <div>live screens<b>${screens.real} of ${screens.total}</b></div>
      <div>timing<b>${timedFrom === "voiceover" ? "rendered VO" : "145 wpm est"}</b></div>
    </div>
  </header>

  <p class="note">
    <b>Nothing is recorded yet.</b> Beats run at ${
      timedFrom === "voiceover" ? "the length of the rendered voiceover" : "a 145 wpm estimate of the voiceover"
    }, captions sit where they will sit, and the cards are the real cards. ${
      screens.real === screens.total
        ? "Every screen is a real still of the page that beat lands on."
        : `${screens.real} of ${screens.total} screens are real stills of the page that beat lands on. The rest sit behind the admin login: add the demo credentials to video/.env and re-run the shots pass to fill them in.`
    } What this preview is for: pacing, caption chunking, and whether a beat is carrying more words than its screen can hold.
  </p>

  <div class="grid">
    <div>
      <div class="stage" id="stage">
        <div class="frame" id="uiFrame">
          <div class="ui">
            <div class="chrome"><i class="dot"></i><i class="dot"></i><i class="dot"></i><span class="url" id="uiUrl">/admin</span></div>
            <div class="uiBody">
              <p class="uiKicker">live capture</p>
              <p class="uiTitle" id="uiTitle">Company Dashboard</p>
              <div class="uiSteps" id="uiSteps"></div>
            </div>
          </div>
        </div>
        <div class="frame" id="shotFrame" hidden>
          <img class="shot" id="shotImg" alt="">
          <span class="shotTag" id="shotTag"></span>
        </div>
        <div class="frame cardHost" id="cardFrame" hidden>${cardMarkup}</div>
        <div class="frame" id="titleFrame" hidden>
          <div class="kit">
            <div class="pad">
              <p class="arc">${escape(episode.arc)}</p>
              <p class="no">E${escape(episode.number ?? "")}</p>
              <p class="t">${escape(episode.title)}</p>
            </div>
            <p class="mark"><i></i>8 Edges</p>
            <div class="rail">${seriesRail}</div>
          </div>
        </div>
        <div class="frame" id="endFrame" hidden>
          <div class="kit end">
            <div>
              <p class="line">One system,<br>one edge a day.</p>
              <p class="cta">${episode.endCard === "talk-to-e8" ? "Talk to Edge8." : "Full series in the playlist"}</p>
              <p class="sig">Built by Edge8.</p>
            </div>
          </div>
        </div>
        <div class="guides" id="guides" hidden></div>
        <div class="caption" id="caption"></div>
      </div>

      <div class="transport">
        <button class="play" id="play" aria-label="Play">▶</button>
        <input class="scrub" id="scrub" type="range" min="0" max="${duration.toFixed(2)}" step="0.05" value="0" aria-label="Scrub">
        <span class="time"><b id="at">0:00</b> / ${clock(duration)}</span>
        <button class="toggle" id="guideBtn" aria-pressed="false">Safe area</button>
      </div>

      <div class="now">
        <div class="nowHead"><h2 id="nowId">hook-strategy</h2><span class="t" id="nowTime"></span></div>
        <div class="steps" id="nowSteps"></div>
        <p class="nowVo" id="nowVo"></p>
      </div>
    </div>

    <div class="rail" id="railList">
      <div class="railHead">Beats</div>
      ${railRows}
    </div>
  </div>
</div>

<script>
const FRAMES = ${JSON.stringify(frames)};
const CUES = ${JSON.stringify(cues)};
const SHOTS = ${JSON.stringify(shots)};
const DURATION = ${duration.toFixed(3)};

const stage = document.getElementById('stage');
const els = {
  ui: document.getElementById('uiFrame'),
  card: document.getElementById('cardFrame'),
  shot: document.getElementById('shotFrame'),
  title: document.getElementById('titleFrame'),
  end: document.getElementById('endFrame'),
};
const rows = [...document.querySelectorAll('.row')];

function fit() {
  stage.style.setProperty('--k', stage.clientWidth / 1920);
}
addEventListener('resize', fit);
fit();

let t = 0;
let playing = false;
let last = 0;
let shown = -1;

function clock(s) {
  return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
}

function paint() {
  const i = Math.max(0, FRAMES.findLastIndex(f => t >= f.start));
  const frame = FRAMES[i];

  if (i !== shown) {
    shown = i;
    for (const key of Object.keys(els)) els[key].hidden = true;
    const kind = frame.kind === 'card' ? 'card' : frame.kind;
    els[kind].hidden = false;

    if (kind === 'card') {
      document.querySelectorAll('.card').forEach(c => {
        c.hidden = c.dataset.card !== frame.card;
        // Restart the card's own entrance animation on every entry.
        if (!c.hidden) { const clone = c.cloneNode(true); c.replaceWith(clone); clone.hidden = false; }
      });
    }
    if (kind === 'ui') {
      document.getElementById('uiUrl').textContent = frame.route || 'live screen';
      document.getElementById('uiTitle').textContent = frame.id.replace(/-/g, ' ');
      document.getElementById('uiSteps').innerHTML = frame.directions.map(d => '<span>' + d + '</span>').join('');
    }

    document.getElementById('nowId').textContent = frame.id;
    document.getElementById('nowTime').textContent = clock(frame.start) + ' to ' + clock(frame.end) +
      (frame.spoken ? '  ·  ' + frame.spoken.toFixed(1) + 's voice, ' + frame.hold.toFixed(1) + 's hold' : '');
    document.getElementById('nowSteps').innerHTML = frame.directions.map(d => '<span>' + d + '</span>').join('');
    document.getElementById('nowVo').textContent = frame.vo || '';
    rows.forEach(r => r.dataset.current = String(Number(r.dataset.frame) === i));
    const current = rows[i];
    if (current) current.scrollIntoView({ block: 'nearest' });
  }

  if (frame.kind === 'shot') {
    // A beat that crosses two screens holds each for an equal share of it.
    const stills = SHOTS[frame.id];
    const through = (t - frame.start) / Math.max(0.001, frame.end - frame.start);
    const i2 = Math.min(stills.length - 1, Math.max(0, Math.floor(through * stills.length)));
    const key = frame.id + ':' + i2;
    const img = document.getElementById('shotImg');
    if (img.dataset.key !== key) {
      img.dataset.key = key;
      img.src = stills[i2].src;
      document.getElementById('shotTag').textContent = stills[i2].route;
    }
  }

  const cue = CUES.find(c => t >= c.start && t < c.end);
  const caption = document.getElementById('caption');
  const next = cue ? cue.lines.join('\\n') : '';
  if (caption.dataset.text !== next) {
    caption.dataset.text = next;
    caption.innerHTML = cue ? cue.lines.map(l => '<span>' + l.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</span>').join('') : '';
  }

  document.getElementById('at').textContent = clock(t);
  document.getElementById('scrub').value = t;
}

function tick(now) {
  if (!playing) return;
  t += (now - last) / 1000;
  last = now;
  if (t >= DURATION) { t = DURATION; setPlaying(false); }
  paint();
  if (playing) requestAnimationFrame(tick);
}

function setPlaying(on) {
  playing = on;
  document.getElementById('play').textContent = on ? '❚❚' : '▶';
  document.getElementById('play').setAttribute('aria-label', on ? 'Pause' : 'Play');
  if (on) { last = performance.now(); requestAnimationFrame(tick); }
}

document.getElementById('play').addEventListener('click', () => {
  if (t >= DURATION) t = 0;
  setPlaying(!playing);
});
document.getElementById('scrub').addEventListener('input', e => { t = Number(e.target.value); paint(); });
document.getElementById('guideBtn').addEventListener('click', e => {
  const on = document.getElementById('guides').hasAttribute('hidden');
  document.getElementById('guides').toggleAttribute('hidden', !on);
  e.currentTarget.setAttribute('aria-pressed', String(on));
});
rows.forEach(row => row.addEventListener('click', () => { t = Number(row.dataset.seek); paint(); }));
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') { e.preventDefault(); if (t >= DURATION) t = 0; setPlaying(!playing); }
  if (e.code === 'ArrowRight') { t = Math.min(DURATION, t + 5); paint(); }
  if (e.code === 'ArrowLeft') { t = Math.max(0, t - 5); paint(); }
});

paint();
</script>
`;
}

const slug = episodeSlug();
const shots = loadShots(slug);
const data = build(slug, shots);
const html = page(data, loadCards(), shots);
const file = argOf("--out", path.join(episodeDir(slug), "previz.html"));
fs.writeFileSync(file, html, "utf8");
console.log(`${clock(data.duration)} · ${data.frames.length} frames · ${data.cues.length} cues → ${file}`);
