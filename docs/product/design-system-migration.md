# Design system migration: before and after

This repo is a filtered mirror of `edge8-web`, and it inherited that repo's
design-system migration (upstream PRs #1004 to #1014, summarised at the end
of this page). This page records what the 8 Edges design system looked like
in **this** repo when it was cloned on 4 Sep 2026, what was still open, and
the numbers after each PR here. The sequence follows the reference repo
(`pr-hub-company-os`, PRs #21 to #32) and `docs/product/design-system.md`.

**Mirror warning.** `main` here is replaced by a fresh single-commit snapshot
every time `edge8-web` pushes to its `main`
(`.github/workflows/mirror-to-8-edges-fork.yml` upstream, `git push --force`).
Anything merged here is overwritten at the next sync unless it also lands
upstream. The PR branches for this migration are kept, not deleted, so the
diffs survive a resync and can be replayed.

## How to measure

```bash
# inline style blocks in components
grep -rho 'style={{' app components lib --include='*.tsx' | wc -l
# class prefixes in the admin stylesheet (first dash-separated segment)
grep -o '^\s*\.[a-zA-Z][a-zA-Z0-9]*-' app/admin/admin.css | tr -d ' .' | sort | uniq -c | sort -rn
# raw colours in stylesheets and components
grep -cE '#[0-9a-fA-F]{3,8}\b' app/admin/admin.css app/globals.css
grep -rEo '#[0-9a-fA-F]{3,8}\b' app components lib --include='*.tsx' --include='*.ts' | wc -l
# styled and layout-only inline counts, with the guardrail's exemptions applied
npm run check:tokens
# per-file inline-layout ratchet
npm run check:design
```

## Baseline in this repo (snapshot `fb0ba17b`, 4 Sep 2026)

| Measure | As cloned |
|---|---|
| `style={{` blocks in `app/`, `components/`, `lib/` | 658 (133 files) |
| of which set colour / border / font / radius / shadow ("styled inline") | 192 (guardrail ceiling was 234) |
| of which layout-only (flex, gap, margin, width) | 444 |
| Class prefixes in `app/admin/admin.css` | 1 (`admin-`); the 118 `.u-*` utilities live in `app/styles/utilities.css` |
| Distinct selectors in `app/admin/admin.css` | 1007 |
| Raw hex colours in `app/admin/admin.css` / `app/globals.css` | 0 / 0 |
| `rgba()` in `admin.css` / `globals.css` | 0 / 0 |
| Raw hex colours in `.tsx` / `.ts` | 68 lines in 14 files, all exempted by the guardrail on purpose (OG images, icons, email HTML) |
| Lines with a raw colour outside a token file (check-tokens scan) | 0 |
| Per-feature prefixes hiding in embedded `<style>` strings | 3: `cbe-` (27 classes, admin client-roadmaps editor), `cbp-` (24, portal roadmap), `tcr-` (13, team roadmap) |
| Inline-layout ratchet baseline | stale: 6 files already below their allowance |

Inline styles by surface as cloned, and how many of those lack a
`layout-ok` marker:

| Surface | `style={{` | unmarked |
|---|---|---|
| `app/admin` | 65 | 44 |
| `app/team` | 30 | 14 |
| `app/portal` | 25 | 23 |
| `components/` | 21 | 13 |
| `app/workflows` (public workflow library) | 227 | outside the OS surfaces |
| other public pages | 290 | outside the OS surfaces |

So the foundation (tokens, palette, utilities, guardrail, pattern library)
and the stylesheet rename were already in place. What was still open in this
repo: the three embedded per-feature stylesheets, 94 unmarked inline styles
across the OS surfaces, a stale ratchet baseline, and a styled ceiling 42
above the real count.

## Vercel region

`vercel.json` pins functions to `sin1` (Singapore). This repo is not yet
linked to a Vercel project or a Supabase project of its own; the README
tells the operator to create the database "nearest the operator". When that
happens, `regions` must match the Supabase region (`ap-southeast-1` is
`sin1`; `ap-south-1` is `bom1`; `ap-northeast-1` is `hnd1`; `us-west-2` is
`pdx1`). Crons and redirects stay as they are.

## Sequence in this repo

1. Measure (this document) and the region check.
2. Foundation: already present and identical to the reference except for one
   extra brand primitive (`--color-violet`, used by the public workflow
   library) mirrored in `lib/design/palette.ts`, and the utilities split into
   their own file. No change needed.
3. Rename: fold the three embedded stylesheets into `admin.css` as
   `admin-<component>-*` by exact class name, so the stylesheet is the only
   place a class is defined.
4. Per surface: run `inline-to-classes.pl` then `smart-inline.pl`, fix any
   duplicate `className` (TS17001), hand-finish leftovers as component
   classes. Data-driven values stay inline with a `/* layout-ok */` comment.
5. After each surface: refresh the inline-layout baseline, lower the styled
   ceiling, build, merge.
6. Close out: the stylesheet has only `.admin-*` (and `utilities.css` only
   `.u-*`); the after numbers land on this page.

## What stays inline, and why

Only values the component cannot know at build time: progress-bar widths,
stage / epic / series / channel colours (already token variables chosen at
runtime), avatar sizes from props, the pattern library's type-ramp demo, and
hidden file inputs. Each carries a `/* layout-ok: reason */` comment. The
public workflow library under `app/workflows` and the other marketing pages
were outside the five OS surfaces upstream and keep their layout-only inline
styles; they contain no raw colour. Upstream tracks them in
`docs/product/design-debt.md`.

## Inherited from edge8-web

Numbers measured upstream on `main` before the design system was applied
there, and after its close-out PR (#1013), for reference.

| Measure | Before | After |
|---|---|---|
| `style={{` blocks in `app/`, `components/`, `lib/` | 2756 (359 files) | 822 (149 files) |
| styled inline | 410 | 234 |
| layout-only inline | 2324 | 565 |
| Class prefixes in `app/admin/admin.css` | 35 (`admin-` plus 34 per-feature) | 2 (`admin-`, `u-`) |
| Raw hex colours in `admin.css` / `globals.css` | 91 / 76 | 0 / 0 |
| `rgba()` in `admin.css` / `globals.css` | 51 / 141 | 0 / 0 |
| Lines with a raw colour outside a token file | 798 | 0 |

The 34 prefixes folded upstream: `team-` (177), `coach-` (99), `mcr-` (87),
`edges-` (81), `chatw-` (78), `appdet-` (53), `ts-` (41), `lead-` (35),
`gallery-` (32), `sap-` (28), `hire-` (28), `plan-` (23), `idea-` (23),
`phototag-` (18), `ideas-` (17), `pat-` (16), `board-` (13), `portal-` (10),
`loop-` (10), `cg-` (10), `mp-` (8), `goal-` (8), `assume-` (8),
`mycoach-` (7), `deal-` (7), `tp-` (6), `hub-` (6), `goals-` (6),
`staff-` (4), `doc-` (3), `dir-` (3), `book-` (3), `assistant-` (1).
