# Eight Edges: build plan

Written 2026-08-09, revised same day after the nav review and prototype v2 sign-off with Dave.
Companion docs in this folder: the product doc and the prototype (v2). The prototype is the
picture of what we are building; this file is the order we build it in.

## The idea in one paragraph

We are building one thing: a goal tree that lives in the company database. Company goals at
the top, office goals under them, and at the bottom the people and agents who do the work.
Every goal below the top level must point at the goal above it, so nothing floats free. Every
key result must name one accountable human and say whether the work is done by a human, an
agent, or both. Eight Edges gets its own pages in Edge8 OS, and every page is editable; you
administer everything from the page itself. Agents read the tree to know what matters, and
write back the weekly numbers.

## Where it lives in the navigation (agreed 2026-08-09, prototype v2)

Eight Edges is a labeled sidebar section with the same treatment as Four Offices. The current
admin Dashboard stays exactly as it is and sits inside the section as "Company Dashboard."
"Edges" is a group like an office, and its five features are separate pages, not tabs:

```
EIGHT EDGES              (labeled section)
  Company Dashboard      /admin (the existing dashboard, unchanged)
  Edges
    Goals                /admin/edges/goals
    Metrics              /admin/edges/metrics
    Sync                 /admin/edges/sync
    Issues               /admin/edges/issues
    Reviews              /admin/edges/reviews

FOUR OFFICES             (labeled section)
  Revenue · Talent · Operations · Innovation   (all unchanged)

WORKSPACE                (labeled section)
  Settings               (unchanged)
```

The annual strategy shows as the banner at the top of the Goals page and is edited right
there. Playbooks and Agents pages, when we build them, belong under Operations; they are not
part of this plan.

Design system: everything uses the Edge8 Data Layer (the admin design system in
app/admin/admin.css, living reference at /admin/patterns): SVN-Gilroy, the dense 13px scale,
near-black sidebar, per-section accent theming. Hover states stay subtle, matching the
existing admin links; no loud accent hovers.

## What we are NOT building (so nobody builds it)

- No changes to the existing /admin dashboard (it just moves under the Eight Edges label).
- No employee engagement surveys (later phase).
- No version for clients (dogfood first).
- No reminder emails or notifications (the Monday packet is the reminder).
- No charts of history (this week's number and last week's number is enough).
- No connection to Human Tokens (different system, stays separate).
- No new login system (the existing Edge8 OS admin login covers it).
- No Playbooks or Agents pages (future work, under Operations).

---

## PR 1: "Create the goal tables"

**What it does.** Adds the goal tables to the `company_os` schema in our existing Supabase
project, the same schema where the CRM already lives (deals, people, companies, meetings). No
new database, no new schema; agents reach it the same way the CRM helper already does. The
tables: strategies (the one-page annual strategy), objectives, key results, metrics with their
weekly readings, issues, and sync packets. Two rules are built into the database itself so
they can never be skipped: an office or individual objective cannot be saved without naming
the company key result it serves, and a key result cannot be saved without naming its one
accountable human.

**What you'll see.** Nothing on screen yet. What exists after this PR is the current goal
tree, sitting in the database, seeded from the prototype's Q3 content so the pages have real
structure to render; every entry is editable from the pages in PR 2 and can be replaced
wholesale at the next quarterly planning session.

**Done when.** We can ask the database "show me how this individual goal connects up to the
company goal" and get the full chain back. About 1 day.

---

## PR 2: "The sidebar and the Goals page, with editing"

**What it does.** Restructures the sidebar into the three labeled sections above and builds
/admin/edges/goals: the editable strategy banner, the FAST health chips, the casting mix, and
the goal cascade with the human/AI/blended badge on every key result. Editing is built in from
day one: check in a key result's number and status inline, add or edit objectives and key
results, expand any key result to see its cascade chain. The goal form politely challenges you
if a key result looks like a task instead of an outcome.

**What you'll see.** The new sidebar everywhere in Edge8 OS, and the Goals page live with the
real tree, looking native next to the other admin pages.

**Done when.** You check in a number and edit a goal from the page, no SQL. About 4 days.

---

## PR 3: "The Metrics and Issues pages, with editing"

**What it does.** Builds /admin/edges/metrics (the weekly numbers table: target, this week,
delta, direction, source, with inline entry for manual numbers) and /admin/edges/issues (the
rolling list with the goal/system/execution diagnosis, file and solve from the page).

**What you'll see.** Both pages live and editable.

**Done when.** You enter a manual number and file an issue from the pages. About 2 days.

---

## PR 4: "Agents read the goals"

**What it does.** Gives every agent on the Mac Mini one simple command that prints the current
goal tree in a compact form: what the strategy is, which key results exist, who owns them, and
which ones are at risk. Then wires it into the product manager agent's 7am routine, so the
daily plan starts from the goals instead of from memory.

**What you'll see.** Tomorrow's 7am daily plan opens with "key results at risk" and every item
on the plan says which key result it advances, or says plainly "not tied to a goal."

**Done when.** A full week of daily plans where every item traces to a goal. About 2 days.

---

## PR 5: "Agents collect the numbers"

**What it does.** A scheduled job every Monday at 6am where the devops agent pulls the weekly
numbers that have a source it can reach (staffing revenue and open deals from the CRM tables,
proposal speed where logged) and writes them into the metrics table. Numbers with no automatic
source stay manual and are labeled "manual" on the page, honestly. The same job watches for
trouble: if a number misses its target two weeks in a row and nobody has filed an issue about
it, the agent files one, with its best guess at the cause attached.

**What you'll see.** Monday morning the numbers are already fresh, and problems show up as
filed issues before anyone noticed them.

**Done when.** Two Mondays in a row where no human typed a number that has an automatic
source. About 4 days.

---

## PR 6: "The Sync page and the Monday packet"

**What it does.** Builds /admin/edges/sync, which shows the packet for Monday's sync: what the
numbers say, which key results are at risk, which issue to solve first, and a proposed agenda.
The packet is generated every Sunday at 6pm by the product manager agent and stored with the
goal data, so past packets are the sync history.

**What you'll see.** You walk into Monday's sync with the whole picture already assembled, and
the meeting starts at the decision, not at the data gathering.

**Done when.** Two consecutive syncs run off the packet and you grade the packet useful. About
2 days.

---

## PR 7: "The Reviews page and quarterly packets" (build in December, not now)

**What it does.** Builds /admin/edges/reviews and, at quarter end, generates a review packet
for every person AND every agent: what progress was made, what the misses teach us, and what
to adjust, including whether any work should be recast from human to AI or back. Also produces
the one table that is the whole Eight Edges story: key results grouped by human/AI/blended,
with the hit rate of each. Until this ships, Reviews shows in the sidebar as "soon," the same
pattern the rest of the admin uses for unbuilt pages.

**What you'll see.** Q4 review week runs off generated packets instead of memory.

**Done when.** The Q4 reviews happen. About 2 days, in December.

---

## Order and timing

| PR | Name | Time | What changes for you |
|----|------|------|----------------------|
| 1 | Create the goal tables | 1 day | The goal tree exists in the database |
| 2 | Sidebar + Goals page, with editing | 4 days | The new nav, and goals you can edit |
| 3 | Metrics + Issues pages, with editing | 2 days | Numbers and blockers live on their own pages |
| 4 | Agents read the goals | 2 days | The 7am plan starts from the goals |
| 5 | Agents collect the numbers | 4 days | Numbers are fresh without you |
| 6 | Sync page + the Monday packet | 2 days | Meetings start at the decision |
| 7 | Reviews page + quarterly packets | 2 days | December |

One measure tells us if this project is working: **how many weekly syncs in a row have run on
the system.** If that streak breaks, we stop building and fix the reason before adding
anything new.

Ship rules as always: each PR from a clean branch off main, merged only when CI is green,
verified on production.
