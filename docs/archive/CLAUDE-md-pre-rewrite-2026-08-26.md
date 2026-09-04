Do not make any changes until you have 95% confidence in what you need to build. Ask me follow-up questions until you reach that confidence.

Exception: operational runbooks in `.claude/skills/` (e.g. `crm-call-to-proposal`) are pre-approved. When a request matches one, execute it end to end without waiting for follow-up answers, then report. These flows are measured in minutes; do not spend time rediscovering what the skill already states.

## Brand rules (all pages, copy, commits)

- "Edge8" is always written exactly like that. Never all caps. Watch for CSS `text-transform: uppercase` on eyebrows and labels; keep the brand name out of it.
- Never use em dashes anywhere. Use commas, colons, periods, or parentheses.

## Design system

One system, two layers. Read the relevant layer before building any UI; do not invent values.

- **Foundations** (marketing site): `docs/product/edge8-design-system.md`
- **Data layer** (Edge8 OS: admin, team, client portal): `docs/product/edge8-design-system-data.md`
- **Known drift** between the docs above and the code: `docs/product/edge8-design-system-inventory.md`. Check it before "fixing" an inconsistency, it may already be catalogued, and before adding a variant of something it lists.
- Tokens live in `app/globals.css` `:root`. `app/admin/admin.css` re-roots onto them. The OS shell is shared: `/team` and `/portal` both import `admin.css` and render inside `.admin-shell`, so a change there hits all three views.
- Living component reference: `/admin/patterns`. Copy from it rather than hand-rolling a new card, table, or chip.
- Never introduce a raw hex, radius, shadow, or font family that isn't a token.
- **Typeface is Manrope**, open source (SIL OFL 1.1) and self-hosted from `public/fonts/`. Never load fonts from a third-party CDN, and never add a licensed font. Weights 200 to 800 are all real (variable font); nothing above 800.

### Guardrail

`npm run check:design` verifies that every asset referenced in CSS/JSX exists in `public/`, and that every `font-weight` used is backed by a real `@font-face`. It runs in CI on every PR. Run it before opening one.

Any new asset (font, image, icon) referenced in code must be committed in the same PR. A missing file does not fail the build: fonts silently substitute and images silently 404, which is exactly how the missing SemiBold shipped unnoticed for months.

## Sales ops (CRM + proposals)

- Call transcript in, then: CRM updated, proposal live, /proposals views correct. Runbook: `.claude/skills/crm-call-to-proposal/SKILL.md`. It carries verified Company OS IDs, table conventions, and the DB helper `scripts/crm/db.mjs`. Do not re-explore the schema.
- `app/proposals/page.tsx` (per-entry `status`) and `company_os.deals` move together: winning or losing a client updates both in the same session.
- Proposal pages are static files in `public/proposals/`; new ones start from `docs/templates/proposal-template.html`.

## Ship flow

- The checkout is usually on a WIP branch with uncommitted changes. Never build on it: `git worktree add` a branch from `origin/main`, stage only your files by name, open a PR, merge when CI is green.
- After merging, verify with `curl` against `https://www.edge8.ai/...` (the in-app browser blocks edge8.ai by policy) and reply with the live URL.
- The local checkout is often many commits behind. Always diagnose against `origin/main` (fetch first), never the stale working copy.

<!-- BEGIN: AGENT-DELEGATION (managed by infiniteleverage skills — do not delete this block) -->
## Agent delegation (auto-routing)

When you receive a request, **delegate to the right specialist agent** before doing the work yourself. The 8 agents and their triggers:

| Agent | Delegate when the request involves… |
|---|---|
| **product-manager** | roadmap, vision, epics, daily plan, project-status.html, scope changes, approval triage, stakeholder updates, standup briefings |
| **developer** | writing/changing code, fixing bugs, refactoring, scaffolding pages, API endpoints, Supabase migrations, env-vars wiring |
| **qa** | testing, regression checks, browser matrix, accessibility, QA plans, "verify this works" |
| **devops** | CI/CD, deployments, secret management, infra escalations, Vercel/GitHub workflow issues |
| **designer** | UI mockups, brand application, image prompts, design system updates, visual reviews |
| **writer** | blog drafts, social copy, SEO briefs, voice/tone, content briefs |
| **web-publisher** | publishing markdown → Next.js components, updating `website/pages/blog/index.jsx`, image optimization, the publish workflow |
| **email-marketer** | email drafts, sequences, broadcast campaigns, Brevo/Resend, CRM segmentation |

**Delegation rules:**
1. Pick exactly **one** agent per turn — don't run two in parallel unless the operator explicitly says so.
2. If a request spans agents (e.g., "write a blog *and* publish it"), call them **in sequence**: writer → designer → web-publisher.
3. If unclear which agent fits, **ask the operator** before assuming.
4. Cross-cutting engineering rules live in `.claude/rules/global-engineering.md` — every agent honors them.
5. Project-level persona overrides for each agent live in `agents/<name>/context/persona.md` — read these on first invocation.
6. Trigger phrases: `@product-manager`, `@developer`, etc. — but auto-route even without the `@` when intent is clear.
<!-- END: AGENT-DELEGATION -->
