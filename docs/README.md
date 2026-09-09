# Edge8 — Documentation Index

**Project:** Edge8 (edge8.co)
**Stack:** Next.js · React · Vercel
**Owner:** Dave Hajdu
**Last updated:** 2026-05-18

> **Visual dashboard:** [`project-status.html`](./project-status.html) — open in a browser for a navigable view of the headline docs.

---

## Product

High-level product vision, thematic epics, status dashboard, and the phased roadmap. Start with `product.md`.

| Document | Contents |
|---|---|
| ⭐ [Four Offices of the Future](./product/four-offices-of-the-future.md) | **North‑star.** The org operating model (Revenue · Talent · Operations · Innovation) and how the Company OS / `/admin` CRM embodies it — shared people spine, per‑office role lenses, persona mapping, nested‑by‑office IA, agentic substrate. Read before building any admin screen. |
| [Human Tokens & Infinite Leverage](./product/human-tokens-infinite-leverage.md) | The *why* and unit of measure behind the offices — human tokens (1 hr human work) vs AI tokens, the AI Token Ratio (leverage). Companion to the north‑star. |
| [Product](./product/product.md) | What Edge8 is, audiences (ranked), values, business model, moat, the next 90 days. |
| [Epics](./product/epics.md) | Six thematic epics — Services, Case Studies, Culture/About, **Careers and Talent Network (new)**, Content, Lead Conversion. |
| [Epic Status](./product/epic-status.md) | At-a-glance dashboard — pipeline glyphs and % estimate per epic. |

---

## Architecture

System design, data, and workflow documents.

| Document | Contents |
|---|---|
| [Architecture Index](./architecture/README.md) | Map of plans, workflows, data, and templates |
| [`architecture/plans/`](./architecture/plans/) | Build plans |
| [`architecture/workflows/`](./architecture/workflows/) | Agent workflow diagrams and walkthroughs |
| [`architecture/readings/`](./architecture/readings/) | Domain data and encoders |
| [`architecture/templates/`](./architecture/templates/) | CLAUDE.md templates, settings templates, bootstrap prompts |

---

## Engineering

Operational engineering material — sprint handoffs, change records, gap analyses, setup prompts.

| Document | Contents |
|---|---|
| [Engineering Index](./engineering/README.md) | Conventions for changes, sprints, prompts, gap analyses |
| [`engineering/changes/`](./engineering/changes/) | Per-change subfolders (PLAN, CHANGELOG, QA_REPORT, EXEC_SUMMARY) |
| [`engineering/sprints/`](./engineering/sprints/) | Sprint handoffs |
| [`engineering/prompts/`](./engineering/prompts/) | Setup prompts |

---

## Features

Per-feature proposals and design docs. Folder convention is `features/<slug>/feature-proposal.md` first; `system-design.md` and `database-design.md` follow once approved.

| Document | Contents |
|---|---|
| [Features Index](./features/README.md) | Convention, active features |

---

## QA

Quality plan, regression reports, and test findings.

| Document | Contents |
|---|---|
| [QA Plan](./qa/qa-plan.md) | _(TBD)_ Forever QA plan — tiered pyramid and cadence |
| _Regression reports_ | Convention is `qa/YYYY-MM-DD-qa-report.md` |

---

## Brand

Brand assets — palette, voice, imagery library.

| Document | Contents |
|---|---|
| [Brand Index](./brand/README.md) | Palette, logo notes, voice principles, image-library pointer |

---

## Archive

Historical and superseded material. Kept for reference; do not rely on without re-checking against current docs.

| Folder | Contents |
|---|---|
| [`archive/architecture-obsolete/`](./archive/architecture-obsolete/) | Older architecture and prompt drafts |
| [`archive/marketing/`](./archive/marketing/) | Legacy marketing material |

---

## How to use this index

- New to the project? Read [`product/product.md`](./product/product.md), then [`product/01-product-timeline.md`](./product/01-product-timeline.md), then come back here.
- Looking for current status? Open [`project-status.html`](./project-status.html) in a browser, or read [`product/epic-status.md`](./product/epic-status.md).
- Starting work on a feature? Read [`features/README.md`](./features/README.md) for the convention before creating files.
- Adding architecture material? Read [`architecture/README.md`](./architecture/README.md) — and ask whether it's really architecture vs. a feature design.
