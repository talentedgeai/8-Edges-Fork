# Arca Wellness — finishing setup (Steps 2–8)

Step 1 and Step 1b of `README.md` are **done** and on branch
`claude/brave-thompson-lmwfao`. This file is the rest of the runbook with every
value already filled in for Arca Wellness, so you can paste rather than
translate.

It exists because the Claude Code environment that did the rebrand has
`supabase.com` and `vercel.com` blocked by its egress policy — `api.vercel.com`
and `api.supabase.com` both return `connect_rejected` from the agent proxy — so
Steps 2–8 could not be run from there. Run these on your own machine, or unblock
those hosts in the environment's network policy and hand the session back.

**Decisions already made** (change here and in the code if any is wrong):

| | |
|---|---|
| Client | Arca Wellness |
| Brand slug | `arca-wellness` (`SELF_BRAND_SLUG` in `kernel/config/brand.ts`) |
| Project name | `arca-wellness` — Supabase project, Vercel project, repo |
| Production origin | `https://arca-wellness.vercel.app` (no custom domain yet) |
| Notification inbox | `derek.nguyen@edge8.ai` |
| Public marketing site | left as an Edge8 placeholder, by your choice |

---

## Before you start

```bash
node --version          # 20+
supabase --version      # npm install -g supabase
vercel --version        # npm install -g vercel
psql --version          # apt-get install -y postgresql-client / brew install libpq

supabase login          # opens a browser
vercel login            # opens a browser
vercel teams ls         # confirm the scope you want to deploy into
```

Do **not** run `supabase db dump` or `supabase start` — both need Docker and
nothing here does.

---

## Step 2 — create the Supabase project

Generate the database password yourself and put it straight in your password
manager. Supabase cannot show it again, you need it for Step 3, and this way it
never passes through a chat transcript or a file.

```bash
PW="$(openssl rand -base64 24)"; echo "$PW"      # save this NOW

supabase orgs list
supabase projects create arca-wellness \
  --org-id <ORG_ID> --region <nearest-region> --db-password "$PW"
```

Record the **project ref** and **project URL**.

### The one key that will waste your afternoon

`supabase projects api-keys --project-ref <REF>` prints four keys. The
`sb_secret_…` one comes back **masked** and is rejected everywhere with
`401 Invalid API key` — and because the service-role client swallows read
errors, the symptom is an admin dashboard full of zeros, not an error.

| Env var | Take |
|---|---|
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…`, or the legacy `anon` JWT |
| `SUPABASE_SECRET_KEY` | the legacy **`service_role` JWT**, copied from Dashboard → Settings → API |

---

## Step 3 — database schema

**Three** files now, in this order. The third is new — see the note below it.

```bash
export PGPASSWORD='<the password from Step 2>'
export PGCONNECT_TIMEOUT=20
psqlc() { psql -h "db.<PROJECT_REF>.supabase.co" -p 5432 -U postgres -d postgres "$@"; }

psqlc -v ON_ERROR_STOP=1 -f supabase/00-prereqs.sql
psqlc -v ON_ERROR_STOP=1 -f supabase/01-schema.sql
psqlc -v ON_ERROR_STOP=1 -f supabase/02-rebrand.sql
unset PGPASSWORD
```

Use a shell **function**, not `PSQL="psql -h …"` — under zsh the latter fails on
every line with `no such file or directory`. Use port **5432**, not 6543. If
`db.<REF>.supabase.co` times out, it is IPv6-only: use the Supavisor **session**
pooler (Dashboard → Settings → Database → Connection pooling, session mode,
port 5432). Transaction mode does not support this DDL.

### Why `02-rebrand.sql` exists

`01-schema.sql` hardcodes the old brand slug as a **data value** — four CHECK
constraints and three column defaults. README Step 1b renames the brand in the
code but says nothing about this, so without the third file the rebranded code
cannot write objectives, service lines, backlog items or invoices:

```
new row for relation "objectives" violates check constraint "objectives_brand_check"
```

The app still builds, deploys and signs in, so this surfaces the first time
someone creates a record — not at setup. The file is schema-only, idempotent,
and each statement is commented.

### Expose `company_os` and `htt` to PostgREST — do not skip

A new project exposes only `public` and `graphql_public`. Every read in this app
goes through PostgREST as `company_os` or `htt`, so until both are exposed the
app deploys, signs you in, and shows an empty shell. `supabase/config.toml` in
this repo already has the exposed-schema list and the Arca Wellness auth URLs
filled in; set `project_id` at line 18, then:

```bash
supabase config push --project-ref <PROJECT_REF>
```

Read the warning at the top of that file first — the command rewrites every
setting it manages. The dashboard equivalent is Settings → API → Exposed
schemas → add `company_os` and `htt`.

### Verify — both checks, neither substitutes for the other

**1. Structure** (psql). Expect **136 tables / 9 htt_tables / 325 policies /
425 indexes / 3 roles / 10 buckets**:

```sql
select
  (select count(*) from information_schema.tables
     where table_schema='company_os' and table_type='BASE TABLE') as tables,
  (select count(*) from information_schema.tables
     where table_schema='htt' and table_type='BASE TABLE')        as htt_tables,
  (select count(*) from pg_policies where schemaname='company_os') as policies,
  (select count(*) from pg_indexes  where schemaname='company_os') as indexes,
  (select count(*) from pg_roles
     where rolname in ('chatbot_reader','team_chatbot_reader','chatbot_writer')) as roles,
  (select count(*) from storage.buckets)                           as buckets;

select id, public from storage.buckets order by public desc, id;
```

Public buckets must be exactly `avatars`, `event-media`, `gallery`, `marketing`.
If any of `id-documents`, `meeting-transcripts`, `onboarding-plans`, `passports`,
`program-documents`, `resumes` comes back `public = true`, **stop** — that
exposes identity documents and candidate resumes to anyone holding a path.

Also confirm the rebrand constraints took:

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
 where conname in ('client_backlog_items_source_check','invoices_entity_check',
                   'objectives_brand_check','service_lines_business_unit_check');
```

All four must mention `arca-wellness` and none may mention `edge8`.

**2. Reachability** (REST) — this is the check psql cannot make:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  "https://<REF>.supabase.co/rest/v1/admins?select=email" \
  -H "apikey: $SERVICE_ROLE_JWT" -H "Authorization: Bearer $SERVICE_ROLE_JWT" \
  -H "Accept-Profile: company_os"
```

**Must be `200`.** `401` = wrong secret key (the masked `sb_secret_`).
`404`/`406` with `PGRST106` = schemas still not exposed. Do not continue on
anything else: everything after this will look fine and produce an app with no
data in it.

---

## Step 4 — environment variables

Set every one for **Production, Preview and Development**. Never pipe a value on
stdin — `echo x | vercel env add` reports success and stores an empty string.
Use `--value`, then `vercel env pull .env.check` and read the file.

```bash
vercel env add NAME production --value "…" --no-sensitive --yes
```

### Required

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<REF>.supabase.co` |
| `SUPABASE_URL` | same as above |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` or the legacy `anon` JWT |
| `SUPABASE_SECRET_KEY` | the legacy **`service_role` JWT**. Server-only — never prefix `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_SITE_URL` | `https://arca-wellness.vercel.app` |
| `ADMIN_EMAILS` | `derek.nguyen@edge8.ai` |
| `EMAIL_FROM` | `Arca Wellness <derek.nguyen@edge8.ai>` |
| `MARKETING_EMAIL_FROM` | `Arca Wellness <derek.nguyen@edge8.ai>` |
| `HR_ALERT_EMAIL` | `derek.nguyen@edge8.ai` |
| `CRON_SECRET` | `openssl rand -hex 32` |
| `ANTHROPIC_API_KEY` | **you add this yourself — Step 8** |

`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is the one to get right. `middleware.ts`
**fails open** when it is missing or empty — the edge auth gate silently
switches itself off and `/admin` returns a 500 whose body can carry
partially-rendered dashboard markup to an unauthenticated client. It is not
`NEXT_PUBLIC_SUPABASE_ANON_KEY`; that name is read by one gallery component and
nothing else.

`CRON_SECRET` is not optional — every cron route fails closed without it.

### Optional — each gates one feature

`RESEND_API_KEY` (email; without it sends are skipped and logged),
`STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` (checkout), `IMAGE_MODEL` +
`GEMINI_API_KEY` (marketing images), `ADMIN_ALLOWLIST`, `SENSITIVE_VIEWERS`
(compensation and PII — being an admin is deliberately not enough),
`CHATBOT_PRIVILEGED_EMAILS`.

For the database assistants, all three are Supavisor **transaction** pooler URLs
(port 6543), and the roles ship `NOLOGIN` — the `alter role … login password …`
statements are at the bottom of `supabase/00-prereqs.sql`:
`CHATBOT_DB_URL`, `TEAM_CHATBOT_DB_URL`, `CHATBOT_WRITE_DB_URL`.

### New in this fork

The rebrand replaced two hardcoded Edge8 mail domains with env vars. Both are
optional and both fail safe when unset — rows are flagged for review rather than
mislabeled, and the certifications sync matches nothing:

| Variable | Purpose |
|---|---|
| `STAFF_EMAIL_DOMAIN` | staff mail domain for the certifications sync, e.g. `@arcawellness.com` |
| `DAYOFF_PRIMARY_ENTITY_ID` / `DAYOFF_SECONDARY_ENTITY_ID` | `company_os` legal-entity row ids for the dayoff importer |
| `DAYOFF_PRIMARY_DOMAINS` / `DAYOFF_SECONDARY_DOMAINS` | comma-separated staff domains mapping to each entity |

---

## Step 5 — first admin user and the brand row

```bash
curl -s -X POST "https://<REF>.supabase.co/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_JWT" -H "Authorization: Bearer $SERVICE_ROLE_JWT" \
  -H "Content-Type: application/json" \
  -d '{"email":"derek.nguyen@edge8.ai","password":"<openssl rand -base64 18>","email_confirm":true}'
```

This endpoint accepts **only** the legacy `service_role` JWT. Change the
password after first sign-in.

```sql
insert into company_os.admins (email, display_name, can_view_sensitive)
values ('derek.nguyen@edge8.ai', 'Derek Nguyen', true);

-- The slug MUST equal SELF_BRAND_SLUG. A mismatch is not an error anywhere,
-- just an empty blog and a failing /api/cron/letter-weekly.
insert into company_os.brands (slug, name, primary_domain)
values ('arca-wellness', 'Arca Wellness', 'arca-wellness.vercel.app')
returning id;

insert into company_os.brand_profiles (brand_id, positioning, audience)
values ('<id from above>', '<one line on what Arca Wellness does>', '<who they sell to>');
```

The `brand_profiles` values are the only two here I could not fill in — they are
Arca Wellness's own positioning, not mine to invent.

---

## Step 6 — deploy

```bash
vercel link --scope <team> --project arca-wellness --yes
vercel --prod
```

Pass `--scope` explicitly. The first deployment of a new project is promoted to
production automatically whatever command you run. If your organisation gates
production CLI deploys, push to the fork's default branch and let the git
integration build instead — that is the better habit anyway.

Node.js runtime, not Edge. `vercel.json` carries 18 cron jobs; Hobby is limited
to daily crons, so the hourly and 15-minute jobs need Pro, as does the
`maxDuration = 300` on the streaming assistant routes.

### Then point Supabase Auth at the domain

Sign-in works without this, but password reset and email one-time links fail
with *"requested path is invalid"*. `supabase/config.toml` already has these
values for `arca-wellness.vercel.app`; if you set them in the dashboard instead,
Authentication → URL Configuration:

- **Site URL** — `https://arca-wellness.vercel.app`
- **Redirect URLs** — `https://arca-wellness.vercel.app/api/auth/callback` and
  `https://arca-wellness.vercel.app/**`

`POST /auth/v1/recover` returns 200 whether or not the target is allow-listed,
so you cannot verify this by watching that call succeed — check the config, or
click a real reset link.

---

## Step 7 — verify

A green build is not success.

1. `GET /` returns 200.
2. `/admin` signed out returns **a 3xx to `/admin/login` and nothing else**:

   ```bash
   curl -s -o /tmp/a.html -w '%{http_code}\n' https://arca-wellness.vercel.app/admin/
   grep -c 'mp-kpi-val\|admin-office-panel' /tmp/a.html   # must be 0
   ```

   A 200 with dashboard markup is the obvious failure. **A 500 is also a
   failure and the likelier one** — check `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`'s
   name and value first. Judge by the response body, not what the browser
   paints. Either way, treat it as a security problem and stop.
3. Sign in; `/admin` shows real sections. If every number is `0` and the CRM is
   empty, go back to Step 3's REST check and Step 2's key check.
4. Ask the admin assistant a read-only question. `503 … missing API key` is
   expected until Step 8. A reply saying *"Database access is not configured"*
   means `CHATBOT_DB_URL` is unset or `chatbot_reader` still has no login — the
   503 masks that one, so re-test after Step 8.
5. Check the Vercel runtime logs for `[ai-usage]` lines.

---

## Step 8 — add your Anthropic API key

1. <https://console.anthropic.com> → **API Keys** → **Create Key**. Copy it —
   it is shown once.
2. Vercel project → **Settings** → **Environment Variables**.
3. Add **`ANTHROPIC_API_KEY`** with your key, for Production, Preview and
   Development.
4. **Save**, then **Deployments** → **Redeploy** the latest production
   deployment. Environment variables are read at build and boot, so an existing
   deployment will not pick it up on its own.

Until that redeploy finishes these return errors: the admin and team assistants,
the client-portal plan assistant, resume screening, meeting and review
summaries, coaching prep and summaries, and the marketing writers. Everything
else — public site, admin, portals, CRM, ATS — works without it.

The key is billed to your own Anthropic account; `[ai-usage]` lines in the
runtime logs show token cost per feature.

---

## Still Edge8-specific after the rebrand

These carry the upstream's own identity or infrastructure. None blocks the
deployment; each needs an Arca Wellness value or removal before the matching
feature is real.

| Where | What |
|---|---|
| `entities/site/`, `entities/library/`, `entities/retreats/` | the upstream's public marketing site, workflows library and retreats pages — **left as a placeholder by your choice**. Copy, case studies and images still describe Edge8, and `/` serves them publicly |
| `entities/team/ui/StartHerePanel.tsx` | team-portal onboarding panel pointing at `aiolabz.com` and `ai-officer.com/certification` — the upstream's certification programme |
| `entities/company-os/routes/(dashboard)/revenue/aio-pad/` | a whole admin route for the upstream's second brand. Left in place: deleting a feature is not a rebrand |
| `edge8company.sg.larksuite.com` in `MeetingRow.tsx` and `sales-intelligence/[id]/page.tsx` | meeting-minutes deep links into the upstream's Lark tenant |
| `VERCEL_ANALYTICS_URL` in `operations/analytics/page.tsx` | points at the upstream's Vercel project — repoint to Arca's once the project exists |
| `REGISTRY_REPO` in `entities/htt/registrations.ts` | `talentedgeai/edge8-web` |
| `DAVE_PERSON_ID` in `edges-shared.ts` | a `people` row id from the upstream's database; no such row exists in a fresh one |
| `edge8_priority`, `edge8_private_ok`, `edge8_gate_*` | database column and cookie names, deliberately untouched — renaming them would desync the code from `01-schema.sql` |

`grep -rIl -i edge8 entities kernel app middleware.ts --include='*.ts' --include='*.tsx' | grep -v '\.test\.'`
returns **181 files**, down from 269. The remainder is the three placeholder
marketing entities (~82 files), source comments, the schema identifiers above,
and `derek.nguyen@edge8.ai` itself.

---

## Known-failing tests (pre-existing, not from the rebrand)

`entities/library/library-entity.test.ts` — 8 failures, and the postbuild
`check-tracing-includes` reports 2 problems. Both are because this filtered
snapshot ships no `private-docs/` directory. They fail identically on the parent
commit `ac16b64`. Everything else passes: **1186 passed, 8 failed**.
