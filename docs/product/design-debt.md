# Design debt backlog (4 Sep 2026)

Measured on `main` after the design-system migration (PRs #1004 to #1014) and
cleared by PRs #1015 to #1024 on the same day. Commands are in
`docs/product/design-system-migration.md`.

**State after the backlog (4 Sep 2026):** inline style blocks 822 to 223 (26
styled, every one data-driven and `layout-ok`); no raw colour outside
`tokens.css` / `palette.json`, email and OG builders included; `check:design`
reports zero off-scale values and zero ad-hoc widths; `admin.css` is `.admin-*`
only, utilities live in `app/styles/utilities.css`; no component carries a
`<style>` block except one isolated `srcDoc` document; `globals.css` holds
shared site styles only (five root classes on the ratchet), with route rules
beside their layouts.

| # | What | Where | Count | Fix | PR |
|---|---|---|---|---|---|
| 1 | `.u-*` utilities only loaded by OS surfaces | `admin.css` | 118 rules | Move to `app/styles/utilities.css`, imported after each surface stylesheet | #1015 |
| 2 | Inline styles on the public workflow library | `app/workflows` | 384 blocks | Converters, then hand-finish as `wf-*` modifiers in `workflows.css` (384 to 24, all data-driven or the stylesheet-free gate) | #1016 |
| 3 | Inline styles on marketing pages | 20 route directories under `app/` | 250 blocks | Converters, then hand-finish as `body .site-*` classes in `globals.css` (250 to 3, all `layout-ok`) | #1017 |
| 4 | Font sizes off the type scale | CSS files | 130 declarations, 21 values | Snapped to the nearest step, ties downward; 22 / 26 (ramp tokens) and 56 (display) join the scale; `scale-ok` exempts the 400px decorative glyph | #1018 |
| 5 | Spacing off the spacing scale | CSS files | 224 declarations, 21 values | Snapped to the nearest step, ties downward; 1 (hairline) and 140 / 160 (hero clamp maxima) join the scale | #1018 |
| 6 | Overlapping component classes | `admin.css` | meter vs progress, box vs box-pad, six avatar classes | One `.admin-avatar` with size and tone modifiers, `.admin-meter--hairline`, `.admin-box` + padding utility; 23 rules removed, every caller updated | #1019 |
| 7 | Private stylesheets with their own colour aliases; `.module.css` exempt from the colour check | `team-onboarding.css`, `workflows.css`, three `.module.css` | 14 aliases, 31 raw colours | Aliases inlined to `--color-*` tokens; module stylesheets tokenised and covered by the check | #1020 |
| 8 | Email and OG builders carry raw hex | 8 email builders, `lib/ogRender.js` | 57 hex | Read `lib/design/palette.json` (via `palette.ts` in TS, `require` in the CJS renderer); the check now covers those files, `colour-ok` marks the one rgba() Satori needs | #1020 |
| 9 | Components with their own `<style>` / styled-jsx block | admin, portal, team, private pages | 12 files | 11 moved: OS blocks into `admin.css` as `admin-backlog-*`, `admin-backlog-editor-*`, `admin-roadmap-*`; public blocks into `globals.css` / `workflows.css`; bookstore into `bstore.css`. The UI redesign plan keeps its block because it is a self-contained `srcDoc` document in an isolated iframe | #1021 |
| 10 | Page-level `maxWidth` values bypassing sanctioned widths | OS pages | 5 | Replaced with `u-max-form` / `u-max-narrow` / `u-max-sm` / `u-max-6`; `check:design` reports none | #1021 |
| 11 | Epic colours stored as hex in `company_os.epics` | database | 0 rows: the table does not exist in production (migration `20260901120000_task_epics` was never applied) | Nothing to migrate; the unapplied migration is a separate defect, flagged | #1020 |
| 12 | `/admin/verify` not exempt in the middleware; Applications page bounces to the dashboard | `middleware.ts`, `talent/applications` | 2 bugs | Middleware fixed in #1022. The Applications bounce is by design: the ATS layouts call `requireSuperAdmin()`, and the local test session was `dave@edge8.co`, an admin but not in the super-admin set (`dave@edge8.ai` is); the page streams `redirect("/admin")` | #1022 |
| 13 | Page-prefixed selectors on the public site | `globals.css` | 319 | Page-local rules moved into `app/<route>/<route>.css` beside each route layout (ten routes). The 49 classes that turned out to be shared sections (blog teaser, contact band, application form, case-study cards, reserve steps) stay global and are renamed into the `site-*` namespace; `site-components.css` holds the shared `body .site-*` rules. Five root classes (`.blog`, `.contact`, `.case-studies`, `.reserve-incl`) remain and are the ratchet baseline; `globals.css` 3506 to about 2900 lines | #1023 |
| 14 | Custom properties used with a fallback that hides a missing definition | `my-retreat`, `.module.css` files, retreat agenda | 5 | Replaced with the defined token | #1020 |

## Follow-up: inline literals cleared (#1025)

The backlog left 214 inline `style={{}}` blocks; a question about whether that
was acceptable split them into data-driven (keep, `layout-ok`) and plain
literals the converters had skipped (clear). This pass took the count to 91:

| | before | after |
|---|---|---|
| inline `style={{}}` blocks | 214 | 91 |
| styled inline (colour/border/font, the ceiling) | 26 | 24 |
| layout-only literals | ~120 | 44 (all data-driven, on the baseline) |

Every remaining block is data-driven: runtime epic / channel / stage / series
colours, a width or size from data or props, a CSS variable carrying a count,
hidden fields, and the private unlock gate that deliberately renders before any
stylesheet. The rest became `.u-*` utilities or small component classes
(`.admin-deal-figure`, skeleton modifiers, `.u-img`, the nav and footer logo
sizes). The styled-inline ceiling is 24, the floor, so it can only be held.
