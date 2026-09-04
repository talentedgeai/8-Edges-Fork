# Architecture Overview — Website vs. Core Application

**Repo:** edge8-web (single Next.js app, App Router)
**Last updated:** 2026-09-02

This repo ships two logically distinct products from one codebase: the public **marketing
website** (edge8.co) and the internal **core application** (Company OS admin/CRM, the staff Team
dashboard, the external Client Portal, and the client-facing tools that back them). There is no folder-level separation enforcing this
today — both live side by side under `app/` — so this doc exists to make the split explicit.

---

## Website

Public, unauthenticated, SEO- and lead-gen-oriented pages. Anyone can reach these without
logging in.

| Route | Purpose |
|---|---|
| `app/page.tsx` (root) | Homepage |
| `app/about` | Company/about page |
| `app/8-edges-app` | Marketing page for the open-source 8 Edges company OS (public, no auth; `app/8-edges-app/layout.tsx` only sets metadata) |
| `app/ai-programs` | AI programs marketing |
| `app/blog`, `app/post/[slug]` | Blog listing and article pages |
| `app/caio-leadership` | CAIO leadership program marketing |
| `app/careers` | Careers/job listings |
| `app/case-studies` | Case study pages |
| `app/contact` | Contact form (public) |
| `app/events` | Events listing |
| `app/global-staffing` | Global staffing marketing |
| `app/legal` | Terms, privacy, legal pages |
| `app/the-vietnam-experience`, `app/saigon-private`, `app/vietnam-adventure-flight-info`, `app/vietnam-adventure-info-form` | Retreat/event marketing and public intake forms |
| `app/training-and-certification` | Certification program marketing |
| `app/work` | Portfolio/work page |
| `app/your-first-ai-hire` | Campaign landing page |
| `app/reserve` | Public event reservation/booking pages |
| `app/unsubscribe` | Email unsubscribe page |
| `app/docs` | Public-facing documentation pages served from the docs API |

Characteristics: no auth required, optimized for SEO (`app/sitemap.ts`, `app/robots.ts`,
`app/opengraph-image.tsx` at the root), primarily content and lead capture.

---

## Core application

Internal tools and client-facing gated products that sit behind the marketing site — the
"Company OS." These are logged-in, transactional, or generated-and-shared-by-staff surfaces
rather than organic public traffic.

| Route | Purpose |
|---|---|
| `app/admin` (`app/admin/(auth)` + `app/admin/(dashboard)` route groups) | Company OS admin/CRM — the internal operations app, for allowlisted admins (requireAdmin) |
| `app/team` (`app/team/(auth)` + `app/team/(dashboard)` route groups) | Staff dashboard for employees and managers (requireTeamMember): coaching, client assignments, hiring, time off, chat. Admins with a linked team record can switch into it from the admin sidebar |
| `app/portal` (`app/portal/(auth)` + `app/portal/(dashboard)` route groups) | Client Portal for **external client contacts** (requirePortalMember), scoped to their portal_members companies; admins can "Assume" a client view via a server-tracked session |
| `app/checkout` | Transactional checkout flow (Stripe) |
| `app/proposals` | Client-facing proposal pages generated from the CRM |
| `app/surveys` | Survey forms tied to CRM data collection |
| `app/my-retreat` | Auth-gated retreat hub for clients (`app/my-retreat/MyRetreatGate.tsx`) |
| `app/private` | Private, client-specific portal instances (e.g. `app/private/bstore`) |
| `app/plans` | Internal planning/finance pages (e.g. retreats P&L) |
| `app/workflows` | Internal workflow documentation library (onboarding, invoicing, coaching programs, etc.), published for the team |
| `app/t/[code]` | Internal tracked-link redirector |

Characteristics: most routes are behind auth ((auth) route groups, portal gates), or are
generated/shared by staff rather than discovered organically, and read from or write to the same
backend (Supabase company_os) that powers the admin CRM.

### Surfaces

Three authenticated surfaces share one shell (`app/admin/admin.css`; the .admin-shell + .admin-main
classes) and one security model: the company_os schema has RLS enabled with no policies and no
browser grants, every read goes through the service-role client (`lib/supabase.ts`), and the guard
function called at the top of each surface's dashboard layout (`app/admin/(dashboard)/layout.tsx`,
`app/team/(dashboard)/layout.tsx`, `app/portal/(dashboard)/layout.tsx`) and of every server action
is the only boundary. Identity is matched on people.auth_user_id, never on email.

| Path | Who signs in | Guard function | Sidebar component |
|---|---|---|---|
| `app/admin` | Internal admins: users in company_os.admins or the ADMIN_ALLOWLIST env var | requireAdmin() in `lib/admin-auth.ts` (requireSuperAdmin() adds can_view_sensitive) | `components/admin/AdminSidebar.tsx` |
| `app/team` | Employees and managers with an active team_members row (status active, on_leave, notice, or pre_start) | requireTeamMember() in `lib/team-auth.ts` | `components/team/TeamSidebar.tsx` |
| `app/portal` | External client contacts holding at least one active portal_members row; admins only via a time-boxed "Assume" session | requirePortalMember() in `lib/portal-auth.ts` | `components/portal/PortalSidebar.tsx` |

The gates redirect across surfaces rather than overlapping: an admin without a team record is sent
from /team to /admin; an admin hitting /portal without an Assume session goes to /admin; an active
team member hitting /portal goes to /team. Design notes:
`docs/plans/2026-07-05-team-portal-design.md` and `docs/plans/2026-07-11-client-portal-design.md`.

---

## Shared infrastructure

- **`app/api`** — backend for *both* halves. Some routes are website-facing (`app/api/contact`,
  `app/api/careers`, `app/api/unsubscribe`, `app/api/vietnam-adventure-*`, `app/api/checkout`,
  `app/api/stripe`, `app/api/surveys`), others are core-application-only (`app/api/admin`,
  `app/api/team`, `app/api/portal`, `app/api/htt`, `app/api/qbo`, `app/api/cron`, `app/api/webhooks`,
  `app/api/ingest`, `app/api/assistant`). Don't assume a route under `app/api` belongs to one side just because a sibling
  page does — check what it's called from.
- **`app/layout.tsx`, `app/globals.css`** — shared root layout and design tokens used by both
  the marketing site and the core application.
- **`app/robots.ts`, `app/sitemap.ts`** — website-only, but live at the app root since Next.js
  requires them there.

## Notes on the split

A few routes are hybrid by nature and don't fit cleanly:

- **`app/reserve`** is public-facing (booking pages) but writes into the same CRM backend as the
  core application — categorized as website here because its audience is the public.
- **`app/docs`** serves documentation content publicly; it's grouped with the website because it
  has no auth, but the content it serves may originate from internal workflow docs.

## Known structural debt

The 2026-09-02 codebase review ([docs/engineering/2026-09-02-codebase-review.md](engineering/2026-09-02-codebase-review.md))
is the current inventory of what this layout costs. In short: authorization is per-function
convention (one forgotten guard call is a full-table exposure, and nothing in CI would notice);
styling is three systems at once (page-prefixed global CSS, `app/admin/admin.css`, and thousands of
inline `style={{}}` objects); and the three auth libs plus their LoginForm / chat widget / documents
list are near-copies of each other. Its "Deferred" list records what was consciously left alone —
collapsing the Shelf/Table components, merging the three auth libs, splitting the god components,
RPC transactions for multi-step writes, generated Supabase types, duplicate-timestamp migrations,
and error reporting — with the reason each one waits. Check that list before opening a refactor
so you are not re-deciding something the review already deferred.

This document reflects the routing structure as of 2026-09-02 (`app/` top-level listing). If new
top-level routes are added, extend the relevant table above rather than creating a new doc.
