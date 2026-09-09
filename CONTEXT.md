# edge8-web — ubiquitous language

The glossary for the product and its architecture. Terms only; implementation lives in
`docs/engineering/` and decisions in `docs/adr/`.

## Architecture terms

**Entity** — The unit of installation. One folder under `entities/`, one manifest entry,
one set of owned tables, two doors. An entity is either present in a deployment or absent;
there is no smaller switchable unit. Replaces the earlier "module" concept, which was a
sub-division inside an entity and is retired.

**Kernel** — Shared code every entity may use and no entity owns: identity, data access,
messaging, audit, config, UI primitives, AI helpers, and the shells. The kernel knows no
entity by name.

**Door** — An entity's public import surface: `index.ts` for the server and `client.ts` for
the browser. The only paths another entity or the composition root may import.

**Mandatory set** — The entities every deployment must include. Currently the kernel and
Contacts. Other entities may hard-depend on the mandatory set without declaring it.

**Optional entity** — Any entity outside the mandatory set. May be absent from a deployment.

**Catalogue** — `entities.manifest.json`: every entity that exists in the repo, its tables,
and its hard dependencies. Describes what *can* be installed.

**Deployment file** — The build-time list of which catalogue entities one deployment
includes. One deployment serves one client; there is no per-tenant switching at runtime.
Must be closed under hard dependencies.

**Self-hosted** — The client runs their deployment on their own Vercel and Supabase accounts
and owns the code copy and the data. Edge8 supports on request and never operates it.

**Upstream** — Edge8's private repository, where the code is made right first. Clients never
see it.

**Product repository** — The separate repository clients can access. Edge8 hand-ports chosen
portable entities into it per release. Nothing is automated between upstream and product.

**Portable** — An entity Edge8 may port to the product repository. A portable entity never
requires an internal one.

**Internal** — An entity that stays in upstream: Edge8's own business, or work not yet
released.

**Port** — Copying one or more portable entities from upstream into the product repository,
by hand, after deciding exactly what goes.

**Install** — Taking a fresh copy of the code, a deployment file and a new Supabase project
to a running instance, by following the generated setup checklist.

**Layer** — An entity's position in the dependency order, derived from its hard dependencies
rather than assigned by hand. The kernel is the floor; the mandatory set sits on it.

**Hard dependency** — Entity A *requires* entity B when A's feature is meaningless without
B. Declared in the manifest. A may import B's doors directly. A deployment that includes A
must include B.

**Soft effect** — Something that happens in entity B *because* of an action in entity A,
where A remains meaningful without B. Expressed as an event A emits and B subscribes to.
A never imports B for a soft effect.

**Event** — A named, past-tense fact one entity publishes (`coaching.session.completed`).
Handlers run in-process during the same request; a handler failure is logged and never
fails the publisher.

**Surface** — An area of the product with its own shell: Public, Admin, Team hub, Portal. A surface
is not an entity and owns no tables.

**Shell** — The kernel-owned frame of a surface: layout, sidebar, guard, home page. A shell
renders whatever the installed entities contribute.

**Contribution** — What an entity offers to a shell: navigation items, dashboard cards and
detail-page tabs, each with a group, a weight and a role-based visibility. Pages are
contributed by placement, not registration: a file under the entity's `routes/<surface>/`
tree. The entity that owns a table owns every contribution that writes it.

**Public shell** — The kernel-owned frame for the unauthenticated web: home, sign-in, auth
callback. Site, when included, contributes the marketing home in place of the default.

**Entity environment** — The environment variables an entity declares in the catalogue.
A deployment validates the union over its included entities and nothing more.

**People** — A kernel table, not an entity's. Identity needs it to resolve who is signed in,
so the kernel keeps the writer and Contacts is the screen owner over it.

**Composition root** — `app/`. The only place that knows which entities a deployment
includes; it registers their contributions and mounts their routes, APIs and crons.

## Product terms

**Contacts** — The entity holding people, companies and brands, and the relationships between
them. Mandatory, because every other entity hangs data off a person or a company.

**Company OS** — Historical name for the admin application. After the split it names no
entity; the code it held becomes the entities below, each contributing to the Admin surface.

**CRM** — Pipelines, deals, calls and scorecards for selling. Requires Contacts.

**Hiring** — Candidates, applications and stages. Requires Contacts.

**Boards** — Work boards, columns and cards (tasks). Requires Contacts.

**Campaigns** — Email campaigns, letters, blog and marketing digests. Requires Contacts.

**Org** — The company itself: directory, departments, positions, goals and OKRs, values,
strategies, surveys, and workplace equipment.

**Finance** — Bookkeeping: invoices, QuickBooks, contractor payments, vendors, FX, products
and orders. Distinct from Billing, which is the Stripe-facing side of taking money.

**Ideas** — Ideas, issues, trend reports and agent sync packets. Internal.

**Client Programs** — Roadmaps, backlogs and AI programs delivered to a client. Contributes
to both the Admin and Portal surfaces.

**Retreats** — Trips and, after the split, the events, agendas and talks that used to sit in
Company OS. Internal.

**Team** — The employee-facing entity: reviews, directory view, profile. Owns the admin
screens for those subjects too. Its former modules are entities that require it:

**Coaching** — One-on-ones, commitments, recaps. Requires Team.

**Onboarding** — Journeys, plans, cycles. Requires Team.

**Time Off** — Requests, balances, leave policies, day-off imports. Requires Team.

**Portal** — Client membership and entitlements. The pages a client sees are contributions
from other entities to the Portal surface.
