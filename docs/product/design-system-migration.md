# Design system migration: before and after (4 Sep 2026)

Numbers measured on `main` before the 8 Edges design system was applied,
following the sequence used in the reference repo (`pr-hub-company-os`, PRs
#21 to #32), and again after the close-out PR. The migration is complete;
the guardrails hold the after numbers as ceilings.

## How to measure

```bash
# inline style blocks in components
grep -rho 'style={{' app components lib --include='*.tsx' | wc -l
# class prefixes in the admin stylesheet (first dash-separated segment)
grep -o '^\s*\.[a-zA-Z][a-zA-Z0-9]*-' app/admin/admin.css | tr -d ' .' | sort | uniq -c | sort -rn
# raw colours in stylesheets and components
grep -cE '#[0-9a-fA-F]{3,8}\b' app/admin/admin.css app/globals.css
grep -rEo '#[0-9a-fA-F]{3,8}\b' app components lib --include='*.tsx' --include='*.ts' | wc -l
```

Once `scripts/design/check-tokens.mjs` lands, `npm run check:tokens` reports
the styled and layout-only inline counts directly.

## Baseline

| Measure | Before | After |
|---|---|---|
| `style={{` blocks in `app/`, `components/`, `lib/` | 2756 (359 files) | 214 (93 files) after the debt backlog (#1015 to #1024); 822 after the surface passes |
| of which set colour / border / font / radius / shadow ("styled inline") | 410 | 26, every one data-driven and marked `layout-ok` (runtime stage, epic, series, channel and graph colours, progress widths, avatar sizes, the pattern-library type demo, the stylesheet-free private gate) |
| of which layout-only (flex, gap, margin, width) | 2324 | 165 |
| Class prefixes in `app/admin/admin.css` | 35 (`admin-` plus 34 per-feature) | 1 (`admin-`; `.u-*` moved to `app/styles/utilities.css`) |
| Distinct selectors in `app/admin/admin.css` | 905 | 1163 (component classes replacing inline styles, plus 118 `.u-*` utilities) |
| Raw hex colours in `app/admin/admin.css` | 91 | 0 |
| Raw hex colours in `app/globals.css` | 76 | 0 |
| `rgba()` in `admin.css` / `globals.css` | 51 / 141 | 0 / 0 (`color-mix()` over a token) |
| Raw hex colours in `.tsx` / `.ts` | 531 (67 files) | 0 (brand hex lives in `lib/design/palette.json`; email and OG builders read it) |
| Lines with a raw colour outside a token file (check-tokens scan) | 798 (403 css, 364 tsx, 31 ts) | 0 |

Inline styles by surface, before and after: admin 1324 to 65, team 294 to 30,
portal 271 to 25, shared components 186 to 21, public workflows pages 384
(unchanged, outside the OS surfaces), 8 Edges app 24 (unchanged).

## Per-feature prefixes to fold into `admin-<component>-*`

`team-` (177), `coach-` (99), `mcr-` (87), `edges-` (81), `chatw-` (78),
`appdet-` (53), `ts-` (41), `lead-` (35), `gallery-` (32), `sap-` (28),
`hire-` (28), `plan-` (23), `idea-` (23), `phototag-` (18), `ideas-` (17),
`pat-` (16), `board-` (13), `portal-` (10), `loop-` (10), `cg-` (10),
`mp-` (8), `goal-` (8), `assume-` (8), `mycoach-` (7), `deal-` (7), `tp-` (6),
`hub-` (6), `goals-` (6), `staff-` (4), `doc-` (3), `dir-` (3), `book-` (3),
`assistant-` (1).

## Sequence (all shipped)

1. Measure (this document): PR #1005. Vercel functions pinned to `sin1` beside the database: PR #1004.
2. Foundation: `app/styles/tokens.css`, `lib/design/palette.ts`,
   `scripts/design/check-tokens.mjs` as `prebuild`, `.u-*` utilities and
   component sections in `admin.css`, `docs/product/design-system.md`,
   `/admin/patterns` reading swatches from tokens. No visible change. PR #1006.
3. Rename every per-feature prefix to `admin-<component>-*` by exact class
   name generated from the stylesheet. PR #1007.
4. Per surface: run `inline-to-classes.pl` then `smart-inline.pl`, fix
   duplicate `className` (TS17001), hand-finish leftovers as component
   classes. Data-driven values stay inline with a `/* layout-ok */` comment.
   PRs #1008 (Client Hub and core records), #1009 (admin core and shared
   components), #1010 (Revenue), #1011 (Talent, Operations, Company, Edges,
   Boards), #1012 (team intranet, client portal, public nav).
5. After each surface: refresh the inline-layout baseline, lower the styled
   ceiling, build, screenshot against production, merge.
6. Close out: stylesheet has only `.admin-*` and `.u-*`; this document
   records the after numbers. PR #1013.

## What stays inline, and why

Only values the component cannot know at build time: progress-bar widths,
stage / epic / series / channel colours (already token variables chosen at
runtime), avatar sizes from props, the pattern library's type-ramp demo, and
hidden file inputs. Each carries a `/* layout-ok: reason */` comment. The
`check:tokens` ceiling (234) and the two baselines are set to today's counts,
so they can only go down. The public workflow library under `app/workflows`
and the 8 Edges app page were outside the five OS surfaces and keep their
layout-only inline styles; they contain no raw colour.

## Inline-style floor reached (4 Sep 2026)

The inline-style counts are a floor, not a pending zero. Every remaining
`style={{}}` block is a value no class can express — a colour, width, size or
transform chosen at runtime, or the private unlock gate that renders before any
stylesheet — and each carries a `/* layout-ok: reason */` comment. `check:tokens`
ceilings both counts (24 styled, 56 layout-only) so a plain literal cannot creep
back inline; the wording no longer says "target 0".
