# Recording rig

Renders a finished 1080p episode from a script file. No human screen-records anything.

Plan: `public/workflows/private/e8/demo-video-series.html`
Brand kit: `public/workflows/private/e8/edge8-video-brand-kit.html`

```
episode file  →  ElevenLabs voiceover  →  Playwright capture  →  cards  →  captions  →  ffmpeg  →  mp4
```

The voiceover is rendered first, on purpose. Every beat holds for exactly as long as its
audio runs, so screen and voice line up at every beat boundary and there is no editing pass
to keep them together. Audio is the clock, the screen follows it.

## Install

```bash
cd video && npm install && npm run install:browser
```

ffmpeg and ffprobe have to be on PATH:

```bash
winget install Gyan.FFmpeg
```

Then copy `.env.example` to `.env` and fill it in. `.env` is gitignored, keep it that way.

## Render an episode

```bash
node scripts/render.mjs e01-company-dashboard
```

Six steps, each runnable on its own:

| Step | Command | Writes |
| --- | --- | --- |
| 1 · manifest | `npx playwright test specs/manifest.spec.ts` | `out/<slug>/episode.json` |
| 2 · voiceover | `node scripts/voice.mjs render <slug>` | `out/<slug>/vo/*.mp3`, `vo.json` |
| 3 · capture | `npx playwright test specs/episode.spec.ts` | `out/<slug>/capture.webm`, `beats.json` |
| 4 · cards | `npx playwright test specs/cards.spec.ts` | `out/<slug>/cards/*.png` |
| 5 · captions and QC | `node scripts/captions.mjs <slug>` then `qc.mjs` | `out/<slug>/captions.ass` |
| 6 · assembly | `node scripts/assemble.mjs <slug>` | `out/<slug>/<slug>.mp4` |

`render.mjs` takes `--skip-vo`, `--skip-capture`, and `--skip-cards` so a re-record does not
re-bill the voiceover, and a caption tweak does not re-record the screen. `assemble.mjs`
takes `--dry-run` to print the ffmpeg command instead of running it.

Re-running the voiceover only re-bills the beats whose words actually changed. The rest come
from cache, keyed on text plus voice plus settings.

## Preview before you record

An animatic plays the whole episode before a frame of it exists: beats at their real length,
captions where they will sit, the real cards, and a real still of every screen the script
lands on.

```bash
E8_BASE_URL=https://www.edge8.ai npx playwright test specs/shots.spec.ts
node scripts/previz.mjs eight-edges-intro
```

The first command takes one still per route the episode visits, using the same zoom and the
same blur selectors as the real capture. The second builds a single self-contained
`out/<slug>/previz.html` with the stills inlined. Routes behind the admin login need
`E8_DEMO_EMAIL` and `E8_DEMO_PASSWORD` in `.env`; without them those beats fall back to a
labelled placeholder carrying the route and the stage directions, and the page says which
ones are missing.

Timings come from the rendered voiceover when it exists and a 145 wpm estimate before that.
This is where a script that runs long shows up, at no cost.

## Writing an episode

One file in `episodes/`, registered in `episodes/index.ts`. A beat is one paragraph of
voiceover plus what the screen does while it is read.

```ts
{
  id: "revenue-spine",
  vo: "This is the Office of Revenue. Every contact, every company, in one place.",
  hold: 0.4,                      // seconds of held screen after the voice stops
  action: async (page, s) => {
    await s.goto("/admin/revenue/companies");
    await s.hold(1.2);
    await s.scroll(600, 2600);    // pixels, milliseconds
  },
}
```

Stage directions available on `s`: `goto`, `hold`, `click`, `hover`, `scroll`, `pushIn`,
`pullOut`, `drag`, `type`, `moveTo`, `card`. They are all deliberately slow. A cursor that
jumps and a page that snaps both read as a machine, and the point of these films is that a
person could be doing this.

Two things the rig handles that Playwright does not:

- **A visible cursor.** Playwright's video has no pointer, so `lib/stage.ts` draws one and
  lets it follow the real mouse events.
- **A beat that fails.** A missing selector holds the frame, logs a warning into
  `beats.json`, and keeps rolling. QC fails the episode before assembly. A three minute take
  is not thrown away over one renamed class.

## The voice

**Brian**, `eleven_multilingual_v2`, stability 0.45, similarity 0.8, speed 1.0.

American, mid-range, unhurried, reads a declarative sentence without selling it. The viewer
is a CEO being told something true, so the voice has to sound like a colleague rather than a
trailer. Set once in `.env` and kept for the whole series: one voice across seventeen
episodes is most of what makes them feel like a series.

Hear it against the alternates before committing. This is cheap now and expensive after six
episodes are cut:

```bash
node scripts/voice.mjs audition
```

Renders the same two lines through Brian, Chris, Daniel, George, Sarah, and Jessica into
`out/_audition/`. Listen on a phone speaker, not headphones, because that is where this gets
watched. Voices resolve by name against your own ElevenLabs library, so the pick survives an
id change; `node scripts/voice.mjs list` prints what the account actually has.

## Frame, zoom, captions

- 1920 x 1080, 30fps, H.264 crf 18, AAC 192k. 16:9 for YouTube and the LinkedIn feed.
- Browser zoom 1.4, from the brand kit. The capture renders at 1371 CSS pixels with a
  matching device scale factor, so the video is real pixels rather than an upscale. A
  dashboard at native zoom is unreadable at 380px wide, which is the size that matters.
- Captions burn in as ASS, not SRT: SRT carries no styling, and the 86% scrim and the 160px
  lift off the base are the two things that make a caption survive a muted autoplay.
- The title card is cut in at the first beat boundary, never at 0:00. Episodes open on the
  UI mid-action.

Cards are screenshots of the brand kit page at exact frame size, not a second drawing of it.
Restyle the kit and the cards follow.

## QC

`scripts/qc.mjs` runs before assembly and fails the episode on: an em dash anywhere in a
caption or a script, "Edge8" in caps, a caption over two lines, a beat whose action threw, a
beat with words but no audio, and a missing card.

It cannot check the one that matters most. **No client data on screen, names blurred where
the script calls for it** stays a human read of the finished file.

## Before the first real record

- **Demo tenant.** The rig points wherever `E8_BASE_URL` and the demo login point. Until the
  seeded tenant exists it will record live company data, which no episode can ship.
- **Blur selectors.** Each episode has a `privacy` array of CSS selectors, blurred for the
  whole take. They are empty until there are real pages to point them at.
- **Manrope SemiBold.** libass cannot read the site's variable woff2, so burn-in falls back
  to the static Manrope in `public/fonts`, which tops out at weight 500 against a specified
  600. Drop a `Manrope-SemiBold.ttf` into `video/assets/fonts/` and assembly uses it.
- **Settle the pilot.** Record E01 first and look at zoom, caption legibility, and pacing on
  a phone before batch recording an arc. Getting it wrong later means re-recording six
  episodes, not one.
