# Design debt: audit and backlog (4 Sep 2026)

Measured on this repo's `main` snapshot `e964a787` (a filtered mirror of
`edge8-web` at `0befc6e2`), using `~/code-projects/edge8-web` as the
reference: `docs/product/design-system.md` is the contract,
`app/styles/tokens.css` the token file, `scripts/design/` the guardrails and
converters, `scripts/check-design-ratchet.mjs` the inline-style and
page-prefix ratchet. The scripts in this repo are byte-identical to the
reference's `main` (the mirror copies them), so nothing needed copying;
their exemption lists are the debt, and the backlog removes them.

**Mirror warning.** `main` here is force-replaced on every upstream push
(`.github/workflows/mirror-to-8-edges-fork.yml` in edge8-web). The mirror
also excludes `.github/`, and GitHub Actions is disabled on this repo. The
backlog PRs therefore merge into `ds/debt-base` (pinned to `e964a787`) and
their branches are kept; the CI workflow is committed so it runs the moment
Actions is enabled or the diffs are replayed upstream.

## Commands used

```bash
# 1. inline style blocks, raw count and by area; styled vs layout-only
grep -rho 'style={{' app components lib --include='*.tsx' | wc -l
node scripts/design/check-tokens.mjs --list \
  | grep -E '^(app|components|lib)/' \
  | awk -F: '{split($1,p,"/"); a=(p[1]=="app"?"app/"p[2]:p[1]); s=($0~/styled inline/)?"styled":"layout"; c[a" "s]++} END{for(k in c) print c[k],k}'
grep -rn 'style={{' app/admin app/team app/portal components --include='*.tsx' | grep -vc layout-ok
# 2. class prefixes per stylesheet (first dash segment of each selector) with rule counts
for f in $(find app components -name '*.css'); do echo "$f"; grep -oE '^\s*\.[a-zA-Z_][a-zA-Z0-9_-]*' "$f" \
  | sed -E 's/^\s*\.//; s/^([a-zA-Z0-9_]+)-.*/\1-/' | sort | uniq -c | sort -rn; done
node scripts/check-design-ratchet.mjs
# 3. raw colours outside the token file, by file (modules, styled-jsx, email builders included)
grep -rnE '(^|[^\w&-])(#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\()' app components lib \
  --include='*.css' --include='*.tsx' --include='*.ts' --include='*.js' \
  | grep -v app/styles/tokens.css | grep -vE 'url\(|unicode-range|PRs? #' | awk -F: '{c[$1]++} END{for(f in c) print c[f],f}' | sort -rn
# 4, 5, and page-level maxWidth: the guardrail's own warnings
node scripts/design/check-assets.mjs --warn-only
# 6. components with their own <style> block; stylesheets defining custom properties
grep -rln '<style\|styled-jsx\|__html: [A-Z_]*STYLES' app components --include='*.tsx'
grep -rn '^\s*--[a-zA-Z0-9-]*:' app components --include='*.css' | grep -v tokens.css
# 7. custom properties used but never defined, and fallbacks that hide them
comm -23 <(grep -rhoE 'var\(--[a-zA-Z0-9-]+' app components lib --include='*.css' --include='*.tsx' --include='*.ts' | sed 's/var(//' | sort -u) \
         <(grep -rhoE '(^\s*|")--[a-zA-Z0-9-]+' app components lib --include='*.css' --include='*.tsx' --include='*.ts' | grep -oE '\-\-[a-zA-Z0-9-]+' | sort -u)
grep -rnE 'var\(--[a-zA-Z0-9-]+,\s*[^)]+\)' app components lib --include='*.css' --include='*.tsx' --include='*.ts' | grep -v tokens.css
# 8. colour lists in TS and colour columns in the schema
grep -rnE '(COLOR|COLOUR)[A-Za-z_]*\s*[:=]' lib app components --include='*.ts' --include='*.tsx'
grep -nE '"colou?r" "text"' supabase/01-schema.sql
# 9. overlapping component classes
grep -oE '^\.admin-(progress|meter|avatar|avatarbtn|box|pill|chip|badge|tag)[a-z0-9-]*' app/admin/admin.css | sort -u
# 10. painters outside the browser and whether they read the palette module
grep -rlE 'ImageResponse|resend|<html' lib app/api --include='*.ts' --include='*.js' | while read f; do echo "$f hex=$(grep -cE '#[0-9a-fA-F]{3,8}\b' "$f") palette=$(grep -c design/palette "$f")"; done
# region
grep -A2 '"regions"' vercel.json
```

## Measurements (before)

### 1. Inline styles

Raw `style={{` count across `app/`, `components/`, `lib/`: **202** in 94
files. The guardrail (which exempts OG images, icons and email builders)
sees **180**: **15 styled** (colour / background / border / radius / font /
shadow) and **165 layout-only**. 13 of the 15 styled ones are data-driven
token variables already marked `layout-ok` (epic, channel, stage and series
colours); two are not (`case-studies/[slug]/page.tsx:104`,
`the-vietnam-experience/page.tsx:53`).

| Area | Styled | Layout-only | Unmarked (no `layout-ok`) |
|---|---|---|---|
| `app/admin` | 9 | 43 | 44 |
| `app/team` | 1 | 26 | 14 |
| `app/portal` | 0 | 25 | 23 |
| `components/` | 3 | 13 | 13 |
| `app/the-vietnam-experience` | 1 | 17 | 18 |
| `app/vietnam-adventure-flight-info` | 0 | 11 | 11 |
| `app/page.tsx` | 0 | 8 | 8 |
| `app/case-studies` | 1 | 7 | 8 |
| `app/error.tsx`, `app/not-found.tsx` | 0 | 4 | 4 |
| `app/workflows` | 0 | 7 | 0 (all marked) |
| `app/careers`, `app/contact`, `app/vietnam-adventure-info-form` | 0 | 4 | 4 |

### 2. Class prefixes per stylesheet

| Stylesheet | Prefixes | Rules | Verdict |
|---|---|---|---|
| `app/admin/admin.css` | `admin-` only | 1377 | namespace |
| `app/styles/utilities.css` | `u-` only | 127 | namespace |
| `app/globals.css` | **124 distinct** (`xp-` 103, `rt-` 94, `blog-` 58, `post-` 53, `contact-` 50, `cs-` 42, `careers-` 36, `hero-` 33, `engage-` 30, `reserve-` 27, `job-` 24, `footer-` 22, `steps-` 20, `cat-` 20, `choice-` 19 …) plus `site-` (66) | ~1400 | debt; the ratchet counts 319 page-prefixed rules |
| `app/workflows/workflows.css` | `wf-` | 219 | debt (private prefix) |
| `app/8-edges-app/eight-edges-app.css` | `e8a-` | 78 | debt (private prefix) |
| `app/plans/plans.css` | `brief-` | 20 | debt (private prefix) |
| `app/events/[slug]/event.module.css` | CSS-module camelCase | 38 classes | scoped; colour rule applies |
| `app/surveys/[slug]/survey.module.css` | CSS-module camelCase | 29 classes | scoped; colour rule applies |
| `app/work/[token]/work.module.css` | CSS-module camelCase | 22 classes | scoped; colour rule applies |

Three components also carry a per-feature prefix inside an embedded
`<style dangerouslySetInnerHTML>` string, invisible to the prefix scan:
`cbe-` (28 classes, `BacklogAdminEditor.tsx`), `cbp-` (25,
`BacklogPortalView.tsx`), `tcr-` (14, `team/.../roadmap/styles.ts`, used by
two pages).

### 3. Raw colours outside `tokens.css`

The guardrail reports **0** because it exempts these files. Unexempted:

| File | Raw colours |
|---|---|
| `app/work/[token]/work.module.css` | 29 |
| `lib/ogRender.js` (OG cards) | 7 hex + 3 rgba |
| `lib/admin/portal-invite.ts` (email) | 10 |
| `app/api/careers/apply/route.ts` (email) | 9 |
| `app/api/vietnam-adventure-flight-info/route.ts` (email) | 9 |
| `lib/marketing-email.ts` | 7 |
| `app/api/cron/board-digest/route.ts` (email) | 7 |
| `app/api/contact/route.ts` (email) | 5 |
| `app/api/vietnam-adventure-info-form/route.ts` (email) | 5 |
| `lib/team/signin-link.ts` | 4 |
| `lib/contractor-notify.ts` | 3 |
| `lib/admin/signin-link.ts`, `app/admin/(dashboard)/talent/team/actions.ts` | 2 each |
| `lib/onboarding.ts`, `event.module.css`, `survey.module.css` | 1 each |
| `lib/design/palette.ts` | 13 (the palette itself, allowed) |

Total: **~99 raw colours in 16 files** outside the two allowed files.

### 4 and 5. Type and spacing scales

Clean. `check-assets` reports no off-scale font size or spacing value; the
one 400px decorative glyph carries `scale-ok`. Upstream snapped both scales
in its PR #1018, which this snapshot includes.

### Page-level `maxWidth`

5 values across 4 widths bypass the sanctioned 640 / 880 / 1440:
560px x2 and 460px (`patterns/page.tsx`), 420px (`PersonSelectDemo.tsx`),
900px (`portal/programs/[id]/page.tsx`).

### 6. Private styles

- 4 components with an embedded `<style>` block (3 stylesheets, above).
- `app/workflows/workflows.css` defines its own colour aliases
  `--wf-green`, `--wf-red`, `--wf-amber` (3) over tokens.
- `app/globals.css` and `workflows.css` re-assign `--link` / `--link-hover`
  on dark sections: theming, not aliases; kept.

### 7. Custom properties

Used but never defined: `--magenta`, `--orange` (`workflows.css` swatches,
render transparent), `--font-sans`, `--font-mono` (module stylesheets and
`RetreatAgenda.tsx`, hidden by fallbacks). `--admin-chart-` is a template
prefix in `DonutChart.tsx`, fine. Fallbacks hiding a missing definition: 3
(`work.module.css:8`, `event.module.css:268`, `RetreatAgenda.tsx:17`);
`var(--font-body, inherit)` x2 and `var(--n, 2)` in `admin.css` are
legitimate defaults.

### 8. Colours in data

TS lists are on tokens: `EPIC_COLORS` (`lib/boards/types.ts`),
`lib/admin/stageColors.ts`, `ROLE_COLORS`, `marketing-calendar.ts` channel
accents, `OnboardingCycleBoard` stage colours all hold `var(--admin-*)`
strings. The schema has two colour columns, `company_os.tags.color` and
`company_os.epics.color` (both `text`). This fork has no database attached,
so rows could not be inspected; the code that writes them uses the token
lists above and `epicColor()` falls back to the first token for anything
unknown.

### 9. Overlapping component classes

| Pair | Where |
|---|---|
| `.admin-campaign-progress-track` + `-fill` vs `.admin-meter` + `.admin-meter-fill` | `admin.css:2062`, `:4858` |
| `.admin-avatarbtn`, `.admin-avatarbtn--lg` vs `.admin-avatar--md` / `--lg` | `admin.css:90`, `:4954` |
| `.admin-tag-pill` vs `.admin-tag-xs` vs `.admin-badge` | `admin.css:4863`, `:4891`, `:1433` |

Avatar sizes, meter variants and box/box-pad were already merged upstream
(PR #1019).

### 10. Painters outside the browser

`lib/design/palette.ts` exists and mirrors §1 of `tokens.css`, but only
`lib/qr.ts` reads it. `lib/ogRender.js` (CommonJS) keeps its own `COLORS`
table; eight email builders in `lib/` and four API email routes inline
their own hex (table in §3).

### Region

`vercel.json` pins functions to `sin1`. This fork has no Supabase project;
the README tells the operator to create one "nearest the operator", so
`regions` must be set to match it then (`ap-southeast-1` → `sin1`,
`ap-south-1` → `bom1`, `ap-northeast-1` → `hnd1`, `us-west-2` → `pdx1`).

## Backlog

One PR per item, into `ds/debt-base`. The PR column fills in as they merge.

| # | What | Where | Count | Fix | PR |
|---|---|---|---|---|---|
| 1 | Guardrails run only locally; styled ceiling 11 above the count | no `.github/`, `check-tokens.mjs` | ceiling 26, count 15 | Add `design-guardrails.yml` (check-tokens, check-assets, ratchet) and enable Actions; ceiling to 15 | #15 |
| 2 | Painters carry their own hex | `lib/ogRender.js`, 8 email builders, 4 API email routes | 71 hex in 13 files | Read `lib/design/palette` (a `palette.json` the CJS renderer can `require`, re-exported by `palette.ts`); drop their `SKIP_FILE` exemptions | |
| 3 | Module stylesheets exempt from the colour check; undefined font variables | `work.module.css`, `event.module.css`, `survey.module.css`, `RetreatAgenda.tsx` | 31 raw colours, 3 fallbacks | Tokenise; use `--font-body`; drop the `.module.css` exemption | |
| 4 | Undefined and aliased custom properties | `workflows.css` | `--magenta`, `--orange`, `--wf-green/red/amber` | Swatches on `--color-*` tokens; aliases inlined | |
| 5 | Per-feature prefixes inside embedded `<style>` strings | 4 components | 67 classes, 3 prefixes | Fold into `admin.css` as `admin-backlog-editor-*`, `admin-backlog-portal-*`, `admin-roadmap-*` by exact class name | |
| 6 | Page-prefixed selectors on the public site | `globals.css` | 124 prefixes, 319 ratcheted rules | Rename every class by exact name to `site-<component>-*`, update consumers, ratchet to 0 | |
| 7 | Private stylesheets with their own prefix | `workflows.css`, `eight-edges-app.css`, `plans.css` | `wf-` 219, `e8a-` 78, `brief-` 20 | Rename by exact class name to `site-wf-*`, `site-e8a-*`, `site-brief-*` | |
| 8 | Inline styles: core record pages | contacts, team member, application, deal, event, sales call, campaign, boards | 22 unmarked | Converters, then component classes on `admin.css` + patterns | |
| 9 | Inline styles: admin core and shared components | login, skeletons, not-found, patterns, `components/*` | 19 unmarked | Converters, then hand-finish; layouts load `utilities.css` where missing | |
| 10 | Inline styles: revenue | cockpit, deals board, marketing | 6 unmarked | Converters, then `admin-section-card--flush` | |
| 11 | Inline styles: talent, operations, edges | applications, surveys, analytics, client roadmaps | 5 unmarked | Converters, then `--tag` variable on the role tag (fixes an invalid `var()1f` background) | |
| 12 | Inline styles: team intranet and client portal | `app/team`, `app/portal` | 37 unmarked | Converters, then `admin-card-foot`, `admin-overview-text`, `admin-details-summary` | |
| 13 | Inline styles: public pages | home, case studies, Vietnam experience, flight info, error pages | 53 layout-only + 2 styled | Converters (`site-inline.pl`), then `site-*` classes in `globals.css` | |
| 14 | Page-level `maxWidth` off the sanctioned widths | patterns, PersonSelect demo, portal program | 5 | `u-max-sm` / `u-max-form` / `u-max-narrow` (lands with items 9 and 12) | |
| 15 | Overlapping component classes | `admin.css` | 3 pairs | Campaign progress on `admin-meter`; avatar button on `admin-avatar`; `admin-tag-xs` on `admin-tag-pill`; callers updated | |
| 16 | Colour columns in the database | `company_os.tags.color`, `company_os.epics.color` | no rows to inspect | Verified writers use token lists; documented; nothing to migrate in this fork | |

Type and spacing scales need no item: they are clean.

## After

Filled in by the close-out PR.
