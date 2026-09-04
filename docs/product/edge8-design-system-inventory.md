# Edge8 Design System: Drift Inventory

**Audited:** 2026-08-11, against `origin/main` at `cb55e0c`
**Scope:** all CSS under `app/` and `components/` (9,153 lines across 8 files), plus inline
style objects and `<style jsx>` blocks in 389 `.tsx` files.
**Measures against:** [edge8-design-system.md](edge8-design-system.md) (Foundations) and
[edge8-design-system-data.md](edge8-design-system-data.md) (Data Layer).

This is an inventory, not a plan. Every claim below is a count or a `file:line`, so each item
can be checked independently and ticked off as it is fixed.

---

## 0. How to read this

The question that started this audit was "was the font the only problem?" It was not. The font
bug was invisible by nature: nothing failed, so it survived months. Everything in this document
is the opposite. It is visible on every page, which is why the product reads as inconsistent
even when no single screen looks broken.

Findings are grouped into three kinds:

| Kind | Meaning |
|---|---|
| **Brand rule** | Breaks a rule stated in `CLAUDE.md`. Not a matter of taste. |
| **Divergence** | The code and the design doc disagree. One of them is wrong. |
| **Entropy** | No single wrong value, but so many variants that consistency is impossible. |

**Method note.** Counts come from grep over the CSS and TSX sources, so they measure declared
rules, not rendered pixels. A rule that is dead code still counts. Where a number is an
estimate it says so.

---

## 1. Brand rule violations (fix regardless of any redesign)

### 1.1 The brand name renders as "EDGE8" in ten places

`CLAUDE.md`: *"Edge8" is always written exactly like that. Never all caps. Watch for CSS
`text-transform: uppercase` on eyebrows and labels; keep the brand name out of it.*

In each case below the source text is correct ("Edge8") and a CSS `text-transform: uppercase`
renders it as "EDGE8".

| Rendered text | Markup | Rule applying uppercase |
|---|---|---|
| EDGE8 VIETNAM ADVENTURE | `app/vietnam-adventure-info-form/page.tsx:17` | `app/globals.css:2923` `.apply-eyebrow` |
| EDGE8 WORK REQUEST | `app/work/[token]/page.tsx:96` | `app/work/[token]/work.module.css:21` |
| EDGE8 SURVEY | `app/surveys/[slug]/SurveyRunner.tsx:327` | `app/surveys/[slug]/survey.module.css:34` |
| EDGE8 EVENT | `app/events/[slug]/page.tsx:90` | `app/events/[slug]/event.module.css:18` |
| EDGE8 OS | `components/admin/AdminChatWidget.tsx:397` | `app/admin/admin.css:1523` |
| EDGE8 AI WORKSPACE | `components/team/TeamChatWidget.tsx:251` | `app/admin/admin.css:1523` |
| WITH EDGE8 SINCE | `app/team/(dashboard)/page.tsx:194` | `app/admin/admin.css:564` |
| EDGE8 | `app/workflows/private/e8/team-onboarding/TeamOnboardingDeck.tsx:169` | `team-onboarding.css:321` |
| EDGE8 COMPANY TOOLS | `TeamOnboardingDeck.tsx:681` | `team-onboarding.css:194` |
| EDGE8 (tag) | `app/private/bstore/page.tsx:53, :81` | `app/private/bstore/page.tsx:187` |

Latent risk: `components/admin/PageHead.tsx:17` routes **every** admin, team, and portal page
eyebrow through `.admin-eyebrow` (`app/admin/admin.css:384`), which is uppercase. Any future
eyebrow containing the brand name is capitalised by default.

Already fixed on branch `design-system-implementation`: the OpenGraph social cards, which
rendered "EDGE8", "ABOUT EDGE8", "CAREERS AT EDGE8" on every share.

### 1.2 Letter-spacing is banned but used 177 times

Foundations §4: *"Do not apply `letter-spacing` to any text element. This is a firm rule."*
Data Layer §2 keeps the ban, allowing exactly one exception (`-0.01em` on tabular numerics).

**177 `letter-spacing` declarations** exist across `app/` and `components/`: 157 in CSS syntax
plus 20 as JS `letterSpacing` in inline style objects. None is the sanctioned tabular-numeric
exception. Values range from `0.01em` to `0.22em`.

**RESOLVED 2026-08-11.** The ban stands for prose, and the section micro-label is now a
documented exception that carries tracking by design. That legitimises the tracking on
micro-labels specifically; it does not legitimise the other values in the range above.
The remaining work is to migrate ad-hoc rules onto the canonical class rather than to
strip tracking wholesale.

---

## 2. Divergences: the doc and the code disagree

### 2.1 The documented eyebrow is used twice; an undocumented one is used ~106 times

Foundations §5 specifies one label: background `#EAEEF2`, text `#797c82`, 14px, radius 40px,
no border, Title Case, no tracking.

**Rules matching that spec: 2.** `.section-label` (`app/globals.css:178`) and `.hero-eyebrow`
(`app/globals.css:458`).

**Uppercase declarations in total: 121** (107 in CSS syntax, 14 as JS `textTransform`). Roughly
15 of those sit on a pill background (listed below); the remaining ~106 are the undocumented
bare uppercase-plus-tracking micro-label. That is the de facto standard across every surface.
A representative sample:

- Marketing: `.hero-stat-label` `app/globals.css:554`, `.shift-payoff-eyebrow:632`,
  `.mental-tag:703`, `.engage-tag:757`, `.cs-related-label:2426` (0.2em), `.apply-eyebrow:2923` (0.22em)
- OS: `.admin-eyebrow` `app/admin/admin.css:384`, `.mp-kpi-label:521`, `.team-glance-label:564`,
  `.admin-table thead th:1426`, `.admin-nav-sectlabel:2952` (0.14em)
- Workflows: `.wf-table th` `app/workflows/workflows.css:409`, `.wf-element-name:455`
- Onboarding deck: 11 rules in `team-onboarding.css` (`:169, :194, :268, :297, :321, :378, :420, :465, :495, :659, :784`)
- 12 further rules inline in `app/workflows/private/ai-officer-institute/ui-redesign-plan/page.tsx`

There are also 15 rules that combine uppercase and tracking **on** a pill background, so they
look like the documented eyebrow while breaking both bans: `.hero-featured-cat:1581`,
`.blog-card-cat:1667`, `.post-category-tag:1681`, `.cs-eyebrow:2407`, `.cs-slide-label:2424`,
`.job-badge-featured:2721`, `.job-dept:2706`, `.wf-cat` `workflows.css:67`,
`.team-org-badge` `admin.css:729`, `.ts-yours:872`, and five copy-pasted inline `-step` chips.

**DECIDED 2026-08-11: the micro-label is blessed.** It is now specified in the Foundations
doc (Labels), and is the single sanctioned exception to the no-uppercase and no-tracking
rules. The canonical class is `.admin-section-label`, and it must be used on **all three**
OS surfaces, not just the employee portal.

Remaining work is conformance, not decision: the ~106 ad-hoc uppercase rules should be
migrated onto the canonical class or its documented values, rather than each redeclaring
its own size and tracking (values currently range from 0.01em to 0.22em).

### 2.2 The documented `.data-btn` class does not exist

Data Layer §6 specifies `.data-btn` / `.data-btn--primary` at 13px with an 8px radius. No such
class exists anywhere in the repo. Only the token `--data-btn-radius` exists
(`app/globals.css:99`), consumed by `--admin-radius-sm` (`app/admin/admin.css:64`).

The real implementation is `.admin-btn` (`app/admin/admin.css:395`) at **13.5px**, not 13px.

### 2.3 Navigation matches neither the doc nor itself

| Surface | Size | Weight | Source |
|---|---|---|---|
| Documented | 15px | 400 | Foundations §4 type table |
| Marketing nav | 14px | 500 | `app/globals.css:283` |
| Admin/team/portal nav | 13.5px | 500, active 600 | `app/admin/admin.css` `.admin-nav-link` |

Three different answers for the same element.

### 2.4 `--radius-sm` is not small

`app/globals.css:70` defines `--radius-sm: 20px`, identical to `--radius`. Eleven rules use it
believing it is a smaller radius, including the nav dropdown buttons (`:283`) and pagination
(`:1622`), which therefore render at 20px.

---

## 3. Entropy: too many variants to be consistent

### 3.1 Breadcrumbs and back-links: 17 distinct implementations

The element you are most likely to see on every page has no shared component at all.

**Three incompatible separator conventions for the same "parent trail" semantic:**
- `/` as a standalone `<span>`: `.wf-breadcrumb`, `app/workflows/workflows.css:43`
- `·` baked into a plain string: `.admin-eyebrow`, via `components/admin/PageHead.tsx:17`
- No separator, only a single `←`-prefixed parent: every back-link variant

**Eight font sizes for the same element:** 12px (`.admin-eyebrow`), 12.5px (`.admin-btn--sm`),
13px (`.xp-backlink`, `.cs-detail-back`, `.reserve-back`, `.admin-auth-link`), 13.5px
(`.admin-btn`), 14px (`.wf-breadcrumb`, `.apply-back`), 15px (`.wf-back`, `.btn`), plus two that
inherit whatever is around them.

**Eight colours for the same element:** `#287BE8`, `#6B7280`, `#9CA3AF`, `#797c82`, `#6FF2C1`,
`#101014`, `rgba(255,255,255,0.55)`, and a hard-coded `#fff`.

**Same class, two appearances.** `.admin-eyebrow` renders grey `#9CA3AF` when it holds plain
text, but blue `#287BE8` when it holds a `<Link>`, because `.admin-shell a`
(`app/admin/admin.css:83`) repaints the child and no `.admin-eyebrow a` rule exists. The
breadcrumb changes colour based on whether it happens to be clickable.

**Two rules that match nothing.** `.wf-back` is defined only as `.wf-detail-foot a.wf-back`
(`app/workflows/workflows.css:532`). Used outside that parent it is unstyled:
`app/workflows/method/page.tsx:241` patches colour inline but silently loses the 15px size, and
`app/workflows/private/PrivateGate.tsx:73` is a completely unstyled submit button.

Other one-offs: `←` is written as `&larr;` in one place
(`app/private/bstore/backlog/page.tsx:793`, also the only underlined back-link), the arrow is
dropped entirely on `.admin-btn` back buttons and `app/checkout/success/page.tsx:59`, and
`app/team/(dashboard)/directory/[id]/page.tsx:136` repurposes the page-subtitle class
`.admin-page-sub` as a back-link wrapper.

### 3.2 Buttons: 10 radius values where 2 are sanctioned

Sanctioned: 40px pill for CTAs, 8px for compact/data buttons.

In use: `40px`, `99px`, `100px`, `50%`, `20px`, `12px`, `10px`, `9px`, `8px`, `7px`, `6px`.

Five of those (`40px`, `99px`, `100px`, `999px`, `9999px` counting badges) are visually
identical fully-round pills expressed five different ways.

Notable one-offs: 9px at `app/admin/admin.css:888` sitting right next to the 8px token; 7px at
`:1477`; 20px on nav and pagination buttons via the mis-set `--radius-sm`.

**Namespace collision.** `app/private/bstore/backlog/page.tsx:584` redefines `.btn`, the global
40px CTA class, as a scoped 99px/13px button. Any element inside `.bstore-doc` carrying the
global class is silently reshaped.

**Class-less buttons.** `app/my-retreat/MyRetreatGate.tsx:146` defines a button entirely as an
inline `React.CSSProperties` object (radius 10, no font-weight).
`app/private/bstore/page.tsx:592` and `app/private/bstore/backlog/page.tsx:759` are
byte-identical inline duplicates hard-coding `#287BE8`.

**CTA padding drift** (correct 40px radius, wrong padding versus the specified `16px 24px`):
`event.module.css:174` (14px 32px), `:230` (12px 26px), `survey.module.css:196` (14px 32px),
two bstore buttons (11px 12px), plus six padding overrides on `.btn` in globals.

### 3.3 Cards: 105 class families, and an opt-in padding convention

> **Corrected 2026-08-11.** The first version of this section claimed `.admin-card` was simply
> missing its padding and that every caller re-invented it. That was wrong, and the correction
> matters because it changes the fix from "restyle 151 cards" to "fix five". The audit trail is
> kept here deliberately: the original reading came from grepping the base class in isolation
> without following its companion classes.

`.admin-card` (`app/admin/admin.css:490`) is a deliberate **shell**: background, border, radius,
shadow, and no padding. Padding comes from a companion class added alongside it:

| Companion | Padding | Source |
|---|---|---|
| `.admin-section-card` | `18px 20px` | `app/admin/admin.css:1719` |
| `.admin-chart-card` | `16px 18px` | `:452` |
| `.coach-section` | `18px 20px` | `:2645` |
| `.coach-card` | `16px 18px` | `:2588` |

Of 178 `.admin-card` call sites: **110** pair it with `.admin-section-card`, a further group
uses one of the other companions, **25** set padding inline instead, and some are legitimately
flush because the child pads itself (`.admin-empty` at `:1468`, `.admin-table`,
`.admin-drawer-head` at `:1524`).

**The real defect is smaller and sharper: five cards use the bare shell with a child that does
not pad itself, so their content sits flush against the border.**

- `app/admin/(dashboard)/edges/goals/GoalsBoard.tsx:287` (the Team FAST goals card)
- `app/team/(dashboard)/strategy/page.tsx:198` (the Overview box)
- `app/admin/(dashboard)/operations/time-off/requests/TimeOffBoard.tsx:220`
- `app/team/(dashboard)/company-goals/page.tsx:212`
- `app/team/(dashboard)/time-off/TimeOffPanel.tsx:84`

So the structural weakness is real but different from first stated: padding is **opt-in on a
shell**, and nothing catches a caller who forgets to opt in. The 25 inline paddings are the
secondary problem, since they diverge from the two sanctioned companion values.

Across the app there are **105 distinct card-like class families** and **36 distinct
`box-shadow` values**, against a documented shadow system of two (none at rest, one on hover)
plus four overlay tokens.

### 3.4 Scales: the type and spacing ramps are effectively freehand

| Axis | Documented | Actual | Evidence |
|---|---|---|---|
| Font size | ~7 steps | **35 distinct px values** | includes 8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5, 15.5 |
| Padding (admin.css alone) | 4px scale | **23 distinct values** | includes 1, 2, 3, 5, 6, 7, 9, 11, 13 |
| Gap | 4px scale | **26 distinct values** | includes 1, 2, 3, 5, 7, 9, 11 |
| Border-radius | 4 (40/20/8/50%) | **19 literal values + 7 token spellings** | |

Half-pixel type steps and odd-numbered spacing are the signature of nudging each component
until it looks right in isolation. It is why the product reads as inconsistent even though no
individual screen is obviously wrong.

### 3.5 Colour: 81 hard-coded hex values outside the token blocks

| File | Occurrences | Distinct |
|---|---|---|
| `app/admin/admin.css` | 46 | 31 |
| `app/globals.css` | 23 | 16 |
| `app/workflows/workflows.css` | 10 | 2 |
| `app/plans/plans.css` | 2 | 1 |

(Excludes `#fff` / `#000`.) These include several off-palette status colours that predate the
Data Layer's canonical status pairs: three different reds, four greens, a purple, a pink, an
amber. The brand blue `#287BE8` is also hard-coded rather than tokenised in at least three
inline component styles.

---

## 4. Structural causes

The individual items above are symptoms. Three underlying causes generate them:

1. **Shared primitives make correctness opt-in.** `.admin-card` is a shell whose padding
   arrives only if a caller remembers a companion class,
   `.admin-eyebrow` has no link colour, `.wf-back` only works under one parent. Each caller
   completes the component differently, so drift is the default outcome rather than a mistake.

2. **There is no shared component for the most repeated elements.** Breadcrumbs, back-links,
   and page headers are re-implemented per page. Seventeen breadcrumb variants is not
   negligence; it is the predictable result of having nothing to import.

3. **The design doc describes an ideal, not the system.** Two rules follow the documented
   eyebrow and 119 follow an undocumented one. A doc that does not match reality stops being
   consulted, which accelerates the drift it was meant to prevent.

A fourth, now closed: **nothing verified the design system in CI.** That is why the missing
font survived months. `npm run check:design` now covers assets and font weights; it does not
yet cover any of the rules in this document.

---

## 5. Suggested sequencing

Not a commitment, just the order that gets the most visible improvement for the least risk.

**Group A: small, visible, low risk**
- The five bare `.admin-card` uses that render flush get `.admin-section-card` (§3.3)
- The ten "EDGE8" cases (§1.1)
- `--radius-sm` corrected, or renamed to what it actually is (§2.4)
- `.btn` namespace collision in bstore (§3.2)
- `.wf-back` rules that match nothing (§3.1)

**Group B: consolidation, mechanical but broad**
- One breadcrumb and one back-link component; migrate all 17 call sites (§3.1)
- Collapse the five spellings of "fully round" to one token (§3.2, §3.4)
- Hard-coded hex to tokens, off-palette statuses to the `--data-*` pairs (§3.5)

**Group C: decisions first, then code**
- ~~Bless or kill the uppercase micro-label, and resolve the letter-spacing ban~~ **decided: blessed** (§1.2, §2.1). What remains is migrating ad-hoc rules onto `.admin-section-label`, which is Group B work.
- ~~Pick the real type and spacing scales, then snap to them~~ **decided: defined and adopted** (§3.4). Remaining off-scale values are reported by the guardrail as warnings.
- Reconcile nav, and document `.admin-btn` as the real compact button (§2.2, §2.3)

**Group D: hold the line**
- Extend `check-assets.mjs`, or add stylelint, to enforce: no hex outside token files, no
  radius outside the sanctioned set, no `text-transform: uppercase` on text containing "Edge8"
- Visual regression baselines per surface, so scale changes cannot silently reflow pages

Group C should precede any large mechanical pass in Group B, since deciding the scale changes
what the mechanical fix is.

---

## 6. Out of scope for this audit

Stated so the gaps are not mistaken for clean bills of health:

- **Accessibility** was not audited (contrast ratios, focus visibility, target sizes, reduced
  motion). Several findings touch it (10px uppercase tracked labels, `#9CA3AF` on white) but it
  needs its own pass.
- **Responsive behaviour** was not audited. All measurements are of declared rules, not
  rendered layouts at breakpoints.
- **Dark surfaces** were only audited incidentally.
- **`components/`** was searched but not reviewed component by component.
- Counts measure declared rules. Some may be dead code; none were verified as live.
