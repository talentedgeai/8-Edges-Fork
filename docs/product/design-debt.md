# Design debt backlog (4 Sep 2026)

Measured on `main` after the design-system migration (PRs #1004 to #1014).
Each item lands as one PR; the PR column fills in as they merge. Commands are
in `docs/product/design-system-migration.md`.

| # | What | Where | Count | Fix | PR |
|---|---|---|---|---|---|
| 1 | `.u-*` utilities only loaded by OS surfaces | `admin.css` | 118 rules | Move to `app/styles/utilities.css`, imported after each surface stylesheet | #1015 |
| 2 | Inline styles on the public workflow library | `app/workflows` | 384 blocks | Converters, then hand-finish as `wf-*` modifiers in `workflows.css` (384 to 24, all data-driven or the stylesheet-free gate) | this PR |
| 3 | Inline styles on marketing pages | 20 route directories under `app/` | 250 blocks | Converters, then hand-finish as `body .site-*` classes in `globals.css` (250 to 3, all `layout-ok`) | this PR |
| 4 | Font sizes off the type scale | CSS files | 130 declarations, 21 values | Snapped to the nearest step, ties downward; 22 / 26 (ramp tokens) and 56 (display) join the scale; `scale-ok` exempts the 400px decorative glyph | this PR |
| 5 | Spacing off the spacing scale | CSS files | 224 declarations, 21 values | Snapped to the nearest step, ties downward; 1 (hairline) and 140 / 160 (hero clamp maxima) join the scale | this PR |
| 6 | Overlapping component classes | `admin.css` | meter vs progress, box vs box-pad, six avatar classes | One `.admin-avatar` with size and tone modifiers, `.admin-meter--hairline`, `.admin-box` + padding utility; 23 rules removed, every caller updated | this PR |
| 7 | Private stylesheets with their own colour aliases; `.module.css` exempt from the colour check | `team-onboarding.css`, `workflows.css`, three `.module.css` | 14 aliases, 31 raw colours | Aliases inlined to `--color-*` tokens; module stylesheets tokenised and covered by the check | this PR |
| 8 | Email and OG builders carry raw hex | 8 email builders, `lib/ogRender.js` | 57 hex | Read `lib/design/palette.json` (via `palette.ts` in TS, `require` in the CJS renderer); the check now covers those files, `colour-ok` marks the one rgba() Satori needs | this PR |
| 9 | Components with their own `<style>` / styled-jsx block | admin, portal, team, private pages | 12 files | 11 moved: OS blocks into `admin.css` as `admin-backlog-*`, `admin-backlog-editor-*`, `admin-roadmap-*`; public blocks into `globals.css` / `workflows.css`; bookstore into `bstore.css`. The UI redesign plan keeps its block because it is a self-contained `srcDoc` document in an isolated iframe | this PR |
| 10 | Page-level `maxWidth` values bypassing sanctioned widths | OS pages | 5 | Replaced with `u-max-form` / `u-max-narrow` / `u-max-sm` / `u-max-6`; `check:design` reports none | this PR |
| 11 | Epic colours stored as hex in `company_os.epics` | database | 0 rows: the table does not exist in production (migration `20260901120000_task_epics` was never applied) | Nothing to migrate; the unapplied migration is a separate defect, flagged | this PR |
| 12 | `/admin/verify` not exempt in the middleware; Applications page bounces to the dashboard | `middleware.ts`, `talent/applications` | 2 bugs | Fix and verify | |
| 13 | Page-prefixed selectors on the public site | `globals.css` | 319 | Consolidate duplicated per-page rules into shared site components; ratchet the rest | |
| 14 | Custom properties used with a fallback that hides a missing definition | `my-retreat`, `.module.css` files, retreat agenda | 5 | Replaced with the defined token | this PR |
