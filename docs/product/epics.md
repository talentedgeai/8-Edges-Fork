# Edge8 — Epics

**Last updated:** 2026-05-18

Thematic bundles of work. Each has a thesis, what is in the bundle, the mechanism by which it earns its place, and the success criterion that says "this epic is done."

For the strategy these epics serve, read [`product.md`](./product.md).

---

## E1 · Services

**Thesis:** The six service pages are the conversion surface for the consulting business. Each one has to answer one buyer's question in two minutes or less.

**Bundle:**
- `/your-first-ai-hire`
- `/ai-capabilities-audit`
- `/caio-leadership`
- `/global-staffing`
- `/training-and-certification`
- `/ai-programs`

**Mechanism:** Each page is a single offer with a single CTA (Typeform consultation). No multi-step funnels. The page either books a meeting or it doesn't.

**Success criterion:** Each service page produces ≥ 1 booked consultation per month from organic traffic by Q3 2026.

---

## E2 · Case Studies

**Thesis:** Case studies are the credential. Consulting buyers do not buy on framework; they buy on proof.

**Bundle:**
- `/case-studies/` index page (does not exist yet)
- Individual case study pages at `/case-studies/[slug]` (route exists, three live: Kyungbang, Veracity, Wink Hotels)
- Cross-links from every service page to relevant case studies
- Featured-case-studies block on home (already live)

**Mechanism:** Case studies convert when buyers can find them. Today they are only discoverable from the home page. The index page makes them browsable. The cross-links make them contextual.

**Success criterion:** ≥ 6 published case studies; index page live; ≥ 30% of consultation bookings cite a specific case study in the Typeform.

---

## E3 · Culture and About

**Thesis:** Mid-market founders buy from people, not firms. The about page is where Dave's lineage does the trust-building before the consultation.

**Bundle:**
- `/about` (live) — Dave's story, mission, partners, contact
- Lineage callouts (Microsoft, Vinasource, TINYpulse) surfaced where credible
- Partner cards (David Niu, Eric Enriquez, Jeff Hu, Bin Yu)
- Contact surface (VN + US numbers, email, LinkedIn)

**Mechanism:** The buyer reads About before they book. About has to do the work of "do I trust this person with my company's AI strategy?"

**Success criterion:** About is the second-most-visited page after home (behind only one service page) by Q3 2026.

---

## E4 · Careers and Talent Network *(new — added 2026-05-18)*

**Thesis:** The Global Staffing pillar needs a candidate funnel. Today, candidates come through Mai Dang's outbound recruiting. A public careers page turns inbound into a sourcing channel and reinforces Edge8 as a serious staffing operation.

**Bundle:**
- `/careers` landing page — pitch to Vietnam-based AI talent
- "Join Our Talent Network" application form (Typeform or in-house)
- Featured open roles section (sourced from active client placements)
- "Why Edge8 over a local employer" content block
- Cross-link from `/global-staffing` page ("we hire talent through →")

**Mechanism:** A public surface accomplishes three things at once: (1) gives Mai Dang a permanent inbound funnel, (2) signals to clients that Edge8 has bench depth, (3) creates a content asset for LinkedIn recruiting campaigns.

**Success criterion:** ≥ 25 qualified applications within 30 days of launch (by 2026-07-15). ≥ 2 placements traceable to the careers page within Q3 2026.

**Out of scope this epic:**
- ATS integration (manual Typeform → Notion pipeline is fine for v1)
- Internal Edge8 full-time hiring (different audience, different page if ever)
- Multi-language (Vietnamese version is a v2 if v1 validates)

---

## E5 · Content and Insights

**Thesis:** The blog feeds the funnel. It is not the business, but without it organic discovery stalls.

**Bundle:**
- `/blog` index (live)
- `/post/[slug]` individual posts (live)
- 24 posts published; cadence is informal
- Cross-promotion via LinkedIn, partner networks
- SEO targeting around "AI Officer", "Tech-Forward", "global AI staffing"

**Mechanism:** Posts that rank for buyer-intent queries drive consultation bookings. Posts that rank for talent-intent queries feed the careers page (E4).

**Success criterion:** ≥ 1 booked consultation per month attributable to organic blog traffic by Q4 2026.

---

## E6 · Lead Conversion

**Thesis:** One CTA, one funnel, measured end-to-end. The Typeform consultation booking is the single conversion event on the entire site.

**Bundle:**
- "Schedule A Consultation" Typeform (live, links from every page)
- Calendar booking after Typeform (Calendly or equivalent)
- Discovery call (Dave personally)
- Post-call follow-up + proposal
- Attribution: which page, which case study, which service drove the booking

**Mechanism:** Single funnel = legible funnel. We can see exactly where prospects drop off and where they convert.

**Success criterion:** ≥ 70% of Typeform submissions become discovery calls; ≥ 30% of discovery calls become signed engagements by Q4 2026.

---

## What we are not bundling

- No "social product" epic (we are a services firm, not a community)
- No "SaaS product" epic (AI Officer Institute is the adjacent productized brand, not Edge8)
- No "mobile app" epic (the site is the surface)
- No "internal hiring page" epic (different audience; revisit only if Edge8 needs to scale its own headcount)

If a feature is being designed and it would fit better in one of those bundles, we are drifting.
