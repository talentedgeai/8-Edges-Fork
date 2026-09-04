# Edge8 Design System — Data Layer (Extension)

**Status:** Draft, 2026-07-18
**Extends:** [edge8-design-system.md](edge8-design-system.md) (the Foundations layer)
**Applies to:** dense, data-heavy surfaces (the admin OS, dashboards, tables, portals). Not the marketing site.

---

## 0. How this layer relates to Foundations

There is **one** Edge8 design system. This document does not replace it; it extends it for surfaces the marketing spec never had to describe (tables, filter bars, KPI tiles, drawers, dense forms).

Two rules govern everything below:

1. **Root, don't redeclare.** Every data-layer token references a Foundations token wherever a suitable one exists. New raw values are introduced **only** where dense UI needs something Foundations genuinely does not provide, and each one carries a one-line reason.
2. **The "would it appear on marketing?" test.** If a value could show up on the public site (a blue, the body font, a focus ring), it lives in Foundations and this layer references it. If it never would (a 40px row height, a status chip, an overlay shadow), it belongs here.

**Namespace:** all data-layer tokens are prefixed `--data-*`.

> **Reconciliation note:** Foundations is documented with `--color-*` names but `app/globals.css` currently ships `--blue`, `--dark`, `--tint`, etc. Part of adopting this layer is aligning those. Below, "Foundations token" means the canonical brand value regardless of its current variable name.

---

## 1. Decisions locked for this layer

| Axis | Decision | Consequence |
|---|---|---|
| Font | **Manrope only**, brand-wide. No second UI font, no monospace. | Numeric alignment is handled with `tabular-nums`, not a mono typeface. Any existing JetBrains Mono / DM Sans usage is migrated out. |
| Dense buttons | **Compact rounded utility button** allowed as a documented exception. | The 40px pill stays mandatory for real CTAs. Toolbars/table actions may use an 8px rounded button. |
| Elevation | **Shadows on overlays only.** | Resting cards and sections stay shadow-free per Foundations. Drawers, modals, popovers, and sticky headers may cast shadow. |

---

## 2. Typography — compact scale

Manrope throughout. This layer only **adds smaller steps** on the same ramp and a numeric-alignment rule. It never introduces a new family.

| Token | Value | Use | Reason to exist |
|---|---|---|---|
| `--data-text-base` | `13px / 1.5` | Default data-surface body, table cells | Foundations' 16px body is too loose for dense grids |
| `--data-text-sm` | `12px / 1.4` | Secondary labels, meta, captions | Below Foundations' 14px floor |
| `--data-text-lg` | `15px / 1.4` | Emphasis rows, drawer body | Step between base and Foundations H4 |
| `--data-page-title` | `26px / 1.2`, Manrope Medium | Admin page H1 | Foundations H1 (80px) is a marketing display size |
| `--data-kpi` | `28px / 1.1`, Manrope Medium | KPI tile numerals | Stat callout at data scale |

**Numeric rule:** any cell, KPI, currency, or metric applies `font-variant-numeric: tabular-nums`. This replaces the need for a monospace font. Optional `letter-spacing: -0.01em` on long figures is permitted **only** on tabular numerics.

**Letter-spacing:** Foundations bans tracking. This layer keeps that ban for all prose and labels. The single allowed use is the `-0.01em` on tabular numerics above. Uppercase eyebrows are **not** reintroduced: data-layer section labels stay sentence/Title Case per Foundations.

---

## 3. Density & spacing

Same 4px base scale as Foundations. This layer adds compact tokens for data chrome only.

| Token | Value | Use |
|---|---|---|
| `--data-cell-pad` | `8px 12px` | Table cell padding |
| `--data-row-h` | `40px` | Default table row height |
| `--data-gap` | `8px` | Gap between dense controls (toolbar, chip rows) |
| `--data-section-pad` | `20px 24px` | Panel/card inner padding (vs Foundations 24–32) |

Content cards and full sections outside data grids continue to use Foundations spacing.

---

## 4. Radius

| Token | Value | Use | Source |
|---|---|---|---|
| Buttons (CTA) | `40px` pill | Real calls to action | Foundations, unchanged |
| `--data-btn-radius` | `8px` | Compact utility button (see §6) | New, data exception |
| `--data-radius` | `12px` | Tables, dense panels, data cards | New; Foundations 20px reserved for content cards |
| `--data-radius-sm` | `6px` | Chips, tags, small controls | New |
| Inputs | `8px` | Form fields | Matches Foundations input radius |
| Avatars / status dots | `50%` / pill | — | Foundations, unchanged |

Content cards (non-grid) keep Foundations' 20px.

---

## 5. Color

### 5.1 Brand (referenced, never redeclared)
- Interactive / links / primary accent → Foundations blue `#287BE8`
- Hover / pressed → Foundations `#1D6AD4`
- Positive decorative → Foundations mint `#6FF2C1`
- Body text → Foundations body gray `#797c82`
- Borders/dividers → Foundations `#A8B2BD` (strong) and a softer data line below

### 5.2 New data-only tokens

**Neutrals for data chrome** (brand grays — no navy tint):

| Token | Value | Use |
|---|---|---|
| `--data-canvas` | `#F1F3F5` | App background behind panels |
| `--data-surface` | `#ffffff` | Panels, cards, table body |
| `--data-surface-2` | `#F5F6F8` | Table head, zebra, insets |
| `--data-line` | `#E6E6E6` (brand card border) | Default hairline |
| `--data-ink` | `#101014` (brand near-black) | Primary data text |
| `--data-ink-2` | `#797c82` (brand body) | Secondary text |
| `--data-muted` | `#9CA3AF` | Tertiary / labels |

Dark chrome (sidebar) is brand near-black `#101014`, not navy.

**Status pairs** (bg + ink), rooted so `info` = brand blue family:

| Token | bg / ink | Meaning |
|---|---|---|
| `--data-ok-*` | `#d8f3e8` / `#157a5a` | Success |
| `--data-warn-*` | `#fbf0cf` / `#8a6a0f` | Warning |
| `--data-err-*` | `#fde4e4` / `#b0332f` | Error |
| `--data-info-*` | `#e2ecfd` / `#1d6ad4` | Info (brand-blue family) |

**Categorical chart ramp** — brand only (blue family + mint + near-black + grays), fixed order, chart-1 = brand blue. Identity is never color-alone; legends always carry label + value:

`--data-chart-1..7`: `#287BE8 #6FF2C1 #1D6AD4 #101014 #9CA3AF #3B8CF5 #6B7280`

> Legible to ~4 series; past that, hues necessarily converge — the honest cost of a two-hue brand. If a chart needs more distinct categories, split it or use small multiples rather than reaching for off-brand colors.

---

## 6. Compact utility button (the data exception)

The 40px pill remains mandatory for CTAs. For dense toolbars and table-row actions, this layer defines a smaller control:

```css
.data-btn {
  font-family: var(--font-body);   /* Manrope */
  font-size: 13px;
  font-weight: 600;
  padding: 8px 14px;
  border-radius: var(--data-btn-radius);  /* 8px */
  background: var(--data-surface);
  border: 1px solid var(--data-line);
  color: var(--data-ink);
  transition: background 0.2s ease, border-color 0.2s ease;
}
.data-btn:hover { border-color: var(--data-muted); }

.data-btn--primary {
  background: #287BE8;             /* Foundations blue */
  border-color: #287BE8;
  color: #fff;
}
.data-btn--primary:hover { background: #1D6AD4; }  /* Foundations hover */
```

Rule of thumb: **is it the primary action of a page or a marketing CTA? Pill. Is it a tool, filter, or row action? `.data-btn`.**

---

## 7. Elevation (overlays only)

Foundations stays shadow-free for resting cards and sections. This layer adds elevation **used exclusively by transient/floating surfaces**: drawers, modals, popovers, dropdowns, sticky table headers.

| Token | Value | Use |
|---|---|---|
| `--data-elevation-1` | `0 1px 2px rgba(4,16,45,.06), 0 1px 3px rgba(4,16,45,.08)` | Popovers, dropdowns, sticky header |
| `--data-elevation-2` | `0 6px 24px rgba(4,16,45,.10)` | Floating menus, hover cards |
| `--data-elevation-drawer` | `-24px 0 80px rgba(4,16,45,.28)` | Side drawer |
| `--data-elevation-modal` | `0 24px 80px rgba(4,16,45,.32)` | Modal |

Navy-tinted (`rgba(4,16,45,…)`) so shadows read as part of the brand rather than neutral gray. **A resting card must never carry these.**

---

## 8. New components (data layer only)

Specs to be authored here as they are formalized. Each references the tokens above:

- **Data table** — surface `--data-surface`, head `--data-surface-2`, row `--data-row-h`, cell `--data-cell-pad`, hairline `--data-line`, sticky head uses `--data-elevation-1`.
- **Filter / toolbar** — `.data-btn` controls, `--data-gap` spacing.
- **KPI tile** — `--data-kpi` numeral with `tabular-nums`, label `--data-text-sm`.
- **Status chip** — status pairs from §5.2, radius `--data-radius-sm`, no shadow.
- **Side drawer** — `--data-elevation-drawer`, radius `--data-radius`.
- **Dense form** — Foundations input (8px, focus blue), `--data-text-base` labels.

### 8.1 Hiring (manager view) — `.hire-*`

First formalized component set, shipped on `/team/hiring` and the interview kit. Additive over the OS shell (all values are `--admin-*` tokens, no raw hex/radius/shadow) and namespaced `.hire-*` so `/admin` and `/portal` are untouched. Other data-layer surfaces may adopt the same three patterns:

- **Day slot** (`.hire-slot`, `.hire-slot--{due,now,next,done}`) — a booked item with a state-coloured left rail and a tinted time tile (`.hire-slot-time`). Use for "here is one thing on your day, and how urgent it is". The rail colour is the state's chip ink (`--admin-warn-ink`, `--admin-accent`, `--admin-ok-ink`).
- **Grouped rubric** (`.hire-criteria` wrapping `.hire-criterion` rows: `.hire-criterion-label` + a compact `.hire-criterion-score` select + a `.hire-criterion-note` input) — a repeated label/value/note set reads as one bordered table, not a stack of loose fields.
- **Voice-tinted card** (`.hire-seat`, `.hire-seat--ai`) — peer records shown side by side; the AI/machine voice gets `--admin-info-bg` so it is legible as non-human at a glance.

---

## 9. Migration path for the admin OS

The admin already implements ~90% of this layer under `--admin-*` names. Adoption is a **re-rooting**, not a rebuild:

1. Re-point admin tokens at Foundations: `--admin-accent: <Foundations blue>`, etc., so admin *consumes* the brand instead of hardcoding it.
2. Rename/alias `--admin-*` to `--data-*` (or keep `--admin-*` as an alias that reads `--data-*`).
3. **Font:** replace DM Sans and JetBrains Mono with Manrope; apply `tabular-nums` on numeric cells/KPIs.
4. Collapse the duplicated per-page stage/status hex maps (deals, inquiries, revenue, jobs) into the §5.2 canonical tokens.
5. Keep the compact button, 12px data radius, and overlay shadows, now blessed by §4/§6/§7 instead of being undocumented divergence.

This closes every Section-B defect from the 2026-07-18 admin audit as a side effect, because the drift was mostly redeclared brand values.

---

## 10. What did NOT change

Foundations rules that this layer explicitly preserves:
- Manrope is the only UI font.
- 40px pill for all real CTAs.
- Resting cards and sections are shadow-free.
- No letter-spacing on prose or labels; no ALL-CAPS eyebrows.
- Blue `#287BE8` interactive, mint decorative-only.
- White/light canvas philosophy (the cooler `--data-canvas` is a data-surface tint, not a dark theme).
