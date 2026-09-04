# Design system migration: before and after

This repo is a filtered mirror of `edge8-web`, and it inherited that repo's
design-system migration (upstream PRs #1004 to #1014, summarised at the end
of this page). This page records what the 8 Edges design system looked like
in **this** repo when it was cloned on 4 Sep 2026, what was still open, and
the numbers after the close-out PR here. The sequence follows the reference
repo (`pr-hub-company-os`, PRs #21 to #32) and `docs/product/design-system.md`.

**Mirror warning.** `main` here is replaced by a fresh single-commit snapshot
every time `edge8-web` pushes to its `main`
(`.github/workflows/mirror-to-8-edges-fork.yml` upstream, `git push --force`).
Anything merged into `main` is overwritten at the next sync. The migration
PRs below therefore merge into `ds/base`, an integration branch pinned to
snapshot `825817a9`, and every PR branch is kept so the diffs survive and can
be replayed onto `main` or upstream.

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

## Before and after in this repo (snapshot `825817a9`, 4 Sep 2026)

| Measure | As cloned | After close-out |
|---|---|---|
| `style={{` blocks in `app/`, `components/`, `lib/` | 438 (109 files) | 358 (76 files) |
| of which set colour / border / font / radius / shadow ("styled inline") | 103 (ceiling 119) | 103 (ceiling 103); none on an OS surface |
| of which layout-only (flex, gap, margin, width) | 313 | 231 |
| Inline styles on the OS surfaces (admin, team, portal, components) | 141, 94 without a `layout-ok` marker | 61, every one data-driven and marked `layout-ok` |
| Class prefixes in `app/admin/admin.css` | 1 (`admin-`) | 1 (`admin-`); `utilities.css` carries only `u-` |
| Per-feature prefixes hiding in embedded `<style>` strings | 3 (`cbe-`, `cbp-`, `tcr-`, 67 classes) | 0 |
| Distinct selectors in `app/admin/admin.css` | 1007 | 1023 |
| Raw hex colours in `admin.css` / `globals.css` | 0 / 0 | 0 / 0 |
| Lines with a raw colour outside a token file (check-tokens scan) | 0 | 0 |
| Inline-layout ratchet baseline | stale (6 files below allowance) | 4 files, 30 occurrences, exact |

Inline styles by surface, before → after (unmarked → unmarked):

| Surface | Before | After |
|---|---|---|
| `app/admin` | 65 (44 unmarked) | 30 (0) |
| `app/team` | 30 (14) | 16 (0) |
| `app/portal` | 25 (23) | 2 (0) |
| `components/` | 21 (13) | 13 (0) |
| `app/workflows` (public workflow library) | 7 | 7, converted upstream |
| other public pages | 290 | 290, outside the OS surfaces |

## PRs in this repo

| PR | Step |
|---|---|
| #6 | Measure: baseline numbers, Vercel region check, mirror warning |
| — | Foundation: nothing to change. Tokens, palette, `check:tokens` as `prebuild`, utilities, pattern library and docs were already present and match the reference (plus `--color-violet` for the workflow library). |
| #7 | Rename: the three embedded stylesheets folded into `admin.css`, 67 classes renamed by exact name to `admin-backlog-editor-*`, `admin-backlog-portal-*`, `admin-roadmap-*` |
| #8 | Surface 1: core record pages (contacts, team member, application, deal, event, sales call, campaign, boards) |
| #9 | Surface 2: admin core (login, skeletons, not-found, pattern library) and `components/*` |
| #10 | Surface 3: revenue cockpit, deals board, marketing dashboard |
| #11 | Surface 4: applications board, survey results, analytics, client roadmaps (also fixes the role-tag background, which appended a hex alpha to a `var()`) |
| #12 | Surface 5: team intranet and client portal |
| #13 | Close out: this page and the status in `design-system.md` |

## Vercel region

`vercel.json` pins functions to `sin1` (Singapore). This repo is not yet
linked to a Vercel project or a Supabase project of its own; the README
tells the operator to create the database "nearest the operator". When that
happens, `regions` must match the Supabase region (`ap-southeast-1` is
`sin1`; `ap-south-1` is `bom1`; `ap-northeast-1` is `hnd1`; `us-west-2` is
`pdx1`). Crons and redirects stay as they are.

## What stays inline, and why

Only values the component cannot know at build time: progress-bar and
speaker-share widths, the role-tag colour (a `--admin-chart-*` token chosen
at runtime and passed as `--tag`), slider offsets, prop-driven aspect ratios,
avatar sizes, the pattern library's type-ramp demo and swatch chips, and
hidden file inputs. Each carries a `/* layout-ok: reason */` comment. The
public workflow library and the other marketing pages were outside the five
OS surfaces upstream and keep their inline styles (the 103 styled ones are
all there); upstream tracks them in `docs/product/design-debt.md`. The
`check:tokens` ceiling (103) and the ratchet baseline are set to today's
counts, so they can only go down.

## Classes added while hand-finishing

All appended to the end of `admin.css` under a per-surface section and
rendered on `/admin/patterns`: `admin-board-tile`, `admin-sprint-ht`,
`admin-stat-value`, `admin-access-code`, `admin-meter-fill--muted`,
`admin-transcript-seg`, `admin-pill--wide`, `admin-section-card--flush`,
`admin-input--min-md`, `admin-hint--pull`, `admin-overview-text`,
`admin-details-summary`, `admin-card-foot`,
`admin-backlog-portal-pill--static`, and `.admin-kanban-role-tag` now reads
`--tag`. One public-site class, `.xp-cover`, joined `globals.css`.

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
