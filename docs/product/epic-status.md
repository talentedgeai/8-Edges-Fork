# Edge8 — Epic Status Dashboard

**Last updated:** 2026-05-18
**Phase in flight:** Site improvements and careers page launch

Status glyphs: 🔄 in flight · ✅ done · ⏳ partially done · ☐ planned · 🛑 paused

---

## At a glance

| Epic | Status | % done (est) | Notes |
|---|---|---|---|
| [E1 · Services](./epics.md#e1--services) | ✅ | 90% | All 6 service pages live; missing case-study cross-links and per-page conversion tracking |
| [E2 · Case Studies](./epics.md#e2--case-studies) | ⏳ | 40% | 3 case studies live; `[slug]` route works; no `/case-studies/` index page; need ≥ 3 more published |
| [E3 · Culture and About](./epics.md#e3--culture-and-about) | ✅ | 85% | About page live with story, partners, mission, contact; could add lineage callouts on service pages |
| [E4 · Careers and Talent Network](./epics.md#e4--careers-and-talent-network--new--added-2026-05-18) | ☐ | 0% | **Today's new epic.** Page does not exist. Target launch 2026-06-15. |
| [E5 · Content and Insights](./epics.md#e5--content-and-insights) | ✅ | 80% | Blog live, 24 posts published; no editorial calendar; SEO not instrumented |
| [E6 · Lead Conversion](./epics.md#e6--lead-conversion) | ⏳ | 60% | Typeform CTA live on every page; no end-to-end funnel measurement; no attribution by source page |

---

## Drilldown

### E1 · Services — ✅ 90%

**What's done:** All six service pages live at their canonical routes. Nav dropdown groups them. Each page has a Typeform CTA.

**What's missing:** Per-page conversion tracking. Cross-links from service pages to relevant case studies (e.g., AI Programs page should link to Wink Hotels / Veracity / Kyungbang case studies).

**Definition of done:** Each page produces ≥ 1 booked consultation per month from organic traffic by Q3 2026.

---

### E2 · Case Studies — ⏳ 40%

**What's done:** Three case studies (Kyungbang, Veracity, Wink Hotels) featured on home. `/case-studies/[slug]` dynamic route exists and renders.

**What's missing:**
- `/case-studies/` index / listing page — does not exist
- Additional case studies — only three published
- Cross-links from service pages
- "Cite which case study brought you" field on the Typeform

**Definition of done:** ≥ 6 case studies live; index page exists; ≥ 30% of consultation bookings cite a specific case study.

---

### E3 · Culture and About — ✅ 85%

**What's done:** `/about` page live with Dave's story, mission, four partner cards, contact section (email, VN phone, US phone, LinkedIn).

**What's missing:** Lineage callouts (Microsoft, TINYpulse) surfaced on service pages where relevant. Optional: short video intro on About.

**Definition of done:** About is the second-most-visited page after home (behind one top service page) by Q3 2026.

---

### E4 · Careers and Talent Network — ☐ 0%

**Today's new epic.** Page does not exist.

**What's missing:** Everything.

**Definition of done:** Page live by 2026-06-15. ≥ 25 qualified applications within 30 days of launch. ≥ 2 placements traceable to the careers page within Q3 2026.

**Open questions before build:**
1. Application form: Typeform or in-house? (Recommend Typeform v1.)
2. Open roles: hard-coded list or sourced from a Notion / Airtable? (Recommend Notion → JSON for v1.)
3. Brand voice: English-only v1 or Vietnamese version at launch? (Recommend English-only v1; revisit after first 25 applications.)

---

### E5 · Content and Insights — ✅ 80%

**What's done:** `/blog` and `/post/[slug]` live. 24 posts published. Posts are linked from home page footer block.

**What's missing:** Editorial calendar. SEO instrumentation. Tracking which posts drive consultations vs. which drive talent applications.

**Definition of done:** ≥ 1 booked consultation per month attributable to organic blog traffic by Q4 2026.

---

### E6 · Lead Conversion — ⏳ 60%

**What's done:** "Schedule A Consultation" Typeform linked from nav, hero, service pages, and footer. Single CTA across the site.

**What's missing:** End-to-end measurement (Typeform → calendar → discovery call → signed engagement). Source-page attribution. No CRM of record (Notion? HubSpot? TBD).

**Definition of done:** ≥ 70% of Typeform submissions become discovery calls; ≥ 30% of discovery calls become signed engagements by Q4 2026.

---

## How to update this file

When an epic moves status (☐ → 🔄 → ⏳ → ✅), update the row in the table and the drilldown section. Do not delete drilldown sections for completed epics — leave them with the closing date so we keep institutional memory.
