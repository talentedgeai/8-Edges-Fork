# Design System for Edge8

## 1. Visual Theme & Atmosphere

Edge8 is an AI leadership and global talent consultancy. The website is a clean, light-mode experience built on a white canvas with soft cool-gray sections — a professional, approachable aesthetic that communicates clarity and structure. The brand's primary interactive color is a vivid electric blue (`#287BE8`) used for links, secondary CTAs, and highlights, balanced against a near-black (`#101014`) primary CTA. A mint-green accent (`#6FF2C1`) appears for decorative highlights and badges. The design is minimal, well-spaced, and content-forward — authority through restraint.

**Key Characteristics:**
- White canvas (`#ffffff`) as the dominant background — ~90% of surfaces
- Light cool-gray (`#EAEEF2`) for alternating sections, cards, and input fields — ~10%
- Near Black (`#101014`) as primary CTA background and headline text
- Electric Blue (`#287BE8`) as the brand accent, secondary CTA, and link color
- Mint Green (`#6FF2C1`) as a decorative / badge accent only
- Card border: `#E6E6E6` — softer than input borders, used on all card components
- Input / divider border: `#A8B2BD`
- Buttons: fully pill-shaped, `border-radius: 40px`, padding `16px 24px`
- Cards: `border-radius: 20px` — warm but precise
- Typography: Manrope Medium (headings) / Manrope Regular (body), no letter-spacing on prose (the section micro-label is the one exception)
- Section structure: Title Case eyebrow → Bold H2 → Sub-copy → Pill CTA
- Numbered step framework (01–08) with clean divider rows
- Testimonial cards in a horizontal scroll layout
- Photography: dark-background tech/AI imagery in hero; portrait grid for social proof

---

## 2. Color Palette & Roles

### Primary
- **Near Black** (`#101014`): `--color-primary-dark` — Primary CTA background, primary headline text
- **Electric Blue** (`#287BE8`): `--color-primary-blue` — Secondary CTA, links, active states, accent highlights, hover state for primary CTA
- **Deep Navy** (`#050F2E`): `--color-shadow-dark` — Reserved (no longer used for CTA shadows)

### Accent
- **Mint Green** (`#6FF2C1`): `--color-accent-mint` — Badge backgrounds, decorative highlights, eyebrow label accents (never for CTAs)
- **Deep Navy Alt** (`#050F2D`): Reserved (no longer used for CTA shadows)

### Background
- **White** (`#ffffff`): `--color-bg-primary` — Main page background (~90% of surfaces)
- **Light Gray** (`#EAEEF2`): `--color-bg-secondary` — Alternating sections, card surfaces, form inputs (~10%)

### Text
- **Near Black** (`#101014`): Primary headings (H1–H4) and high-emphasis text
- **Body Gray** (`#797c82`): `--color-text-body` — All body text (Body Large, Body, Body Small), card descriptions, captions, muted labels
- **Border Gray** (`#A8B2BD`): `--color-border` — Input and divider borders

### Semantic
- **Blue Interactive** (`#287BE8`): Links, focus rings, active nav states
- **Mint Positive** (`#6FF2C1`): Success badges, positive decorative indicators

---

## 3. Button System

Buttons are a defining trait of Edge8's UI — fully pill-shaped with carefully tuned directional shadows and inverting hover states.

### Shared Button Properties
- **Border-radius**: `40px` (fully rounded / pill shape — non-negotiable)
- **Padding**: `16px 24px` (Top 16 / Right 24 / Bottom 16 / Left 24)
- **Font**: 15px–16px, weight 600
- **Transition**: `background 0.3s ease` (crossfade — no shadow transition)

---

### Primary CTA — Black → Blue on hover

**Resting state:**
- Background: `#101014`
- Text: `#ffffff`
- Shadow: none

**Hover state:**
- Background: `#287BE8`
- Shadow: none
- Transition: crossfade (background fades smoothly via `0.3s ease`)

```css
.btn-primary {
  background: #101014;
  color: #ffffff;
  border-radius: 40px;
  padding: 16px 24px;
  font-weight: 600;
  box-shadow: none;
  transition: background 0.3s ease;
}
.btn-primary:hover {
  background: #287BE8;
}
```

---

### Secondary CTA — Blue → Black on hover

**Resting state:**
- Background: `#287BE8`
- Text: `#ffffff`
- Shadow: none

**Hover state:**
- Background: `#101014`
- Shadow: none
- Transition: crossfade (background fades smoothly via `0.3s ease`)

```css
.btn-secondary {
  background: #287BE8;
  color: #ffffff;
  border-radius: 40px;
  padding: 16px 24px;
  font-weight: 600;
  box-shadow: none;
  transition: background 0.3s ease;
}
.btn-secondary:hover {
  background: #101014;
}
```

---

### Ghost / Text Link
- Background: transparent
- Text: `#287BE8`
- Underline on hover
- No shadow

---

## 4. Typography Rules

### Font Stack
- **Headings and body**: `Manrope`, fallback: `Helvetica Neue`, `Arial`, `sans-serif`
- One family for everything. No second UI font, no monospace: numeric alignment
  uses `tabular-nums`.

> **Manrope is open source** (SIL Open Font License 1.1) and **self-hosted** from
> `public/fonts/`. No Google Fonts request, no third-party dependency, no licence
> to renew. The licence text ships alongside it as `MANROPE-OFL.txt`.
>
> **Weights 200 to 800 are all real.** Manrope is a variable font, so every step
> in that range is genuine font data rather than a browser approximation,
> including in-between values like 550 and 650. Do not use weights above 800:
> `npm run check:design` fails on any weight with no face behind it.
>
> It replaced SVN-Gilroy, a licensed family whose bold cut was never licensed or
> committed. The result was that every `font-weight` above 500 silently rendered
> as Medium for months, because a missing face falls back to the nearest weight
> in the same family instead of failing. Manrope was chosen partly on metrics:
> average advance width is within 1.6% of SVN-Gilroy, so the swap reflows
> existing layouts as little as possible.
>
> **Vietnamese is covered** by a dedicated subset. This is required for team and
> client names rendered from the database in the OS, not only for static copy.
- **Letter Spacing**: `none` (0) on all prose. The section micro-label is the one exception (see Labels).

| Role | Tag | Size | Line Height | Weight | Letter Spacing | Notes |
|------|-----|------|-------------|--------|----------------|-------|
| H1 — Display Hero | `h1` | 80px | 1.0 | Medium | none | "8x IMPACT" |
| H2 — Section Heading | `h2` | 48px | 1.2 | Medium | none | |
| H3 — Sub-heading | `h3` | 32px | 1.2 | Medium | none | |
| H4 — Feature Title | `h4` | 24px | 1.2 | Medium | none | Card/step titles |
| Body Large | — | 18px | 1.4 | Regular | none | Hero sub-copy |
| Body | — | 16px | 1.5 | Regular | none | General body, card text |
| Body Small | — | 14px | 1.5 | Regular | none | Captions, meta, footnotes |
| Button | — | 15px–16px | 1.0 | Medium | none | Pill CTAs |
| Nav Link | — | 15px | 1.0 | Regular | none | |

> **Important:** Do not apply `letter-spacing` to prose: not headings, body copy, buttons, or the pill eyebrow. This remains a firm rule.
>
> **The one exception is the section micro-label** (see Labels below), which is uppercase with light tracking by design. Tracking is what makes uppercase legible at 12px, so the two travel together and only there. A second, narrower exception is `-0.01em` on long tabular numerics in the data layer.

---

## 5. Component Stylings

### Cards
- Background: `#ffffff` (on gray sections) or `#EAEEF2` (on white sections)
- Border: `1px solid #E6E6E6`
- Border-radius: `20px`
- Padding: `24px–32px`
- Shadow: none at rest; `0 4px 16px rgba(16, 16, 20, 0.08)` on hover
- Hover: border-color shifts to `#287BE8`, subtle shadow appears

### Testimonial Cards
- Background: `#EAEEF2`
- Border: none
- Border-radius: `20px`
- Padding: `24px`
- Stars: `#101014`
- Quote text: 16px (Body), `#797c82`
- Name: 24px (H4), Manrope Regular, `#101014`
- Role / Company: 14px (Body Small), `#797c82`
- Avatar: circular, 40px–48px

### Step Items (01–08 Framework)
- Layout: full-width rows separated by `border-bottom: 1px solid #A8B2BD`
- Step number: `#287BE8`, 13px–14px, weight 600, uppercase, letter-spacing 1px
- Title: 18px–20px, weight 600, `#101014`
- Expand icon: `↓` chevron, `#797c82`, rotates on expand
- Hover: step title color shifts to `#287BE8`

### Metric / Stat Callouts ("x2", "x5", "x8")
- Numeral: 48px–64px, weight 800, color `#101014`
- Category label: 11px–12px, weight 600, uppercase, `#287BE8`, letter-spacing 2px
- Description: 14px (Body Small), `#797c82`

### Labels

There are **two** label styles. They are not interchangeable.

**1. Pill eyebrow**: frames a marketing section, sits directly above a heading.
- Background: `#EAEEF2` (solid light gray — always)
- Text: `#797c82`, 14px (Body Small), Manrope Regular, **no letter-spacing**
- Border: none
- Border-radius: `40px` (pill — mirrors button language)
- Padding: `4px 12px`
- Casing: **Title Case**, never uppercase
- Classes: `.section-label`, `.hero-eyebrow`

**2. Section micro-label**: groups a run of cards or rows under a small heading. This is the
dense-surface counterpart to the pill, and the **only** sanctioned uppercase text in the system.
- Text: 12px, weight 600, uppercase, `letter-spacing: 0.5px`, color `--admin-muted`
- No background, no border
- Margin: `26px 0 12px`
- Class: `.admin-section-label` (`app/admin/admin.css`). `.team-hub-heading` is kept as an alias
  for older markup; do not use it in new code.
- Surfaces: use it on **all three** OS surfaces (admin, `/team`, `/portal`), not just one, so the
  OS reads as one product.
- Variant: `.admin-shelf-heading` is the same label with a flex row for a trailing action (a
  "View all" link, a count). It is used in ~44 admin places and now matches on size, differing only
  by 0.1px of tracking. Treat it as the same component.
- Uppercase and tracking travel together here: the tracking is what keeps caps legible at 12px.
  Do not use uppercase without it, or apply either to any other element.

**When to use which.** Marketing section, above a big heading → pill. Grouping cards or rows in
the OS → micro-label. **Never put a micro-label directly above a single card that already carries
its own `.admin-card-title`**; that titles the same thing twice. Group two or more cards, or omit
it.

> The brand name is the hard exception to all of this: "Edge8" is never rendered in caps. A label
> containing it takes the `.brand-label` utility, which opts that one label out of the transform.

### "Tech-Forward" Definition Block
- Eyebrow: Body Small, `#797c82`
- Term: large heading weight, color `#287BE8` (brand blue on the defined word)
- Pronunciation: Body, `#797c82`
- Definition: 18px (Body Large), `#797c82`

### Navigation
- Background: `#ffffff`
- Border-bottom: none
- Logo: near-black `#101014`
- Nav links: 16px (Body), `#797c82`, hover `#287BE8`
- CTA button: Primary pill style (black background)
- Sticky behavior: stays white, no blur needed

### CTA Banner Section (Full-bleed Blue)
- Background: `#287BE8` (solid electric blue)
- Heading: `#ffffff`, large weight
- CTA button: Primary pill style — inverted to black `#101014` background for contrast
- Supporting imagery: colorful photography mosaic arranged as decorative right-side panel

### Form / Input Fields
- Background: `#ffffff`
- Border: `1px solid #A8B2BD`
- Border-radius: `8px`
- Focus border: `#287BE8`
- Placeholder text: `#A8B2BD`
- Label: 13px, weight 600, `#101014`
- Submit button: Primary pill CTA style

---

## 6. Layout

### Spacing Scale
```
1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 56, 64, 80, 96, 120, 140, 160   (px)
```
Fine steps (1 to 18) are for dense OS chrome: hairline margins, icon gaps, chip padding,
table cells. Medium (20 to 40) for card and panel padding. Coarse (48 to 120) for page
sections; 140 and 160 only as the upper bound of a hero `clamp()`.

**Why 2px steps and not a 4px grid.** The 4px grid this doc used to specify was never
followed: 37% of spacing declarations sat off it, and the heaviest offenders were 10px
(143 uses), 6px (95) and 14px (43), all deliberate dense-UI values. Snapping them to a 4px
grid would have moved roughly 650 declarations for no visible gain, and would have broken the
two canonical card paddings (`18px 20px` and `16px 18px`). The scale above was derived from
what the product actually uses: **90% of existing declarations already sit on it.**

### Type Scale
```
11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 32, 40, 48, 56, 64, 80   (px)
```
11 to 16 for OS and dense UI, 18 to 26 for body, card and page titles (22 and 26 are the
`--admin-text-title` and `--admin-text-page` ramp steps), 28 and up for display.

**11px is the floor.** Nothing smaller ships; below that is a legibility problem, not a design
choice.

**No half-steps.** 12.5 and 13.5 are not perceivable as deliberate steps, they are the residue
of nudging components one at a time. 177 such declarations across 8 values were snapped to the
nearest step (ties resolved downward, which also reconciled `.admin-btn` with its documented
13px). Distinct type sizes went from 38 to 30, and on-scale conformance from 65% to 88%.

**Enforcement.** `npm run check:design` reports every off-scale value with a count. It warns
rather than fails, because an off-scale value is a design smell rather than a broken build.
On 4 Sep 2026 every stylesheet was snapped to the scales (352 declarations, ties resolved
downward), so the report is empty; a `scale-ok: reason` comment on a line exempts a
deliberate outlier such as the 400px decorative quotation glyph.

### Grid
- Max-width: `1200px`
- Gutter: `24px–32px`
- Columns: 12-column grid
- Section padding: `64px–100px` vertical

### Border-Radius Scale
- Badges / tags / pills: `40px` (matches button radius)
- Buttons: `40px` (pill — always)
- Cards / modals: `20px`
- Input fields: `8px`
- Avatars: `50%`

### Card & Component Border Color
- Default border: `#E6E6E6` — used on all cards, testimonials, and component containers
- Interactive/input border: `#A8B2BD` — used on form inputs and dividers
- Hover border: `#287BE8`

### Breakpoints
- Mobile: `< 480px`
- Tablet: `480px–768px`
- Desktop: `768px–1024px`
- Wide: `> 1024px`

---

## 7. Depth & Shadow System

Edge8's shadow system is intentionally restrained — the light-mode design relies on borders and whitespace for separation. Shadows are reserved primarily for CTA buttons as a tactile interaction cue.

| Level | Usage | CSS Value |
|-------|-------|-----------|
| None | Cards at rest, sections, nav, all CTA buttons | `none` |
| Card hover | Interactive cards | `0 4px 16px rgba(16, 16, 20, 0.08)` |

---

## 8. Photography & Visual Style

**Hero imagery**: Dark-background tech and AI scenes — people collaborating with holographic or digital displays. Communicates sophistication and forward-thinking without sci-fi clichés. Full-bleed or contained in rounded cards.

**Social proof portraits**: Subjects on dark teal/green backgrounds, business-casual, cropped to head-and-shoulders. Arranged in a horizontal testimonial carousel.

**CTA section mosaic**: Vivid, colorful product and lifestyle photography arranged in a right-side grid panel against the solid blue CTA background. This is the only zone where saturated, varied colors are permitted — purely decorative contrast.

**Rules:**
- Hero images: dark background, high contrast, tech-relevant
- Portrait photos: consistent dark backdrop, tight crop, confident expression
- CTA mosaic: vivid and varied — the energy contrast is intentional
- Image containers within content sections: `border-radius: 12px`
- Never place light-background photography in the hero

---

## 9. Interaction & Motion

- Hover transitions: `0.3s ease` for background crossfade on buttons; `0.2s ease` for color on links/nav
- Button hover: background crossfade `0.3s ease` — no shadow, no scale or translate
- Step rows: expand/collapse with `↓` chevron rotation on click
- Card hover: border shifts to `#287BE8`, subtle shadow appears
- Testimonial carousel: horizontal scroll with left/right arrow controls
- Section reveals: `fadeInUp` — `translateY(12px) → 0`, opacity `0 → 1`, duration `350ms`
- Tone: clean and restrained — no aggressive animations

---

## 10. Voice & Messaging Patterns

Edge8's copy pairs bold claims with structured proof:

- **Eyebrow** (Title Case label): frames context — "Be Tech-Forward", "Why Do I Need An AI Program?"
- **Heading**: punchy, outcome-first — "8x IMPACT", "Ad-hoc Usage of AI Is Limiting You"
- **Sub-copy**: problem → Edge8's solution, 2–3 sentences max
- **CTA**: pill button with clear action verb — "Schedule A Consultation", "Join A Workshop"

**Section Structure (strictly followed):**
```
Title Case Eyebrow Label
↓
Bold H2 Heading
↓
Body sub-copy (16px–18px)
↓
Pill CTA Button (primary or secondary)
```

Tone patterns:
- Bold claim with metric: "8x IMPACT"
- Problem-first: "Ad-hoc usage of AI is limiting you to minimal gains"
- Dictionary authority: "Tech-Forward /ˈtɛk ˈfɔrwərd/ (adjective)"
- Proof via numbers: "x2 / x5 / x8" stat blocks before descriptions

---

## 11. Do's and Don'ts

**Do:**
- Use `#101014` for primary CTAs and `#287BE8` for secondary CTAs — always maintain this distinction
- Use `#797c82` for all body text, captions, card descriptions, badge labels, and nav links
- Use `#101014` only for headings (H1–H4) and high-emphasis standalone text
- Keep backgrounds predominantly white `#ffffff`; use `#EAEEF2` only for visual section breaks
- Use `border-radius: 40px` pill shape on all buttons — this is non-negotiable
- Use `border-radius: 20px` on all cards and component containers
- Use `#E6E6E6` for all card and component borders; `#A8B2BD` for input and divider borders
- Use `#EAEEF2` fill with no border for all badges and eyebrow labels
- Remove the bottom border from the navigation bar
- Use Manrope Medium for all headings (H1–H4), Manrope Regular for body and testimonial names
- Follow section structure exactly: Title Case eyebrow → Bold H2 → Sub-copy → Pill CTA
- Set letter-spacing to `none` (0) on all elements — never apply tracking
- Keep H1 at 80px/1.0, H2 at 48px/1.2, H3 at 32px/1.2, H4 at 24px/1.2

**Don't:**
- Use dark or colored backgrounds for general page sections — light-mode only
- Use mint green `#6FF2C1` as a CTA or primary interactive color — decorative/badge use only
- Round buttons below `40px` or cards below `20px`
- Apply `letter-spacing` to any text — not headings, labels, or body
- Apply drop shadows to cards, sections, or CTA buttons — the design is shadow-free throughout
- Use the blue `#287BE8` as a large background surface (except the designated full-bleed CTA banner)
- Place two CTAs of the same type (both black or both blue) side by side — always contrast them
- Use ALL CAPS for eyebrow labels — use Title Case instead

---

## 12. Agent Prompt Guide

When generating UI, copy, or layouts for Edge8, apply these defaults:

- **Page Background**: White `#ffffff` (~90%) / Light Gray `#EAEEF2` (~10%)
- **Heading Text**: Near Black `#101014` (H1–H4 only)
- **Body Text**: `#797c82` — all body copy, captions, muted labels, card descriptions
- **Primary CTA**: Background `#101014`, text `#ffffff`, radius `40px`, padding `16px 24px`
- **Primary CTA Hover**: Background `#287BE8`, no shadow, crossfade `0.3s ease`
- **Secondary CTA**: Background `#287BE8`, text `#ffffff`, radius `40px`, padding `16px 24px`
- **Secondary CTA Hover**: Background `#101014`, no shadow, crossfade `0.3s ease`
- **Accent — Interactive**: Blue `#287BE8`
- **Accent — Decorative**: Mint `#6FF2C1` (use sparingly, never for CTAs or badges)
- **Badge / Eyebrow Label**: Background `#EAEEF2`, text `#797c82` (Body Small, 14px, Manrope Regular), no border, radius `40px`
- **Navigation**: No border-bottom. Nav links: 16px (Body), `#797c82`, hover `#287BE8`
- **Testimonial Card**: Background `#EAEEF2`, no border, radius `20px`. Stars `#101014`. Quote 16px/`#797c82`. Name H4/Manrope Regular/`#101014`. Role Body Small/`#797c82`
- **Card Border**: `#E6E6E6`
- **Input / Divider Border**: `#A8B2BD`
- **Font Heading**: Manrope Medium — H1: 80px/1.0 · H2: 48px/1.2 · H3: 32px/1.2 · H4: 24px/1.2
- **Font Body**: Manrope Regular — Large: 18px/1.4 · Body: 16px/1.5 · Small: 14px/1.5
- **Letter Spacing**: none (0) on all prose; the section micro-label is the one exception
- **Button Radius**: `40px` (pill — always)
- **Card Radius**: `20px`
- **Tone**: Clean, authoritative, metric-driven, professional
- **Section structure**: Title Case Eyebrow → Bold H2 Heading → Sub-copy → Pill CTA button
