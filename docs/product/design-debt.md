# Design debt: audit and backlog (4 Sep 2026)

Measured on this repo's `main` snapshot `67a447bb` (a filtered mirror of
`edge8-web` at `f62ddfed`), using `~/code-projects/edge8-web` as the
reference: `docs/product/design-system.md` is the contract,
`app/styles/tokens.css` the token file, `scripts/design/` the guardrails and
converters, `scripts/check-design-ratchet.mjs` the inline-style and
page-prefix ratchet. The scripts here are byte-identical to the reference's
`main` (the mirror copies them); what differs is their exemption lists and
ceilings, and those are the debt.

**Mirror warning.** `main` here is force-replaced on every upstream push
(`.github/workflows/mirror-to-8-edges-fork.yml` in edge8-web; six pushes in
the hour this audit ran). The mirror excludes `.github/`, and GitHub Actions
was disabled on this repo until backlog item 1. The backlog PRs merge into
`ds/debt-base2` (pinned to `67a447bb`) and their branches are kept, so the
diffs survive a resync and can be replayed onto `main` or upstream. An
earlier round on snapshot `e964a787` (`ds/debt-base`, PRs #14 and #15) was
overtaken by upstream's own fixes and is superseded by this page.

## Commands used

```bash
# 1. inline style blocks, raw count and by area; styled vs layout-only; unmarked
grep -rho 'style={{' app components lib --include='*.tsx' | wc -l
node scripts/design/check-tokens.mjs --list \
  | grep -E '^(app|components|lib)/' \
  | awk -F: '{split($1,p,"/"); a=(p[1]=="app"?"app/"p[2]:p[1]); s=($0~/styled inline/)?"styled":"layout"; c[a" "s]++} END{for(k in c) print c[k],k}'
grep -rn 'style={{' app components --include='*.tsx' | grep -v layout-ok \
  | awk -F: '{split($1,p,"/"); a=(p[1]=="app"?"app/"p[2]:p[1]); c[a]++} END{for(k in c) print c[k],k}'
# 2. class prefixes per stylesheet (first dash segment of each selector) with rule counts
for f in $(find app components -name '*.css'); do echo "$f"; grep -oE '^\s*\.[a-zA-Z_][a-zA-Z0-9_-]*' "$f" \
  | sed -E 's/^\s*\.//; s/^([a-zA-Z0-9_]+)-.*/\1-/' | sort | uniq -c | sort -rn; done
node scripts/check-design-ratchet.mjs
# 3. raw colours outside the token file and palette, by file (modules, style blocks, email builders included)
grep -rnE '(^|[^\w&-])(#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\()' app components lib \
  --include='*.css' --include='*.tsx' --include='*.ts' --include='*.js' \
  | grep -vE 'tokens.css|palette.json|url\(|unicode-range|PRs? #|colour-ok' \
  | awk -F: '{c[$1]++} END{for(f in c) print c[f],f}' | sort -rn
# 4, 5, and page-level maxWidth: the guardrail's own warnings
node scripts/design/check-assets.mjs --warn-only
# 6. components with their own <style> block; stylesheets defining custom properties
grep -rln '<style\|styled-jsx\|__html: [A-Z_]*STYLES' app components --include='*.tsx'
grep -rn '^\s*--[a-zA-Z0-9-]*:' app components --include='*.css' | grep -v tokens.css
# 7. custom properties used but never defined (definitions may share a line, so match anywhere), and fallbacks
comm -23 <(grep -rhoE 'var\(--[a-zA-Z0-9-]+' app components lib --include='*.css' --include='*.tsx' --include='*.ts' | sed 's/var(//' | sort -u) \
         <(grep -rhoE '(^|[\s{;"])--[a-zA-Z0-9-]+\s*:' app components lib --include='*.css' --include='*.tsx' --include='*.ts' | grep -oE '\-\-[a-zA-Z0-9-]+' | sort -u)
grep -rnE 'var\(--[a-zA-Z0-9-]+,\s*[^)]+\)' app components lib --include='*.css' --include='*.tsx' --include='*.ts' | grep -v tokens.css
# 8. colour lists in TS and colour columns in the schema
grep -rnE '(COLOR|COLOUR)[A-Za-z_]*\s*[:=]' lib app components --include='*.ts' --include='*.tsx'
grep -nE '"colou?r" "text"' supabase/01-schema.sql
# 9. overlapping component classes
grep -oE '^\.admin-(progress|meter|avatar|avatarbtn|box|pill|chip|badge|tag)[a-z0-9-]*' app/admin/admin.css | sort -u
# 10. painters outside the browser and whether they read the palette module
grep -rlE 'ImageResponse|resend|<html' lib app/api --include='*.ts' --include='*.js' \
  | while read f; do echo "$f hex=$(grep -cE '#[0-9a-fA-F]{3,8}\b' "$f") palette=$(grep -c design/palette "$f")"; done
# region
grep -A2 '"regions"' vercel.json
```

## Measurements (before, snapshot `67a447bb`)

### 1. Inline styles

Raw `style={{` count across `app/`, `components/`, `lib/`: **206** in 93
files. The guardrail (which exempts OG images and icons) sees **175**:
**15 styled** and **160 layout-only**. 13 of the 15 styled ones are
runtime token variables already marked `layout-ok` (epic, channel, stage,
series colours); two are not. **145 carry no `layout-ok` marker.**

| Area | Styled | Layout-only | Unmarked |
|---|---|---|---|
| `app/admin` | 9 | 40 | 41 |
| `app/portal` | 0 | 24 | 22 |
| `app/team` | 1 | 25 | 13 |
| `components/` | 3 | 13 | 13 |
| `app/the-vietnam-experience` | 1 | 17 | 18 |
| `app/vietnam-adventure-flight-info` | 0 | 11 | 11 |
| `app/page.tsx` | 0 | 8 | 8 |
| `app/case-studies` | 1 | 7 | 8 |
| `app/error.tsx`, `app/not-found.tsx` | 0 | 4 | 4 |
| `app/careers`, `app/contact`, `app/vietnam-adventure-info-form` | 0 | 4 | 2 |
| `app/workflows` | 0 | 7 | 0 |

### 2. Class prefixes per stylesheet

| Stylesheet | Prefixes | Rules | Verdict |
|---|---|---|---|
| `app/admin/admin.css` | `admin-` | 1551 | namespace |
| `app/styles/utilities.css` | `u-` | 127 | namespace |
| `app/globals.css` | **125 distinct** (`xp-` 103, `rt-` 94, `blog-` 58, `post-` 53, `contact-` 50, `cs-` 42, `careers-` 36, `hero-` 33 …) beside `site-` (66) | 1253 | debt; the ratchet counts 319 page-prefixed rules |
| `app/workflows/workflows.css` | `wf-` 219, `app-` 34, `plib-` 10, `rnw-` 1 | 264 | debt (private prefixes) |
| `app/8-edges-app/eight-edges-app.css` | `e8a-` | 78 | debt (private prefix) |
| `app/plans/plans.css` | `brief-` | 20 | debt (private prefix) |
| three `.module.css` files | CSS-module camelCase | 89 classes | scoped; tokenised upstream |

No component carries an embedded `<style>` block any more (upstream
PR #1021 folded the last three into `admin.css`).

### 3. Raw colours outside `tokens.css` / `palette.json`

**31 in 6 files**, all API email routes the guardrail exempts with
`^app/api/`: `careers/apply` 9, `vietnam-adventure-flight-info` 9,
`contact` 5, `vietnam-adventure-info-form` 5, `my-retreat/access` 3,
`cron/ideas-digest` 1. Every value is an off-brand grey (`#666`, `#999`,
`#111`, `#fff`). The `lib/` email builders and `lib/ogRender.js` already
read `lib/design/palette.json` (upstream PR #1020).

### 4 and 5. Type and spacing scales

Reopened by the folded stylesheets: **1** font size off the type scale
(`workflows.css:796`, 17px) and **41** spacing declarations across 7
values (9px x14, 3px x7, 11px x6, 7px x5, 13px x4, 15px x3 …), 38 of
them in the `admin-backlog-*` / `admin-roadmap-*` rules at the end of
`admin.css` and 3 in `workflows.css`.

### Page-level `maxWidth`

0. Fixed upstream (PR #1021).

### 6. Private styles

None. Embedded style blocks are gone; `workflows.css` no longer defines
colour aliases. `globals.css` and `workflows.css` re-assign `--link` on
dark sections, which is theming, not an alias.

### 7. Custom properties

None undefined. (`--admin-chart-` is a template prefix in `DonutChart.tsx`;
`--pri-*` are set on the backlog root classes; a naive line-start scan
reports token names that share a line in `tokens.css`, hence the command
above matches anywhere.) Fallbacks: `var(--font-body, inherit)` x2 and
`var(--n, 2)` in `admin.css` are legitimate defaults.

### 8. Colours in data

TS lists are on tokens: `EPIC_COLORS` (`lib/boards/types.ts`),
`lib/admin/stageColors.ts`, `ROLE_COLORS`, `marketing-calendar.ts` channel
accents, `OnboardingCycleBoard` stage colours all hold `var(--admin-*)`
strings. The schema has two `text` colour columns,
`company_os.tags.color` and `company_os.epics.color`. This fork has no
database attached, so rows could not be inspected; the writers use the
token lists above and `epicColor()` falls back to the first token for
anything unknown.

### 9. Overlapping component classes

| Pair | Where | Consumers |
|---|---|---|
| `.admin-campaign-progress-track/-fill` vs `.admin-meter/-fill` | `admin.css:2061-2064`, `:4858` | `CampaignsView.tsx` |
| `.admin-avatarbtn`, `--lg` vs `.admin-avatar--md/--lg` | `admin.css:90-103`, `:4954` | three sidebars |
| `.admin-tag-xs`, `--accent`, `--warn` vs `.admin-tag-pill` / `.admin-badge` | `admin.css:4891-4893` | `InterviewRounds.tsx` |

Avatar sizes, meter variants and box/box-pad were merged upstream (PR #1019).

### 10. Painters outside the browser

`lib/ogRender.js` and the eight `lib/` email builders read
`lib/design/palette.json` (re-exported by `palette.ts`); Satori's one
`rgba()` carries `colour-ok`. The six API email routes in §3 do not.

### Region

`vercel.json` pins functions to `sin1`. This fork has no Supabase project;
the README tells the operator to create one "nearest the operator", so
`regions` must be set to match it then (`ap-southeast-1` → `sin1`,
`ap-south-1` → `bom1`, `ap-northeast-1` → `hnd1`, `us-west-2` → `pdx1`).

## Backlog

One PR per item, into `ds/debt-base2`. The PR column fills in as they merge.

| # | What | Where | Count | Fix | PR |
|---|---|---|---|---|---|
| 1 | Guardrails run only locally; styled ceiling 11 above the count | no `.github/`, `check-tokens.mjs` | ceiling 26, count 15 | `design-guardrails.yml` (check-tokens, check-assets, ratchet, crons); Actions enabled; ceiling 15 | #17 |
| 2 | API email routes carry their own hex | 6 routes under `app/api` | 31 | Read `lib/design/palette`; drop the `^app/api/` exemption | #18 |
| 3 | Type and spacing values off the scales | `admin.css` (folded backlog rules), `workflows.css` | 1 + 41 | Snap to the nearest step | #19 |
| 4 | Page-prefixed selectors on the public site | `globals.css` | 125 prefixes, 1253 rules, 319 ratcheted | Rename every class by exact name to `site-<component>-*`, update consumers, ratchet to 0 | #20 |
| 5 | Private stylesheets with their own prefixes | `workflows.css`, `eight-edges-app.css`, `plans.css` | `wf-` 219, `app-` 34, `plib-` 10, `rnw-` 1, `e8a-` 78, `brief-` 20 | Rename by exact class name to `site-wf-*`, `site-app-*`, `site-plib-*`, `site-rnw-*`, `site-e8a-*`, `site-brief-*` | #21 |
| 6 | Inline styles: core record pages | contacts, team member, application, deal, event, sales call, campaign, boards | 22 unmarked | Converters, then component classes on `admin.css` + patterns | #22 |
| 7 | Inline styles: admin core and shared components | login, skeletons, not-found, patterns, `components/*` | 19 unmarked | Converters, then hand-finish; layouts load `utilities.css` where missing | #23 |
| 8 | Inline styles: revenue | cockpit, deals board, marketing | 6 unmarked | Converters, then `admin-section-card--flush` | #24 |
| 9 | Inline styles: talent, operations, edges | applications, surveys, analytics, client roadmaps | 5 unmarked | Converters, then a `--tag` variable on the role tag (fixes an invalid `var()1f` background) | #25 |
| 10 | Inline styles: team intranet and client portal | `app/team`, `app/portal` | 35 unmarked | Converters, then `admin-card-foot`, `admin-overview-text`, `admin-details-summary` | #26 |
| 11 | Inline styles: public pages | home, case studies, Vietnam experience, flight info, error pages | 51 unmarked (2 styled) | `site-inline.pl`, then `site-*` classes in `globals.css` | #27 |
| 12 | Overlapping component classes | `admin.css` | 3 pairs, 11 rules, 5 consumers | Campaign progress on `admin-meter`; avatar button on `admin-avatar`; `admin-tag-xs` on `admin-tag-pill` | #28 |
| 13 | Colour columns in the database | `company_os.tags.color`, `company_os.epics.color` | no rows to inspect | Writers verified on token lists; recorded here; nothing to migrate in this fork | #29 |

## After (close-out, 4 Sep 2026)

Measured on `ds/debt-base2` after backlog item 12, with the same commands.

| Measure | Before (`67a447bb`) | After |
|---|---|---|
| `style={{` blocks in `app/`, `components/`, `lib/` | 206 (93 files) | 69 (39 files) |
| Guardrail view: styled / layout-only | 15 / 160 | 13 / 34 |
| Inline styles without a `layout-ok` marker | 145 | **0** |
| Styled-inline ceiling | 26 | 13 (the real count; all runtime token variables) |
| Inline-layout ratchet baseline | 6 files stale | empty (0 files) |
| Design ratchet: inline styles | 206 in 93 files | 78 in 44 files, every one `layout-ok` |
| Design ratchet: page-prefixed selectors in `globals.css` | 319 | 44, all `post-*` (content-bound) |
| Prefixes in `globals.css` | 125 + `site-` | `site-` (1192 rules) plus the 10 content-bound `post-*` / `btn-primary` classes |
| Prefixes in `workflows.css` / `eight-edges-app.css` / `plans.css` | `wf-` `app-` `plib-` `rnw-` / `e8a-` / `brief-` | `site-` only |
| Prefixes in `admin.css` / `utilities.css` | `admin-` / `u-` | `admin-` (1502 rules, 1022 selectors) / `u-` |
| Raw colours outside `tokens.css` / `palette.json` | 31 (6 API email routes) | **0** |
| Painters (OG, email) not reading the palette module | 6 | **0** |
| Values off the type / spacing scales | 1 / 41 | **0 / 0** |
| Page-level `maxWidth` off the sanctioned widths | 0 | 0 |
| Components with their own `<style>` block | 0 | 0 |
| Private colour aliases | 0 | 0 |
| Overlapping component classes | 3 pairs | **0** (9 rules removed, 6 modifiers added) |
| CI | none (Actions disabled, no `.github/`) | `design-guardrails.yml`: check-tokens, check-assets, ratchet, crons on every PR |

Class renames were done by exact class name generated from each
stylesheet, never by prefix: 697 in `globals.css`, 252 across the three
private stylesheets, consumers updated in 114 files. After every later PR
the tree was swept for the old names; the sweep after item 10 found eight
files building class names in template literals (`wf-actor-${…}`,
`dept-${…}`) that an exact-name rewrite cannot see, fixed in item 11.

**Exceptions, recorded on purpose.** `post-body`, `post-body-inner`,
`post-content`, `post-divider`, `post-figure`, `fig-source`, `fig-note`,
`faq-item`, `btn-primary` and the `idea-in-brief` block stay unrenamed:
they can appear inside article HTML stored in the database (ingested from
`blog/`, allowed by `lib/post-html-schema.ts`), so renaming them is a
content migration this fork cannot run. They are the 44 page-prefixed
rules the ratchet still counts, and its baseline holds them there.

**What stays inline, and why.** 78 `style={{}}` blocks remain, every one
data-driven and marked: progress and share widths, runtime stage / epic /
channel / series colours (token variables), the role-tag `--tag` variable,
slider offsets, prop-driven aspect ratios and sizes, the pattern library's
type-ramp demo and swatch chips, hidden inputs.

**Screenshots against production.** Not possible: this fork has no Vercel
project or database. Every PR was built locally with `next build` and
passed the four CI jobs.
