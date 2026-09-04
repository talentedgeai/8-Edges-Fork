# Edge8 Data Dictionary

Purpose: context for AI agents and engineers so that any new application can decide whether an existing table serves it or a new table is needed. Meaning (grain, origin, usage, reuse rules) is written by humans and reviewed like code. Facts (rows, reads, writes) are stamped from the live database and never hand-edited.

This file is the single source of truth. `scripts/data-dictionary/generate.mjs` emits the `COMMENT ON` migration, the lookup index in `.claude/skills/data-dictionary/SKILL.md`, and the Dictionary tab in `public/workflows/private/e8/data-atlas.html`. Edit here, then regenerate; never hand-edit the generated artifacts.

State documented: repo main as of 28 Aug 2026 — the live database (`wwchefrgkkxmhlkntufm`, schemas `company_os` + `htt`) plus the five pending rename/drop migrations (`20260828120100`–`120500`). Evidence numbers stamped 28 Aug 2026 from live counters (activity since table creation; renamed tables keep their history). `TODO(owner)` marks statements that need confirmation from whoever owns that area.

---

## Decision rules for agents

Read these before creating any table.

1. Search this dictionary's index by business term and synonyms before designing a new table. If an existing table has the same entity at the same grain, extend it (columns, or `metadata` jsonb for experiments); do not create a sibling.
2. Never write to a table marked "superseded" or "dead" below. Use the named replacement.
3. Anything involving a human references `people.id`. Anything involving an organization references `companies.id`. Do not store names, emails, or org names as plain text columns in new tables.
4. Money columns follow the house pattern: `amount_cents` (int8) + `currency` + `amount_usd_cents` + `fx_rate` where FX applies. Never floats, never a bare `amount`.
5. Soft delete via `archived_at` / `archived_by`. No hard deletes of business records.
6. Sensitive personal data goes in a dedicated `_sensitive` table with its own lockdown (RLS on, no policies, service-role only, revoked from the chatbot reader roles, app-gated by canViewSensitive), never as columns on the main entity. Precedents: `people_sensitive`, `candidate_sensitive`, `compensation_sensitive`.
7. Data owned by an external system (QuickBooks, Stripe, AIO Labs) is mirrored, not mastered: carry `source`, `external_id`, `synced_at`, and treat the external system as truth.
8. A new table ships in the same PR as: its dictionary entry here, `COMMENT ON` statements for the table and every column, and FKs into the spine. CI enforces this (`.github/workflows/data-dictionary-gate.yml`).
9. Column comments for enums end with the deterministic suffix: `Valid values: [a, b, c]`.
10. Trust the stamped evidence lines over prose; if they disagree, the prose is stale — fix it.
11. Renames and drops ship with the code that references them (see the deploy-coupling notes in recent migrations) and update this file in the same PR.

## Entry format (parsed by the generator — keep field names exact)

```
### schema.table_name
One row is: <grain, one sentence — becomes the table comment>
Bucket: <master|transactional|other> · <group>
Tier: <1 spine | 2 stage engine | 3 support>
Status: <active | waiting | hold | superseded | dead>
Origin: <who/what writes it; note what never writes it>
Usage: <who reads it; cite evidence>
Reuse: <when a new feature should use this table, and how>
Do not: <known wrong uses; superseded siblings>
Columns:
- column_name: <meaning — becomes the column comment. Enums end with "Valid values: [...]">
Evidence: <generated line>
```

---

## Tier 1 — the spine

### company_os.people
One row is: one human the company has ever touched — staff, client contact, candidate who converted, event attendee, AIO participant once the bridge lands.
Bucket: master · People & org structure
Tier: 1 spine
Status: active
Origin: portal HR flows, recruiting conversion, event and inquiry capture. No external sync writes it today; the planned AIO bridge will upsert participants keyed via a platform-identity mapping table (recreate it when the bridge is built; the original `platform_identities` was dropped 27 Aug 2026 as unreferenced).
Usage: the hottest table in the database — 88 tables reference `people.id`; read by the portal, careers site, coaching, HTT attribution, leave, surveys.
Reuse: any feature that involves a human references `people.id`. Extend with columns only for attributes true of people in general; feature-specific person data gets its own table with a FK.
Do not: store names/emails in other tables; add sensitive fields here (use `people_sensitive`).
Columns:
- id: Primary key.
- email: Case-insensitive email address; the main lookup and dedupe key across CRM, portal auth, and imports.
- full_name: Full name as captured at source; inconsistent ordering (Vietnamese Family-Middle-Given vs Western Given-Family), so UI code prefers `display_name` via `personName()`.
- first_name: Given-name part, when captured separately from `full_name`.
- last_name: Family-name part, when captured separately from `full_name`.
- preferred_name: The name the person actually goes by; preferred over `full_name` in greetings and lists.
- phone: Contact phone number, free text.
- avatar_url: URL of the person's profile photo served from the public avatars storage bucket (see `lib/avatars.ts`).
- country: Country of residence, free text; backfilled by CRM heuristics scripts.
- timezone: The person's timezone, captured on profile edits and Stripe checkout.
- is_team_member: Flag marking the person as Edge8 staff, used to scope team lookups and exclude staff from marketing sends.
- do_not_contact: Blunt CRM-wide "never contact this person at all" flag; both this and `marketing_consent` must pass before a marketing email sends.
- owner_id: FK to people; the team member who owns this contact relationship in the CRM.
- source: Free-text provenance label for how the row was created (e.g. `edge8.ai/careers`, `intake`, `dayoff`, import script names).
- auth_user_id: Login identity, FK to auth.users; nullable because most people in this table never log in.
- notes: Free-text CRM notes about the person.
- created_at: Row creation time.
- updated_at: Last modification time.
- gender: Self-reported gender, shown on the team profile.
- persona: Which kind of relationship this person is to Edge8. Valid values: [vendor, prospect, client, job_seeker, employee, student].
- linkedin_url: Link to the person's LinkedIn profile.
- city: City of residence, free text.
- state_province: State or province of residence, free text.
- metadata: JSONB escape hatch for experimental attributes; promote to real columns once stable.
- archived_at: Soft-delete timestamp; null means the row is active.
- archived_by: Free-text label (email) of who archived the row.
- emergency_contact_name: Name of the staff member's emergency contact, collected during onboarding.
- emergency_contact_phone: Phone number of the staff member's emergency contact.
- lark_email: Company @edge8.ai Lark Mail address, recorded post-hire during onboarding.
- graduated_from: Non-sensitive education field (school or program), shown on the team profile.
- display_name: Canonical Given + Family rendering of the name the person goes by; the one name column safe to sort and abbreviate (see `lib/people-name.ts`).
- marketing_consent: Newsletter consent state, separate axis from `do_not_contact`; `never_asked` is the honest default for imported addresses. Valid values: [subscribed, unsubscribed, never_asked].
- marketing_consent_at: When the consent state last changed (subscribe/unsubscribe or backfill).
- marketing_consent_source: Free-text label for where the consent state came from (e.g. unsubscribe link, backfill tag).
- github_login: GitHub username (citext, unique when set); used by the human-token tracker to resolve PR authors to people.
Evidence: rows 911 · reads 281,793 · inserts 1,048 (stamped 28 Aug 2026)

### company_os.companies
One row is: one external organization in any relationship with us — prospect, client, learner org (post-bridge), partner.
Bucket: master · Customers & partners
Tier: 1 spine
Status: active
Origin: CRM flows and inquiry capture; enriched by hand. The AIO bridge will upsert learner organizations. QuickBooks customers map here via invoice sync.
Usage: 29 tables reference it; 60,101 reads. Deals, invoices, HTT client mapping, interactions all key to it.
Reuse: any org-scoped feature references `companies.id`. `lifecycle_stage` distinguishes prospect / learner / client — extend its values rather than adding boolean flags.
Do not: create per-feature "clients" or "accounts" tables; duplicate org names as text.
Columns:
- id: Primary key.
- name: Company display name; also the upsert/match key when HTT registration scripts create tracker clients.
- industry: Raw free-text industry as entered; kept untouched, with `industry_normalized` holding the taxonomy used by charts and filters.
- size_band: Employee-count band, check-constrained. Valid values: [0-50, 51-250, 251-5000, 5000+].
- country: Country the company operates from; free text, backfilled 2026-07-10.
- owner_id: The person accountable for the relationship, FK to people.
- notes: Internal free-text CRM notes; meeting-note fold-in scripts append here.
- created_at: Row creation time.
- updated_at: Last modification time.
- priority: Manual account priority used to badge and filter the clients list. Valid values: [high, medium, low].
- billing_address: Billing address free text; one of the client-editable fields in the portal profile page.
- metadata: Free-form JSON side-car; known keys include `qbo_customer_ids` and `qbo_customer_ids_aio` (realm-aware QuickBooks customer mapping per legal entity) plus payment details merged by the Stripe webhook.
- archived_at: Soft-archive timestamp; null means the row is active and every query filters on it.
- archived_by: Email of the admin who archived the row; cleared on unarchive.
- lifecycle_stage: The org's account-level relationship stage with Edge8, raise-only via code (never auto-demoted); extend values rather than adding boolean flags. Valid values: [none, subscriber, lead, mql, sql, opportunity, customer, evangelist].
- industry_normalized: Fixed-taxonomy industry used by charts and filters, check-constrained. Valid values: [Technology & Software, Food & Beverage, Hospitality & Travel, Financial Services, Professional Services, Real Estate & Construction, Retail & Consumer Goods, Manufacturing, Healthcare & Wellness, Legal, Marketing & Media, Education, Logistics & Supply Chain, Energy, Other].
- website_url: Canonical bare host (citext) consolidated from the old domain+website pair; the CRM match/search key for companies.
- client_types: Text array of relationship kinds an org can hold simultaneously; Edge8-internal, never exposed to the portal.
- is_ai_program: Whether this org is in an AI program engagement (true means tracker on, at least one repo); set by the HTT registration pipeline.
Evidence: rows 256 · reads 60,101 · inserts 256 (stamped 28 Aug 2026)

### company_os.team_members
One row is: one employment relationship — a person in a seat at one of our legal entities; a person can appear more than once across time.
Bucket: master · People & org structure
Tier: 1 spine
Status: active
Origin: HR onboarding flow on hire; updated on role or entity changes.
Usage: 32 tables reference it; 36,447 reads. Compensation, staff assignments, leave, coaching, and equipment hang off it.
Reuse: employment-scoped facts (comp, leave, assignments) FK here; person-scoped facts (qualifications, identity) FK to `people`.
Do not: conflate with `people` — a team member is always also a person via `person_id`.
Columns:
- id: Primary key.
- person_id: The human behind this employment, FK to people.
- department_id: FK to departments; the org unit this employment belongs to.
- position_id: FK to positions; the job position held.
- manager_id: FK to team_members; the direct manager, used for probation reviews, coaching, and leave approval.
- employee_number: Internal HR employee code, shown on the team profile.
- employment_type: Contractual engagement type; `contract` rows form the contractor roster. Valid values: [full_time, part_time, contract, intern, temp, advisor].
- work_location: Where the person works, free text.
- status: Lifecycle state of the employment; most queries filter to `active`. Valid values: [candidate, pre_start, active, on_leave, notice, terminated, alumni].
- start_date: First day of employment; anchor for onboarding cycles and tenure.
- end_date: Last day of employment, set when the person leaves.
- termination_reason: Why the employment ended. Valid values: [voluntary, involuntary, end_of_contract, redundancy, retirement, other].
- created_at: Row creation time.
- updated_at: Last modification time.
- leave_policy_id: FK to leave_policies; which time-off accrual policy applies, assigned during the Day Off import.
- dayoff_employee_id: Employee id in the legacy Day Off app; provenance key that keeps the importer idempotent.
- employment_stage: Onboarding and off-ramp stage; null means confirmed/regular. Valid values: [pre_boarding, probation, full_time, declined_offer, rescinded, failed_probation].
- probation_ends_on: Date probation ends (defaults to Day 60 from start); drives the probation review window and can be extended.
- contract_start_date: Official contract start date, set to the day after probation ends; the anchor for performance-review scheduling (falls back to `start_date`).
- career_track: Whether the person grows as an individual contributor or a manager. Valid values: [ic, manager].
- career_level: Level on the career ladder, used by performance reviews. Valid values: [junior, collaborator, senior, principal].
Evidence: rows 64 · reads 36,447 · inserts 72 (stamped 28 Aug 2026)

### company_os.deals
One row is: one revenue opportunity with one company, moving through one pipeline's stages.
Bucket: transactional · Revenue documents
Tier: 1 spine
Status: active
Origin: sales flows; created from converted leads and inquiries; heavily hand-worked (over 1,000 updates on 138 live rows — the actively managed pipeline).
Usage: pipeline views, forecasting, handoff into delivery, affiliate and referrer attribution.
Reuse: anything that means "potential money from a company" is a deal or a column on deals. New sales motions get a new `pipelines` row, not a new table.
Do not: create parallel opportunity or quote tables; a future CPQ feature should FK to deals.
Columns:
- id: Primary key.
- pipeline_id: FK to pipelines; the pipeline this deal moves through (code selects the oldest active pipeline as the default).
- stage_id: Current pipeline stage, FK to pipeline_stages.
- title: Short deal label, e.g. "<person name> - SDR handoff" for handoff-created deals.
- person_id: FK to people; the primary contact on the deal.
- company_id: FK to companies; the account the revenue belongs to.
- amount_cents: Deal value in minor units with currency; amount_usd_cents/fx_rate carry the normalized figure.
- currency: ISO currency code of amount_cents, stored lowercase (e.g. usd).
- status: Deal outcome, derived from the stage on every move (is_won stage -> won, is_lost -> lost, else open). Valid values: [open, won, lost].
- probability: Forecast percentage 0-100; entering the Contract Sent stage sets it to 90 once, later manual overrides stick.
- owner_id: FK to people; the team member who owns/closes the deal.
- affiliate_id: FK to affiliates; attributes the deal to a referral code.
- source: Free-text origin tag of the deal, e.g. `sdr_handoff` or `portal_build_team`.
- expected_close_date: Rep-entered date the deal is expected to close; used in pipeline forecasting views.
- closed_at: When the deal was closed (won or lost).
- metadata: Free-form JSON side-car; edges metrics read a `categories` array (e.g. `[{"name":"AI Program"}]`) from it.
- created_at: Row creation time.
- updated_at: Last modification time.
- service_line_id: FK to service_lines; the business unit/offering the revenue belongs to.
- next_step: Free-text next action the rep has committed to on this deal.
- next_step_date: Date the next step is due.
- handoff_status: State of the SDR-to-closer handoff contract; deals created from the lead queue start pending until the closer decides. Valid values: [pending, accepted, rejected].
- handoff_rejected_reason: Why the closer rejected the handoff; required on reject. Valid values: [not_qualified, bad_fit, duplicate, bad_timing, other].
- handoff_note: Optional free-text note the closer attaches to the accept/reject decision.
- handoff_decided_at: When the closer accepted or rejected the handoff.
- lost_reason: Why a lost deal was lost; filled on close-lost only.
- archived_at: Soft-archive timestamp; null means active.
- archived_by: Email of the admin who archived the deal.
- amount_usd_cents: USD-normalized deal value in cents, computed from amount_cents via FX conversion; prefer this when aggregating across currencies.
- fx_rate: Currency-to-USD rate used to compute amount_usd_cents; also upserted into the shared fx_rates table on save.
- fx_rate_fetched_at: When the FX rate was fetched.
- proposal_url: Link to the proposal document for this deal.
- contract_url: Link to the contract document for this deal.
- referrer_id: Person who referred this deal, FK to people - the referral loop is load-bearing.
- position: Manual 0-based ordering of the deal within its stage on the board/list; backfilled from created_at desc at rollout.
- referrer_company_id: Company that directly referred this deal (mirrors person referrer_id); attributes referred deals to a company affiliate, FK to companies.
Evidence: rows 138 · reads 5,898 · inserts 191 (stamped 28 Aug 2026)

### htt.pull_requests
One row is: one pull request observed in a tracked client or internal repo — the raw evidence of engineering effort.
Bucket: transactional · Effort & value measurement
Tier: 1 spine
Status: active
Origin: written only by the nightly GitHub sync (the `human-tokens` service account). Humans never write it. Not reliably re-fetchable once repo access lapses — treat as original data despite being a sync target.
Usage: the mint engine derives `token_entries` from it; project summaries and client-facing burn reporting read it. Largest table owned (5,230 rows).
Reuse: consume read-only; effort analytics build views over it.
Do not: hand-correct rows (the `pr_attribution_overrides` correction table was dropped 27 Aug 2026 — recreate an overrides mechanism rather than editing raw rows); join clients by name (use `client_identities`).
Columns:
- id: Primary key.
- repo_id: FK to htt.repos; the repository this PR belongs to.
- github_pr_id: Global numeric GitHub PR id; the sync's upsert conflict key (unique).
- number: PR number within the repo.
- title: PR title from GitHub.
- author_login: GitHub login of the PR author; the configured central service identity is substituted only when GitHub reports the author as unknown.
- author_person_id: FK to people; the real human author, resolved from the PR body's author block email first, then the GitHub login; null counts as unattributed in sync runs.
- url: GitHub web URL of the PR.
- state: GitHub PR state. Valid values: [open, merged, closed].
- status: Token-accounting verification state of the PR. Valid values: [tracked, verified, disputed, excluded].
- opened_at: When the PR was opened on GitHub.
- merged_at: When the PR was merged; null if not merged.
- closed_at: When the PR was closed; null while open.
- head_branch: PR head ref (branch name) from the GitHub API; joined against `token_entries.session_branch` on the same repo, using per-branch time windows, to attribute session tokens to this PR.
- created_by: Audit label (text) of who or what created the row.
- created_at: Row creation time.
- updated_at: Last modification time.
Evidence: rows 5,230 · reads 7,011 · inserts 5,387 (stamped 28 Aug 2026)

### htt.token_entries
One row is: one minted human-token record attributed to a person, repo, and client for a span of work.
Bucket: transactional · Effort & value measurement
Tier: 1 spine
Status: active
Origin: written by the mint engine from `pull_requests`; humans never insert directly. Span tiling is the settled minting spec; tenths are the final granularity.
Usage: the evidence behind renewal and referral conversations; wallet and burn reporting (UI vocabulary: burnt / allotted / unburnt only — never hours).
Reuse: read-only for consumers; derived value metrics are views on top, not sibling tables.
Do not: over-count under any tuning (under-count anomalies are acceptable, over-count never); introduce hours as a UI unit downstream.
Columns:
- id: Primary key.
- company_id: FK to companies; denormalized owning company for fast filtering and burn rollups.
- repo_id: FK to htt.repos; the repo the tokens were spent on; rows stay repo-scoped when no PR can be attributed.
- pull_request_id: FK to htt.pull_requests; back-filled by the attribution pass that matches `session_branch` to a PR's `head_branch` within its time window; null means repo-scoped only.
- person_id: FK to people; the real human contributor; null for owner/client effort and app rows.
- kind: What the amount measures. Valid values: [human, claude, app].
- amount: Token amount: raw model tokens for kind `claude`/`app`; centihours of active human effort (hours * 100) for kind `human`.
- source: How the entry was produced. Valid values: [pr_commit, pr_review, planning, design, research, manual, session, app].
- occurred_at: Instant the work or usage happened (session end for telemetry rows; noon UTC of the day for app rows).
- occurred_on: Calendar day for per-day keyed rows (human effort and app tokens); part of the daily dedup indexes; null for per-session claude rows.
- status: Review state of the entry. Valid values: [recorded, approved, disputed, excluded].
- session_branch: Git branch the Claude Code session was on at SessionEnd; the exact correlation key used to back-fill `pull_request_id`; null rows stay repo-scoped.
- session_id: Claude Code session id; idempotency key as (session_id, kind), with effort-log human rows suffixed `-h` so they never collide with the claude row.
- created_by: Audit label (text) of who or what created the row.
- created_at: Row creation time.
- updated_at: Last modification time.
Evidence: rows 1,083 · reads 2,531 · inserts 1,762 (stamped 28 Aug 2026)

---

## Security boundaries (empty or small by design — never judge by row count)

### company_os.people_sensitive
One row is: one person's sensitive personal attributes, split from `people` so broad reads can never see them.
Bucket: master · People & org structure
Tier: 3 support
Status: active
Origin: HR flows gated by canViewSensitive.
Usage: super-admin people views only. RLS on, no policies, service-role only.
Reuse: any new sensitive person attribute goes here, not on `people`.
Columns:
- person_id: Primary key and FK to people; one restricted legal/payroll PII row per person, readable only via the service-role client after `canViewSensitive()`.
- date_of_birth: Date of birth, for HR/legal records.
- national_id_number: Vietnamese national ID (CCCD) number.
- national_id_issue_date: Issue date printed on the national ID.
- national_id_issue_place: Issuing authority/place printed on the national ID.
- permanent_address: Permanent (registered) address, as on legal documents.
- current_address: Current residential address.
- marital_status: Marital status, for HR records.
- bank_name: Bank the salary is paid into, collected during onboarding.
- bank_account_number: Salary bank account number.
- bank_branch: Branch of the salary bank account.
- tax_code: Personal income tax code.
- social_insurance_number: Vietnamese social insurance number.
- id_front_path: Storage path of the ID-card front image in the private `id-documents` bucket; served only via short-lived signed URLs.
- id_back_path: Storage path of the ID-card back image in the private `id-documents` bucket.
- id_selfie_path: Storage path of the ID-verification selfie in the private `id-documents` bucket, uploaded during onboarding.
- notes: Free-text notes on the sensitive record; audit log records that it changed, never its value.
- created_at: Row creation time.
- updated_at: Last modification time.
- place_of_birth: Place of birth, as on legal documents.
- native_province: Native province (que quan), a standard Vietnamese HR field.
Evidence: rows 31 · reads 677 · inserts 31 (stamped 28 Aug 2026)

### company_os.candidate_sensitive
One row is: one candidate's sensitive attributes (salary expectation, recruiter-verified and AI-extracted), split from `candidate_profile` so broad ATS reads can never see them.
Bucket: master · Candidates
Tier: 3 support
Status: active
Origin: recruiter flows gated by canViewSensitive; hardened 26 Aug 2026 and explicitly revoked from `chatbot_reader`.
Usage: super-admin candidate views only. Zero rows today is deliberate: relocated for future writes.
Reuse: any new sensitive candidate attribute goes here, mirroring the `people_sensitive` convention.
Do not: put salary or PII on `candidate_profile` or `applications`; those are read broadly, including by the interview-panelist AI prompt.
Columns:
- person_id: Primary key and FK to people; one restricted candidate-salary row per candidate, gated on `canViewSensitive()` (super admins only).
- salary_expectation_cents: Recruiter-entered structured salary expectation, in minor units of the currency; never written to the audit log.
- salary_expectation_currency: Currency of the structured salary expectation.
- ai_salary_expectation: Free-text salary expectation extracted by the AI resume screener; not editable in the recruiter form.
- notes: Free-text sensitive notes on the candidate.
- created_at: Row creation time.
- updated_at: Last modification time.
Evidence: rows 0 · reads 5 · inserts 0 (stamped 28 Aug 2026)

### company_os.compensation_sensitive
One row is: one compensation arrangement for a team member, effective-dated with approver — real pay data.
Bucket: master · People & org structure
Tier: 3 support
Status: active
Origin: HR comp-change flows with `approved_by` and `change_reason`; renamed from `compensation` 28 Aug 2026 to match the `_sensitive` convention.
Usage: admin comp views and contractor payment calculation, gated by canViewSensitive; blocked by name in the NL-to-SQL assistant block-lists.
Reuse: comp history extends here (`effective_from`/`effective_to`, `is_current`); never store pay on `team_members` or `people`.
Columns:
- id: Primary key.
- team_member_id: FK to team_members; whose pay arrangement this row is.
- comp_type: What kind of pay the row records; `base_salary` rows are employee salaries, `hourly`/`overtime`/`billable` are contractor rates. Valid values: [base_salary, hourly, bonus, commission, equity, stipend, allowance, overtime, billable].
- amount_cents: Generic amount in minor units of `currency`; for salary rows it mirrors `salary_usd_cents` so non-salary readers still see a value.
- currency: ISO-ish currency code of `amount_cents` (e.g. `usd`).
- pay_period: How often the amount is paid. Valid values: [annual, monthly, semi_monthly, biweekly, weekly, hourly, one_time].
- effective_from: Start date of this comp arrangement; history is kept as rows, not overwrites.
- effective_to: End date of the arrangement; a salary change closes the old row by setting this to the new row's `effective_from`.
- is_current: Whether this is the active arrangement for the team member.
- change_reason: Free-text reason for the change (raise, promotion, correction).
- approved_by: FK to team_members; approver of the change. Currently left null by app code - the approver is recorded in the audit log instead.
- notes: Free-text notes on the arrangement.
- created_at: Row creation time.
- updated_at: Last modification time.
- salary_vnd: Salary in whole VND; with `salary_usd_cents` this dual-currency pair is the record of truth for base salaries.
- salary_usd_cents: Salary in USD cents, converted from VND at a fixed 25,500 VND/USD rate (not live fx).
Evidence: rows 37 · reads 461 · inserts 37 (stamped 28 Aug 2026)

---

## Tier 2 — stage engines

### Attract

### company_os.events
One row is: one event we run or speak at — workshop, retreat, talk night — with capacity, dates, and status.
Bucket: master · Products & offerings
Tier: 2 stage engine
Status: active
Origin: events admin flows.
Usage: 5 tables reference it (registrations, agenda, P&L, talks, products); 4,054 reads — the events surface and public pages.
Reuse: new event-scoped features FK to `events.id`; ticketing links via `products.event_id`.
Columns:
- id: Primary key.
- slug: Unique URL slug identifying the event; also the join key for the products backfill from `cohort_slug`.
- type: Kind of event. Valid values: [retreat, workshop, webinar, micro_session, dinner, private_trip, company_event].
- status: Event lifecycle state; `register_for_event` only accepts registrations while `open`. Valid values: [draft, published, open, closed, completed, cancelled].
- visibility: Who can see the event. Valid values: [public, private, internal].
- title: Display title of the event.
- blurb: Short teaser text for listings.
- description: Long-form event description.
- location: Free-text venue/city of the event.
- starts_at: Event start instant.
- ends_at: Event end instant.
- timezone: IANA timezone the event runs in; defaults to `Asia/Ho_Chi_Minh`.
- capacity: Total seat cap; `register_for_event` counts held seats as sum(1 + guest_count) and waitlists past this; null means uncapped.
- cover_image_url: URL of the event's cover image (event-media storage bucket).
- owner_person_id: FK to people; the internal owner responsible for the event.
- landing_path: Site-relative path of the event's landing page; the portal links here instead of the default `/events/[slug]` page when set.
- feedback_survey_id: FK to surveys; the post-event feedback survey, validated to exist before linking and used to send feedback requests.
- notes: Internal admin notes on the event.
- metadata: Free-form JSON (e.g. backfill markers); defaults to `{}`.
- archived_at: When the event was archived out of admin lists; null while live.
- created_at: Row creation time.
- updated_at: Last modification time.
- media: Ordered gallery JSON array of `{kind: image|video, url, caption}`; images live in the event-media bucket, videos are external URLs embedded by the public page.
- attendee_count_override: Manual headcount for events measured without a registration list (keynotes, workshops); admin shows coalesce(this, active registrations + guests).
- registered_count_override: Manual override for the admin "registered" count for headcount-measured events; null derives it from event_registrations.
Evidence: rows 22 · reads 4,054 · inserts 22 (stamped 28 Aug 2026)

### company_os.event_registrations
One row is: one person's registration for one event, from signup through attendance.
Bucket: transactional · Revenue documents
Tier: 2 stage engine
Status: active
Origin: public registration flows and admin entry.
Usage: 10,349 reads — event pages, capacity checks, follow-up.
Reuse: attendance-scoped facts extend here; the registrant is a `people` row.
Columns:
- id: Primary key.
- order_id: FK to orders; the payment order behind a paid registration (set by the Stripe webhook flow); null for free/manual registrations.
- product_id: FK to products; the ticket tier purchased, whose own `capacity` is enforced per tier at registration.
- person_id: FK to people; the CRM person who registered.
- attendee_name: Name of the attendee as entered at registration (may differ from the person record).
- attendee_email: Attendee email (citext); part of the registration idempotency check per event and person.
- status: Registration lifecycle state; legacy `confirmed` is read as `registered` and never rewritten, and `pending_payment`/`registered`/`attended`/`confirmed` hold seats. Valid values: [confirmed, refunded, pending_payment, registered, waitlisted, cancelled, attended, no_show].
- created_at: Row creation time.
- event_id: FK to events; the event this registration belongs to.
- guest_count: Extra guests on this registration; each row holds 1 + guest_count seats against event and tier capacity.
- waitlist_position: Position in the waitlist queue when the event was full at registration; null otherwise.
- ticket_code: Unique 12-char Crockford base32 ticket code (crypto-random, no I/L/O/U), generated by `new_ticket_code()` and looked up by the `/t/[code]` ticket page.
- checked_in_at: When the attendee was checked in at the door; set together with status `attended`, cleared when check-in is undone.
- confirmation_sent_at: When the registration confirmation was sent; defined by the lifecycle migration but has no writer in the current codebase.
- cancelled_at: When the registration was cancelled; null while active.
- notes: Internal admin notes on the registration.
Evidence: rows 14 · reads 10,349 · inserts 18 (stamped 28 Aug 2026)

### company_os.marketing_content
One row is: one planned or published piece of marketing content (blog, email, social, broadcast) with channel, status, and authored body.
Bucket: transactional · Marketing & content execution
Tier: 2 stage engine
Status: active
Origin: marketing planning flows and content production; renamed from `marketing_calendar` 28 Aug 2026, `body_html` added for authored email/content HTML.
Usage: the marketing workspace (15,218 reads); images live in `marketing_asset_images` keyed by `entry_id`.
Reuse: any new content type is a channel/status value here, not a new table — this is the one content table after the unused content_* system was dropped.
Do not: recreate a separate calendar or content system; the 27 Aug cleanup removed six unused content tables.
Columns:
- id: Primary key.
- title: Title of the content piece.
- brand_id: FK to brands; which identity (Edge8, AI Officer) the content publishes as.
- pillar: Legacy free-text pillar label, superseded by `pillar_id` and left in place unwritten.
- channel: Publishing channel for the piece. Valid values: [blog, email, linkedin, facebook].
- status: Workflow state on the content kanban. Valid values: [idea, drafted, approved, scheduled, published, skipped].
- publish_date: Planned publish date on the calendar.
- parent_id: FK to marketing_content; the repurposing waterfall — a channel derivative points at its core asset (usually the blog post).
- copy_md: The drafted content body in markdown.
- asset_url: Source asset URL for the piece; distinct from `posted_url` (where it went live).
- notes: Free-form working notes on the entry.
- sort_order: Kanban rank within a status column; double precision so a drag between two cards is a midpoint write, not a column renumber.
- created_by: Who created the entry.
- created_at: Row creation time.
- updated_at: Last modification time.
- pillar_id: FK to marketing_pillars; the brand's controlled content pillar for reporting.
- posted_url: The live URL after publishing — recorded manually for social posts, stamped with the blog URL by the publish flow.
- blog_style: Blog style slug chosen from the brand's style catalogue (e.g. `thesis`, `case-study`).
- image_type: How the visual is sourced. Valid values: [real, ai, mixed, none].
- seo_md: The loose SEO deliverable in markdown (title tag, meta, slug, keywords); parsed once at blog publish into the normalized columns below, never re-parsed at render.
- image_brief_md: The design brief for the visual (concept and palette).
- image_style: Aesthetic style slug for the image (e.g. `pop-art`); distinct from `image_type`, which is the source.
- social_style: Social post style slug (e.g. `hook-story`, `hot-take`).
- image_url: URL of the rendered hero/social image in the public `marketing` storage bucket; mirror of the selected `marketing_asset_images` row.
- broadcast_id: FK to email_campaigns; the actual email send linked to this entry, so the calendar shows true send status.
- campaign_id: FK to marketing_campaigns; the umbrella campaign this asset belongs to (nullable — assets can exist without one).
- slug: Public blog URL slug; unique among published blog entries via a partial index.
- title_tag: SEO title tag, normalized from `seo_md` at publish time.
- meta_description: SEO meta description for the public blog page.
- excerpt: Short summary shown on blog listing cards.
- primary_keyword: Primary SEO keyword for the post.
- category: Blog category display name (e.g. `Innovation`).
- category_slug: Blog category slug (e.g. `innovation`).
- read_time: Precomputed `N min read` label, set at publish.
- published_at: When the blog post went live.
- body_html: The authored email/content HTML, which references image-library images by URL; added alongside the marketing_calendar to marketing_content rename.
Evidence: rows 107 · reads 15,218 · inserts 120 (stamped 28 Aug 2026)

### company_os.affiliates
One row is: one affiliate partner who can be attributed on deals, orders, and subscriptions.
Bucket: master · Customers & partners
Tier: 2 stage engine
Status: active
Origin: partnerships flows.
Usage: 7 tables reference it; commission and payout records key to it.
Reuse: partner-attribution features FK here; the person behind an affiliate is a `people` row.
Columns:
- id: Primary key.
- code: Unique referral code (citext, e.g. WORKHEALTHY) the customer uses at checkout; policy since 2026-07-17 is one active code per person.
- person_id: FK to people; the individual affiliate, or for a company affiliate the acting/portal contact who picks the redemption choice.
- rate: Legacy default commission rate kept for the NOT NULL column (0.20 on insert); the realized rate is a per-commission redemption choice (0.20 work credit / 0.10 cash) on affiliate_commissions.
- program_type: How the code compensates: commission accrues referral revenue, discount gives the buyer a price cut and earns nothing. Values seen in code: [commission, discount].
- stripe_coupon_id: Stripe coupon backing the code's checkout discount, when one exists.
- active: Whether the code is live; consolidation deactivates (never deletes) codes so history and commissions are preserved.
- notes: Free-text admin notes; deactivations and referral context are appended here as an audit trail.
- created_at: Row creation time.
- updated_at: Last modification time.
- company_id: The affiliate company when this is a company affiliate (the primary case); at least one of company_id/person_id is set, FK to companies.
- code_discount: TODO(owner): purpose unclear from code.
- code_commission: TODO(owner): purpose unclear from code.
- referred_by: TODO(owner): purpose unclear from code.
Evidence: rows 11 · reads 940 · inserts 12 (stamped 28 Aug 2026)

### Convert

### company_os.lead
One row is: one inbound or sourced lead before qualification — the rawest stage of the funnel.
Bucket: transactional · Pipeline activity
Tier: 2 stage engine
Status: active
Origin: website capture and CRM intake (the crm-lead skill writes here).
Usage: CRM triage views (3,084 reads); converts into deals.
Reuse: lead-stage attributes extend here; once qualified, the record's meaning moves to `deals`.
Do not: revive `touchpoints` (dropped) — activity logging belongs on `interactions`.
Columns:
- id: Primary key.
- person_id: FK to people, unique - one lead-satellite row per person actively being worked as a lead.
- status: Where the person sits in the SDR working queue; active statuses are new/attempting/connected/meeting_booked. Valid values: [new, attempting, connected, meeting_booked, open_deal, unqualified, nurture].
- sla_due_at: Speed-to-lead deadline; set to now + 4 hours (default) when the person is promoted to the queue, and drives queue ordering.
- attempt_count: Number of contact attempts the SDR has logged against this lead.
- disqualified_reason: Why the lead was unqualified; cleared when the person is re-promoted.
- owner_id: FK to people; the SDR who owns working this lead.
- source: Free-text acquisition channel of the lead row; carried from the promotion context.
- created_at: Row creation time.
- updated_at: Last modification time.
- pinned_at: Manual boost above the SLA-ordered queue; null = not pinned, pinned leads sort by pinned_at desc ahead of SLA/age.
Evidence: rows 46 · reads 3,084 · inserts 80 (stamped 28 Aug 2026)

### company_os.inquiries
One row is: one inbound inquiry from a public form or channel, with routing status.
Bucket: transactional · Pipeline activity
Tier: 2 stage engine
Status: active
Origin: public website forms.
Usage: CRM intake triage (5,025 reads).
Reuse: new public capture forms write here (or to `lead`), not to new tables. TODO(owner): the lead/inquiry split predates the current CRM — confirm which is canonical intake.
Columns:
- id: Primary key.
- person_id: FK to people; who sent the inbound message (created/upserted by email on intake).
- type: What kind of inbound this is; `consultation` (and other sales types) show on the sales board while non-sales types are filtered off it. Values seen in code: [consultation, retreat, general, trip, checkout, newsletter].
- subject: Short subject line, e.g. "AI Audit Request" from the contact form or the portal work-request subject.
- message: The inbound message body as submitted.
- source: Origin channel of the inquiry, e.g. `edge8.ai` or `portal`.
- source_site: Website domain the inquiry was submitted from, e.g. edge8.ai or infiniteleverage-8.com.
- status: Four working funnel stages plus terminal exits; the Stripe webhook advances retreat inquiries to won on payment. Valid values: [new_lead, contacted, qualified, no_action, spam, won, archived].
- deal_id: FK to deals; links the inquiry to the deal it produced.
- affiliate_id: FK to affiliates; attribution of the inquiry to a referral code (no active writer in current code).
- metadata: Free-form JSON side-car; the contact form stores company/team_size/name/email here, and the Stripe webhook merges payment details on won.
- created_at: Row creation time.
Evidence: rows 171 · reads 5,025 · inserts 317 (stamped 28 Aug 2026)

### company_os.interactions
One row is: one logged touch with a person or company — call, email, note, meeting reference.
Bucket: transactional · Pipeline activity
Tier: 2 stage engine
Status: active
Origin: CRM flows and the crm-lead skill.
Usage: relationship timelines on people, companies, and deals (430+ rows, growing steadily).
Reuse: THE activity log. Any "log a touch" feature writes here with `kind`; never create per-channel activity tables.
Columns:
- id: Primary key.
- kind: Type of touchpoint on the shared activity log; automatic `status_change` rows are hidden from note threads, and a `interactions_kind_check` constraint limits values. Kinds written by code: [note, call, email, system, status_change].
- subject: Short title of the touchpoint, e.g. the email subject or "Unsubscribed from marketing email".
- body: Full touchpoint content - note text, call summary, or the sent email HTML.
- occurred_at: When the touchpoint actually happened (drives timeline ordering, distinct from row creation).
- owner_id: FK to people; the team member who owns/logged the touchpoint (not populated by current code paths).
- person_id: FK to people; puts the entry on that contact's 360 timeline.
- company_id: FK to companies; copied from the deal so notes also land on the company timeline.
- subject_type: Polymorphic scope of the entry paired with subject_id; `deal` for deal communications, `application` for ATS notes. Values seen in code: [deal, application].
- subject_id: UUID of the scoped record named by subject_type (deal id or application id).
- metadata: Free-form JSON side-car recording provenance, e.g. `{source: "deal_drawer"}`, author_email/author_name, or email to-address and format.
- created_at: Row creation time.
Evidence: rows 439 · reads 1,570 · inserts 443 (stamped 28 Aug 2026)

### company_os.pipelines
One row is: one sales pipeline definition (one exists today).
Bucket: master · Reference & rules
Tier: 2 stage engine
Status: active
Origin: seeded; edited rarely.
Usage: deals reference it; new sales motions add rows here.
Columns:
- id: Primary key.
- slug: Stable machine identifier for the pipeline (the single live one is `default-sales`).
- name: Human-readable pipeline name ("Default sales").
- kind: Pipeline category label; not read by application code, which selects the oldest active pipeline instead.
- active: Whether the pipeline is selectable; deal-creating flows pick the oldest active pipeline as the default.
- created_at: Row creation time.
- updated_at: Last modification time.
Evidence: rows 1 · reads 507 · inserts 1 (stamped 28 Aug 2026)

### company_os.pipeline_stages
One row is: one stage in one pipeline, ordered.
Bucket: master · Reference & rules
Tier: 2 stage engine
Status: active
Origin: seeded with the pipeline; edited rarely.
Usage: deals carry `stage_id`; stage funnels and boards read the ordering.
Columns:
- id: Primary key.
- pipeline_id: FK to pipelines; the pipeline this stage belongs to.
- name: Stage display name; the default sales pipeline runs New, Contacted, Discovery, Proposal, Contract Sent, Won, Lost.
- position: 0-based ordering of the stage within its pipeline; the lowest position is where new handoff deals land.
- is_won: Marks the terminal won stage; moving a deal into it sets deals.status to won.
- is_lost: Marks the terminal lost stage; moving a deal into it sets deals.status to lost and requires a lost_reason.
- created_at: Row creation time.
Evidence: rows 7 · reads 1,085 · inserts 7 (stamped 28 Aug 2026)

### Deliver

### company_os.tasks
One row is: one unit of internal work on a board, in a sprint, or standalone.
Bucket: transactional · Client delivery & work
Tier: 2 stage engine
Status: active
Origin: work-management flows; stage moves are logged to `task_stage_log`.
Usage: boards and sprint views (2,855 reads).
Reuse: internal work items are tasks; client-facing roadmap work is `client_backlog_items`.
Columns:
- id: Primary key.
- title: Card title shown on the board.
- description: Longer free-text body of the card.
- board_id: FK to boards; the task board the card lives on.
- board_column_id: FK to board_columns; the kanban column the card currently sits in.
- sprint_id: FK to sprints; the sprint the card is committed to, null for backlog; open cards can roll over when a sprint closes.
- epic_id: FK to epics (on delete set null); the epic this card is grouped under, or null. The board's larger-feature filter axis.
- position: Float ordering of the card within its column (fractional inserts avoid renumbering).
- assignee_id: FK to people; who the card is assigned to.
- created_by: FK to people; who created the card.
- status: Whether the card is finished; moving into a done column sets it. Valid values: [open, done].
- priority: Card priority, defaulting to p3. Valid values: [p1, p2, p3].
- due_date: Date the card is due; drives the board digest cron.
- completed_at: Timestamp when the card was marked done; cleared if reopened.
- internal: Internal-only flag; the client-facing board view hard-filters to `internal = false`.
- subject_type: Polymorphic link slot - one link per card, a coaching commitment or a client roadmap item, never both. Valid values: [coaching_commitment, client_backlog_item].
- subject_id: UUID of the linked subject row named by `subject_type`; moving a commitment-linked card to done marks the coaching commitment kept.
- metadata: JSONB card extras, e.g. `assigned_at` stamp for the New chip and `source: 'agent'` for the AGENT badge.
- archived_at: Soft-delete timestamp; null means the card is active.
- archived_by: Free-text label of who archived the card.
- created_at: Row creation time.
- updated_at: Last modification time.
- parent_task_id: FK to tasks; set on subtasks, making the card a checklist item under the parent card.
- human_tokens: Human-token allotment estimated on the card (and on each subtask), the board's unit of work sizing.
Evidence: rows 103 · reads 2,855 · inserts 103 (stamped 28 Aug 2026)

### company_os.client_backlog_items
One row is: one client-visible backlog item on a client roadmap.
Bucket: transactional · Client delivery & work
Tier: 2 stage engine
Status: active
Origin: delivery planning with clients.
Usage: client roadmap surfaces (1,617 reads); groups via `client_roadmap_groups`.
Reuse: client-facing delivery scope lives here, keyed to the client's company.
Columns:
- id: Primary key.
- company_id: FK to companies; the client whose AI Program roadmap this item is on.
- group_key: Roadmap section the item sits in, matching a `client_roadmap_groups.key` for the company; code validates the key against the company's own groups (the original hardcoded five-section check survives only as a seed template).
- ref: Stable seed reference like `F1`/`R1` for Edge8-authored items, unique per company; null for client-proposed items.
- title: The backlog item's name.
- who: Which client people the item affects (free text, e.g. names or "Everyone").
- today_state: How the work is done today — the manual process the item replaces.
- build_desc: What Edge8 would build.
- needs: Array of prerequisites (dependency refs like `F1`, API access, client inputs).
- token_low: Low end of the human-token estimate for the build.
- token_high: High end of the human-token estimate.
- edge8_priority: Edge8's proposed priority; the client's `client_priority` wins when set. Valid values: [now, next, later, park].
- client_priority: The client's own priority choice from the portal, overriding `edge8_priority` when set. Valid values: [now, next, later, park].
- client_note: The client's comment on the item, written from the portal.
- source: Who authored the item — Edge8 seeds or a client proposal awaiting acceptance. Valid values: [edge8, client].
- status: Item lifecycle on the roadmap. Valid values: [proposed, accepted, active, shipped, parked].
- sort_order: Edge8's ordering within a group; the admin views sort by it.
- archived_at: When the item was archived (soft delete); null means live.
- archived_by: Who archived the item.
- created_at: Row creation time.
- updated_at: Last modification time.
- client_sort_order: The client's dragged ordering within a group; the portal orders by `coalesce(client_sort_order, sort_order)` so un-reordered groups fall back to Edge8's order.
- ai_program_id: FK to ai_programs; null means company-wide, set means the item belongs to one AI Program (HTT Phase 1, backfilled only for single-program companies).
Evidence: rows 43 · reads 1,617 · inserts 43 (stamped 28 Aug 2026)

### company_os.meetings
One row is: one meeting or meeting-note record — calendar meetings and folded-in notes distinguished by `source`.
Bucket: transactional · Client delivery & work
Tier: 2 stage engine
Status: active
Origin: calendar sync and note flows; `meeting_notes` was folded in 28 Aug 2026 as `source='notes'` rows with ids preserved.
Usage: meeting views, action items, transcripts (via `call_transcripts`), and the polymorphic `meeting_associations` list of what a meeting is about.
Reuse: anything meeting-shaped is a row here with a `source` value, not a new table.
Columns:
- id: Primary key.
- source: Where this record came from; `notes` rows carry the folded meeting_notes client-notes workflow, `review` rows are performance-review calls. Valid values: [lark, thoughtflow, manual, zoom, google, other, notes, coaching, review].
- external_id: Identifier in the source system (e.g. the Zoom recording uuid); the idempotency key for importers.
- title: Meeting title; for notes rows the AI summarizer fills it only when blank.
- meeting_type: Canonical meeting taxonomy, coerced on every write by the `meetings_normalize_type` trigger so imports can never introduce a new type. Valid values: [Sales, 1-1, Leadership Sync, Vendor Call, General, Performance, Team Ceremony].
- summary: Readable meeting summary (AI-generated Markdown for client notes); null when `summary_encrypted` is true.
- summary_encrypted: When true the readable summary is absent and the text sits encrypted in `summary_ciphertext`; app writes always set it false.
- summary_ciphertext: Encrypted summary text for rows imported with an encrypted summary; unreadable to the app and the NL-to-SQL assistant.
- transcript_url: Link to the transcript in the source system.
- recording_url: Link to the recording (Zoom share URL for zoom rows).
- minutes_url: Link to the minutes document (e.g. Lark Minutes) in the source system.
- owner_id: FK to people; the internal owner/host of the meeting.
- started_at: When the meeting started; the canonical meeting date (notes rows store UTC midnight and surfaces show only the date part).
- ended_at: When the meeting ended.
- duration_seconds: Meeting length in seconds, from the source system.
- metadata: JSONB side-channel: raw transcript stash for re-summarizing, `source_meeting_type` preserved by the taxonomy trigger, and importer bookkeeping.
- created_at: Row creation time.
- updated_at: Last modification time.
- company_id: FK to companies; the client company the meeting is with - non-null is what makes a row a "client meeting" on the admin and portal surfaces.
- attendees: Array of attendee names, entered by an admin or extracted from the transcript by the summarizer.
- published_at: When the meeting summary was published to the client portal; null means draft (admin-only).
- ai_status: State of the AI summary pipeline for the row. Valid values: [pending, ready, failed].
- ai_error: Error message recorded when the AI summarizer fails (it never throws).
- ai_model: Which Claude model produced the current summary.
- source_file_path: Storage path of the uploaded transcript file; removed from storage when the meeting is deleted.
- source_file_name: Original filename of the uploaded transcript, shown on the details page.
- created_by: Email of the admin who created the row (text, not a FK).
- archived_at: Soft-delete timestamp; null means the row is active.
- ai_program_id: FK to ai_programs; optional AI Program tag scoping the meeting - null means company-wide (the default).
Evidence: rows 336 · reads 1,664 · inserts 386 (stamped 28 Aug 2026)

### company_os.sprints
One row is: one sprint window for the internal team.
Bucket: other · Plans & designs
Tier: 2 stage engine
Status: active
Origin: work-management flows.
Usage: task grouping and sprint views (973 reads).
Columns:
- id: Primary key.
- board_id: FK to boards; the board this sprint belongs to.
- name: Sprint name shown in the board header.
- goal: The sprint goal, part of the sprint brief.
- starts_on: First day of the sprint.
- ends_on: Last day of the sprint.
- status: Whether the sprint is running or finished; closing a sprint rolls open cards into the next one. Valid values: [active, closed].
- closed_at: Timestamp when the sprint was closed.
- sort_order: Ordering of sprints on a board; queries take the first active sprint in this order.
- created_at: Row creation time.
- updated_at: Last modification time.
- meeting_id: FK to meetings; the attached sprint meeting whose transcript the brief is extracted from (attach first, then pull).
- focus_improvement: Sprint-brief field: what to improve this sprint, editable and AI-draftable from the attached meeting.
- going_well: Sprint-brief field: what is going well, editable and AI-draftable from the attached meeting.
- meeting_summary: Sprint-brief field: this client's slice of the attached meeting, drafted by `extractSprintBrief` and saved only on explicit user action.
Evidence: rows 9 · reads 973 · inserts 11 (stamped 28 Aug 2026)

### company_os.epics
One row is: one epic, a board-scoped grouping of cards into a larger feature.
Bucket: other · Plans & designs
Tier: 2 stage engine
Status: active
Origin: work-management flows (board toolbar / manage-epics drawer).
Usage: card grouping and the board epic filter, orthogonal to columns (stage) and sprints (time).
Reuse: the "larger feature" axis for board cards; time-boxed grouping is `sprints`, stage is `board_columns`.
Columns:
- id: Primary key.
- board_id: FK to boards; the board this epic belongs to.
- name: Epic name shown on the chip and in the filter.
- description: Optional longer description of the epic.
- color: Accent color for the chip/filter dot; one of the lib/boards EPIC_COLORS palette. Null falls back to the first entry.
- status: active or archived; an archived epic drops out of the toolbar filter but still resolves on any card tagged with it. Valid values: [active, archived].
- sort_order: Ordering of epics on a board; new epics also cycle the default color by this index.
- archived_at: Timestamp when the epic was archived; null while active.
- archived_by: Audit label of who archived the epic.
- created_at: Row creation time.
- updated_at: Last modification time.
Evidence: rows 0 · reads 0 · inserts 0 (new 1 Sep 2026)

### Measure

### htt.man_hour_entries
One row is: one logged span of human hours with a rate, attributed to a person, repo, and client.
Bucket: transactional · Effort & value measurement
Tier: 2 stage engine
Status: active
Origin: manual and scripted logging alongside the PR-based minting. TODO(owner): confirm current intake path.
Usage: effort reporting next to token entries (656 reads).
Reuse: hour-shaped effort evidence goes here; PR-shaped evidence is `pull_requests`. Hours never surface as a UI unit in the tracker.
Columns:
- id: Primary key.
- person_id: FK to people; the contributor whose hours these are; nullable so non-registered, non-excluded contributors are kept rather than dropped.
- company_id: FK to companies; denormalized owning company for per-day billing rollups.
- repo_id: FK to htt.repos; the repo the hours were worked on.
- primary_role: Free-text role label for the contributor on this entry; the session ingest writes null.
- hours: De-overlapped human hours worked (numeric 6,2); the session ingest writes one row per day carrying the session's resolved hours, the canonical delivery-debit figure.
- occurred_on: Calendar day the hours were worked; part of the auto-session dedup key.
- occurred_hour: Clock hour of the entry, an integer 0-23; the session ingest pins it to 0 as a stable per-day slot for the (person, repo, day) dedup.
- source: How the entry was recorded; `auto_session` rows are unique per (person, repo, day). Valid values: [auto_session, manual].
- description: Free-text note describing the work.
- rate_cents: Optional billing rate in cents applied to the hours.
- currency: Currency code for `rate_cents`; defaults to `AUD`.
- status: Billing lifecycle state. Valid values: [recorded, approved, invoiced, paid, excluded].
- started_at: Precise client-provided git-pull instant that started the session; source of the duration metric (PR timestamp minus this); null for legacy rows and contributes 0.
- created_by: Audit label (text) of who or what created the row.
- created_at: Row creation time.
- updated_at: Last modification time.
Evidence: rows 258 · reads 656 · inserts 536 (stamped 28 Aug 2026)

### htt.repos
One row is: one tracked repository, internal or client-owned.
Bucket: master · Assets & code
Tier: 2 stage engine
Status: active
Origin: tracker admin; nightly sync reads the roster. The `human-tokens` service account must be a collaborator by username or sync 404s.
Usage: 12 tables reference it; every PR and token entry keys to a repo.
Columns:
- id: Primary key.
- ai_program_id: FK to company_os.ai_programs; the tracked repo is 1:1 (unique) with an AI program, its edge8-side identity.
- company_id: FK to company_os.companies; denormalized owning-company scope used for RLS-style filtering and rollups.
- slug: URL slug, unique per company when set; backfilled as kebab-case of `name` for slug-based repo lookups.
- name: Display name of the tracked repo/engagement.
- github_repo: GitHub `owner/name` the sync and telemetry ingest resolve against; unique when set.
- github_repo_id: Numeric GitHub repository id from the API.
- github_repo_aliases: Historical `owner/name` values (renames, org transfers) that telemetry ingest also matches, so a rename does not orphan past records; explicit per repo, never auto-enrolls.
- roi_metric_name: Name of the repo's FAST-goal ROI metric.
- roi_metric_unit: Unit of the ROI metric. Valid values: [count, money, percent].
- roi_metric_baseline: ROI metric value before the engagement started.
- roi_metric_target: ROI metric value the engagement aims for.
- roi_metric_period: Reporting period of the ROI metric. Valid values: [monthly, quarterly, annual].
- started_at: Engagement lifecycle start instant.
- ended_at: Engagement lifecycle end instant.
- status: Engagement lifecycle state. Valid values: [planned, active, ramping, paused, complete, archived].
- last_synced_at: Most recent PR `updated_at` seen by the GitHub PR sync; advanced after each upsert batch.
- live_url: Live site URL mirrored from the GitHub repo homepage field during PR sync; null when the repo has no homepage set.
- created_by: Audit label (text) of who or what created the row; the tracker's auth.users linkage was dropped in the edge8 port.
- created_at: Row creation time.
- updated_at: Last modification time.
Evidence: rows 21 · reads 7,920 · inserts 23 (stamped 28 Aug 2026)

### htt.token_allocations
One row is: one allotment of tokens to a client engagement — the "allotted" side of burnt/allotted/unburnt.
Bucket: other · System config & plumbing
Tier: 2 stage engine
Status: active
Origin: tracker admin when an engagement is set up or topped up.
Usage: wallet and burn-down reporting.
Columns:
- id: Primary key.
- seq: Monotonic identity sequence; the table is append-only and the current allocation is the highest-seq row per company, unambiguous even when `set_at` ties.
- company_id: FK to companies; the client company whose allotted token pack this row sets.
- tokens: Allotted pack size in tokens (numeric so tenths are possible; UI shows whole); null on the latest row means the pack was removed.
- set_by_email: Email of the Edge8-internal user who set the value, taken from the verified session, never typed input.
- set_at: When this allocation row was recorded.
Evidence: rows 8 · reads 73 · inserts 8 (stamped 28 Aug 2026)

### htt.client_identities
One row is: one mapping from a tracker client to identifying handles (GitHub org, names) used by the sync.
Bucket: master · Customers & partners
Tier: 2 stage engine
Status: active
Origin: tracker admin.
Usage: attribution joins in the sync and reporting.
Columns:
- id: Primary key.
- repo_id: FK to htt.repos; scope of the identity row; null applies the identity to every repo (global).
- git_email: Client/owner git commit email; matched case-insensitively to exclude owner commits from attribution and to classify self-reported effort as owner work.
- github_login: Client/owner GitHub login; matched case-insensitively against `pull_requests.author_login` to classify a PR as owner (client) rather than Edge8 work.
- label: Human-readable label for the identity (who this email/login is).
- created_at: Row creation time.
Evidence: rows 20 · reads 52 · inserts 40 (stamped 28 Aug 2026)

### Collect

### company_os.invoices
One row is: one invoice mirrored from QuickBooks — QuickBooks is the system of record; this row is for visibility and joins.
Bucket: transactional · Revenue documents
Tier: 2 stage engine
Status: active
Origin: QBO sync only (`source`, `external_id`, `synced_at`, `lines` jsonb). Never hand-written.
Usage: revenue views and AR aging via `balance_cents` (2,204 reads; heavily rewritten by sync).
Reuse: invoice-shaped features read this mirror; changes to actual invoices happen in QuickBooks.
Do not: write invoices here; build credit notes or dunning on the mirror.
Columns:
- id: Primary key.
- company_id: FK to companies; the client the invoice bills, mapped from QuickBooks customer ids stored in `companies.metadata` (null when the QBO customer is unmapped, in which case `customer_name` identifies it).
- source: Sync source system; currently always `quickbooks` (the table is a read-only QuickBooks mirror, QBO is the source of truth).
- external_id: The bare QuickBooks invoice id within its realm; part of the `(source, entity, external_id)` upsert key the sync writes onto.
- doc_number: Invoice document number as shown in QuickBooks.
- txn_date: Invoice transaction date from QuickBooks.
- due_date: Payment due date from QuickBooks; a positive balance past this date derives `overdue` status.
- currency: Lowercase ISO currency code of the invoice, default `usd`.
- amount_cents: Invoice total in minor units.
- balance_cents: Outstanding balance in minor units; zero derives `paid` status.
- status: Derived at sync time from the memo, balance, and due date, never stored back to QBO. Valid values: [paid, open, overdue, voided].
- memo: QuickBooks private memo field; a `void` marker here derives `voided` status, and the column is never selected in the client portal (privacy hard line).
- payment_link: Client-facing pay URL; always null today (no QuickBooks payment-link source is wired up), and the portal omits its Pay button when null.
- lines: JSONB array of invoice line items (`description`, `quantity`, `rate`, `amount`, `item_name`) shown to clients in the portal.
- synced_at: When the QuickBooks sync last upserted this row.
- created_at: Row creation time.
- updated_at: Last modification time.
- customer_name: QuickBooks customer display name; identifies invoices whose customer has no mapped company.
- entity: Which QuickBooks company (realm) the invoice comes from; part of the upsert key because QBO invoice ids are per-realm. Valid values: [edge8, aio].
Evidence: rows 214 · reads 2,204 · inserts 217 (stamped 28 Aug 2026)

### company_os.orders
One row is: one Stripe checkout order for a product, with fees, tax, FX, and refunds captured.
Bucket: transactional · Revenue documents
Tier: 2 stage engine
Status: active
Origin: Stripe webhook flows (`stripe_session_id`, `stripe_payment_intent_id`).
Usage: product sales reporting (3,682 reads).
Reuse: one-off purchases are orders; recurring is `subscriptions`.
Columns:
- id: Primary key.
- person_id: FK to people; the buyer.
- product_id: FK to products; the product or event ticket tier purchased.
- payment_method: How payment was taken: `stripe` for checkout orders (Stripe-driven flow), `manual` for admin-recorded roster payments, `offline_vn` in legacy data.
- stripe_session_id: Stripe Checkout session id stamped at session-create time; the webhook resolves orders by it.
- stripe_payment_intent_id: Stripe PaymentIntent id, written by the webhook when payment succeeds.
- stripe_customer_id: Stripe Customer id; not written by any checkout flow in this codebase (carried over from the aio-website order schema).
- amount_cents: Order total in minor units in the native currency.
- tax_cents: Tax portion in minor units; written as 0 by the manual roster-payment action.
- currency: Lowercase ISO currency code of the order.
- status: Checkout lifecycle, flipped by the Stripe webhook guarded by current status (pending to paid or expired; an expired order can still flip to paid via payment recovery). Valid values: [pending, paid, expired, refunded].
- seat_hold_expires_at: When the 30-minute Stripe Checkout seat hold for an event registration lapses.
- refunded_cents: Refunded amount in minor units, shown on the admin orders list.
- affiliate_id: FK to affiliates; attribution used to mint a commission ledger row when a commission-type code converts.
- metadata: JSONB context stamped by the checkout flow (e.g. `type` of `event_registration` or `token_pack`, `registration_id`, `token_purchase_id`); the webhook deliberately never overwrites it.
- created_at: Row creation time.
- updated_at: Last modification time; doubles as paid-at on the webhook's status flip.
- amount_usd_cents: USD-normalized total derived via FX at write time so cross-currency sums are safe; commission gross uses it when set.
- stripe_fee_cents: Stripe processing fee in minor units; no reads or writes anywhere in this codebase (legacy aio-website column). TODO(owner): confirm whether anything still populates it.
- fx_rate: Native-to-USD conversion rate; no reads or writes anywhere in this codebase (legacy aio-website column). TODO(owner): confirm whether anything still populates it.
- vnd_amount: Order amount in Vietnamese dong; no reads or writes anywhere in this codebase (legacy aio-website column for `offline_vn` payments). TODO(owner): confirm whether anything still populates it.
Evidence: rows 8 · reads 3,682 · inserts 17 (stamped 28 Aug 2026)

### company_os.subscriptions
One row is: one Stripe subscription for a person and product.
Bucket: transactional · Revenue documents
Tier: 2 stage engine
Status: waiting
Origin: Stripe webhook flows; empty until the first recurring product sells.
Usage: none yet; read by product surfaces (304 reads against empty).
Columns:
- id: Primary key.
- person_id: FK to people; the subscriber.
- product_id: FK to products; the recurring product subscribed to.
- stripe_customer_id: Stripe Customer id behind the subscription (Stripe-driven table; currently an empty scaffold with no writer in this codebase).
- stripe_subscription_id: Stripe Subscription id linking the row to the Stripe object.
- status: Subscription lifecycle status, Stripe-shaped; no writer exists in this codebase yet.
- current_period_end: End of the current Stripe billing period.
- cancel_at_period_end: Whether the subscription is set to cancel at period end instead of renewing.
- affiliate_id: FK to affiliates; attribution for the referral program.
- created_at: Row creation time.
- updated_at: Last modification time.
Evidence: rows 0 · reads 304 · inserts 0 (stamped 28 Aug 2026)

### company_os.products
One row is: one sellable product or ticket tier, Stripe-linked, optionally tied to an event.
Bucket: master · Products & offerings
Tier: 2 stage engine
Status: active
Origin: product admin flows.
Usage: checkout, event ticketing, order joins (3,807 reads).
Reuse: new sellables are rows with `type`/`tier`, not new tables.
Columns:
- id: Primary key.
- type: Product kind; code writes `event` for event ticket tiers, and the `public_retreats` view treats `type = 'event'` rows grouped by `cohort_slug` as public retreats.
- slug: Globally unique URL identifier; event tiers are namespaced under the parent event's slug with a numeric suffix on collision.
- title: Display name of the product or ticket tier.
- subtitle: Secondary display line under the title; not referenced anywhere in this codebase (legacy catalog field).
- description: Longer description shown on admin product and event tier views.
- date_start: Start date for retreat-style products; shown on the admin products list and in the Infinite Leverage confirmation email.
- date_end: End date for retreat-style products.
- location: Venue or city label for retreat-style products.
- capacity: Per-tier seat cap, independent of the event's overall capacity.
- cohort_slug: Groups tier products into one retreat cohort; the `public_retreats` view aggregates by it and survey responses are tagged with it.
- tier: Tier identifier within an event or cohort (slugified title with underscores).
- payment_method_local_vn: Whether local Vietnamese payment is offered for the product; not referenced anywhere in this codebase (legacy aio-website flag).
- stripe_product_id: Mirrored Stripe Product id; not read by checkout in this codebase.
- stripe_price_id: Mirrored Stripe Price id; deliberately unused by event checkout, which prices from `amount_cents` via inline `price_data` because mirrored ids may belong to another Stripe account (caio-coach).
- amount_cents: Price in minor units in the native currency; 0 means a free tier that skips Stripe entirely.
- currency: Lowercase ISO currency code of the price.
- active: Whether the product or tier is currently purchasable; inactive tiers are hidden and rejected at registration.
- created_at: Row creation time.
- updated_at: Last modification time.
- service_line_id: FK to service_lines; categorizes the product under a business offering.
- amount_usd_cents: USD-normalized price used for cross-currency display and sorting (admin products list, retreat "from" price).
- event_id: FK to events; set on `type = 'event'` rows to mark the tier as belonging to that event.
- sort_order: Display order of tiers within an event.
Evidence: rows 28 · reads 3,807 · inserts 31 (stamped 28 Aug 2026)

### company_os.service_lines
One row is: one service line the company sells, used to categorize deals and products.
Bucket: master · Products & offerings
Tier: 2 stage engine
Status: active
Origin: seeded; edited rarely.
Usage: deal and product categorization (506 reads).
Columns:
- id: Primary key.
- slug: Unique short identifier for the service line.
- name: Display name of the service line (a business offering such as staffing or AI program, referenced by `deals.service_line_id` and `products.service_line_id`).
- business_unit: Which business unit the service line belongs to; only surfaced through the NL-to-SQL schema docs, no direct app reads.
- description: What the offering covers.
- active: Whether the service line is currently offered.
- created_at: Row creation time.
Evidence: rows 8 · reads 506 · inserts 8 (stamped 28 Aug 2026)

### company_os.fx_rates
One row is: one currency's current rate to USD.
Bucket: master · Reference & rules
Tier: 2 stage engine
Status: active
Origin: rate refresh job. TODO(owner): confirm refresh cadence and source.
Usage: FX normalization on deals and orders.
Columns:
- currency: Primary key; lowercase ISO currency code.
- rate_to_usd: Multiplier converting one unit of the currency to USD, used to derive `*_usd_cents` reporting values; refreshed opportunistically from the Frankfurter API when event P&L lines and deals are saved.
- updated_at: When the cached rate was last refreshed.
Evidence: rows 3 · reads 178 · inserts 3 (stamped 28 Aug 2026)

---

## Tier 3 — support tables (concise entries)

### Master · People & org structure

### company_os.positions
One row is: one job position definition in the org structure.
Bucket: master · People & org structure
Tier: 3 support
Status: active
Origin: HR admin; changes rarely.
Usage: 31,503 reads — the public careers site and org views make this one of the hottest tables.
Evidence: rows 31 · reads 31,503 · inserts 31 (stamped 28 Aug 2026)

### company_os.departments
One row is: one department in the org structure.
Bucket: master · People & org structure
Tier: 3 support
Status: active
Origin: HR admin; changes rarely.
Usage: org views and careers site (16,524 reads); 5 tables reference it.
Evidence: rows 9 · reads 16,524 · inserts 17 (stamped 28 Aug 2026)

### company_os.staff_assignments
One row is: one assignment of a team member to a client, project, or internal function for a period.
Bucket: master · People & org structure
Tier: 3 support
Status: active
Origin: staffing decisions in the admin.
Usage: who-works-on-what views (3,699 reads).
Evidence: rows 27 · reads 3,699 · inserts 42 (stamped 28 Aug 2026)

### company_os.person_qualifications
One row is: one durable qualification or certification held by a person.
Bucket: master · People & org structure
Tier: 3 support
Status: active
Origin: HR entry today; the AIO bridge will land earned certifications here.
Usage: profile views (2,248 reads).
Reuse: bridged AIO certifications belong here, not in a new table.
Evidence: rows 1 · reads 2,248 · inserts 3 (stamped 28 Aug 2026)

### company_os.legal_entities
One row is: one of our legal entities (country, base currency, tax id).
Bucket: master · People & org structure
Tier: 3 support
Status: active
Origin: seeded; changes on incorporation events only.
Usage: employment and invoicing joins (552 reads).
Evidence: rows 3 · reads 552 · inserts 3 (stamped 28 Aug 2026)

### company_os.company_profile
One row is: one block of our own company profile content.
Bucket: master · People & org structure
Tier: 3 support
Status: active
Origin: admin edits.
Usage: profile surfaces (256 reads).
Evidence: rows 4 · reads 256 · inserts 4 (stamped 28 Aug 2026)

### company_os.core_values
One row is: one company core value.
Bucket: master · People & org structure
Tier: 3 support
Status: active
Origin: seeded; edited rarely.
Usage: culture surfaces and coaching context.
Evidence: rows 6 · reads 88 · inserts 6 (stamped 28 Aug 2026)

### company_os.coaching_profiles
One row is: one team member's coaching profile — the standing context a coach needs.
Bucket: master · People & org structure
Tier: 3 support
Status: active
Origin: coaching flows; the vestigial free-text fast_goal columns were dropped 28 Aug 2026 (FAST goals are `goals` rows now).
Usage: 8 tables reference it; the coaching workspace reads it heavily (8,913 reads).
Evidence: rows 13 · reads 8,913 · inserts 29 (stamped 28 Aug 2026)

### company_os.coaching_ocean_profiles
One row is: one person's OCEAN personality assessment result.
Bucket: master · People & org structure
Tier: 3 support
Status: active
Origin: assessment intake.
Usage: coaching context views.
Evidence: rows 4 · reads 289 · inserts 4 (stamped 28 Aug 2026)

### Master · Customers, candidates, vendors

### company_os.person_companies
One row is: one person-to-company relationship (role, primary contact flags) — the join that makes contacts work.
Bucket: master · Customers & partners
Tier: 3 support
Status: active
Origin: CRM flows.
Usage: 16,432 reads — contact lists and company pages.
Reuse: person↔org relationships extend here; never put a company FK directly on `people`.
Evidence: rows 313 · reads 16,432 · inserts 318 (stamped 28 Aug 2026)

### company_os.candidates
One row is: one candidate in the recruiting funnel (person-like entity; becomes a `people` row on hire).
Bucket: master · Candidates
Tier: 3 support
Status: active
Origin: application intake and sourcing.
Usage: ATS surfaces (6,860 reads).
Evidence: rows 285 · reads 6,860 · inserts 289 (stamped 28 Aug 2026)

### company_os.candidate_profile
One row is: one candidate's extended profile (resume-derived, broadly readable — nothing sensitive).
Bucket: master · Candidates
Tier: 3 support
Status: active
Origin: application intake and AI resume screening.
Usage: 20,658 reads — candidate pool, ranking, interview kits, the interview-panelist AI prompt.
Do not: add salary or PII here; that belongs in `candidate_sensitive`.
Evidence: rows 291 · reads 20,658 · inserts 291 (stamped 28 Aug 2026)

### company_os.vendors
One row is: one vendor or supplier with contact, bank, and tax details.
Bucket: master · Vendors
Tier: 3 support
Status: active
Origin: ops entry.
Usage: expense joins and vendor views (6,396 reads).
Evidence: rows 23 · reads 6,396 · inserts 23 (stamped 28 Aug 2026)

### Master · Products, brand, assets

### company_os.ai_programs
One row is: one AI program engagement definition for a client.
Bucket: master · Products & offerings
Tier: 3 support
Status: active
Origin: program setup flows.
Usage: 8 tables reference it; program surfaces (1,371 reads).
Evidence: rows 22 · reads 1,371 · inserts 24 (stamped 28 Aug 2026)

### company_os.talks
One row is: one talk in our speaking catalog.
Bucket: master · Products & offerings
Tier: 3 support
Status: active
Origin: events admin.
Usage: event agendas via `event_talks`.
Evidence: rows 4 · reads 145 · inserts 4 (stamped 28 Aug 2026)

### company_os.brands
One row is: one brand we operate under.
Bucket: master · Products & offerings
Tier: 3 support
Status: active
Origin: seeded; edited rarely.
Usage: 18,959 reads against 5 rows — hot config on marketing and public surfaces.
Evidence: rows 5 · reads 18,959 · inserts 6 (stamped 28 Aug 2026)

### company_os.brand_profiles
One row is: one brand's extended profile (voice, style, positioning) used by content tooling.
Bucket: master · Products & offerings
Tier: 3 support
Status: active
Origin: brand admin.
Usage: content generation context (305 reads).
Evidence: rows 2 · reads 305 · inserts 2 (stamped 28 Aug 2026)

### company_os.equipment
One row is: one physical asset we own (laptop, monitor, device).
Bucket: master · Assets & code
Tier: 3 support
Status: active
Origin: ops entry on purchase.
Usage: asset register and assignment views (1,601 reads). No depreciation or book value — deliberate; accounting lives in QuickBooks.
Evidence: rows 29 · reads 1,601 · inserts 32 (stamped 28 Aug 2026)

### company_os.company_github_orgs
One row is: one GitHub organization mapped to a client company.
Bucket: master · Assets & code
Tier: 3 support
Status: active
Origin: tracker setup.
Usage: HTT attribution joins.
Evidence: rows 5 · reads 14 · inserts 5 (stamped 28 Aug 2026)

### company_os.person_git_emails
One row is: one git author email mapped to a person, for PR attribution.
Bucket: master · Assets & code
Tier: 3 support
Status: active
Origin: tracker setup.
Usage: HTT attribution joins.
Evidence: rows 14 · reads 29 · inserts 14 (stamped 28 Aug 2026)

### Master · Reference & rules

### company_os.leave_policies
One row is: one leave policy (entitlement rules) applied to team members.
Bucket: master · Reference & rules
Tier: 3 support
Status: active
Origin: HR admin; changes rarely.
Usage: leave balance math (662 reads).
Evidence: rows 2 · reads 662 · inserts 2 (stamped 28 Aug 2026)

### company_os.holidays
One row is: one public holiday relevant to leave calculation.
Bucket: master · Reference & rules
Tier: 3 support
Status: waiting
Origin: should be seeded per country per year — currently empty, which is a data gap, not a dead table.
Usage: leave math will read it once populated.
Evidence: rows 0 · reads 113 · inserts 0 (stamped 28 Aug 2026)

### company_os.boards
One row is: one work board (kanban) definition.
Bucket: master · Reference & rules
Tier: 3 support
Status: active
Origin: work-management admin.
Usage: board views (2,339 reads).
Evidence: rows 8 · reads 2,339 · inserts 8 (stamped 28 Aug 2026)

### company_os.board_columns
One row is: one column on one board, ordered.
Bucket: master · Reference & rules
Tier: 3 support
Status: active
Origin: board admin.
Usage: board rendering (1,324 reads).
Evidence: rows 32 · reads 1,324 · inserts 32 (stamped 28 Aug 2026)

### company_os.board_members
One row is: one person's membership on one board.
Bucket: master · Reference & rules
Tier: 3 support
Status: active
Origin: board admin.
Usage: board access and filters (1,991 reads).
Evidence: rows 27 · reads 1,991 · inserts 34 (stamped 28 Aug 2026)

### company_os.surveys
One row is: one survey definition.
Bucket: master · Reference & rules
Tier: 3 support
Status: active
Origin: survey admin.
Usage: pulse and event surveys (2,217 reads).
Evidence: rows 9 · reads 2,217 · inserts 18 (stamped 28 Aug 2026)

### company_os.survey_fields
One row is: one question or field on one survey.
Bucket: master · Reference & rules
Tier: 3 support
Status: active
Origin: survey admin.
Usage: survey rendering and answer joins (4,311 reads).
Evidence: rows 94 · reads 4,311 · inserts 166 (stamped 28 Aug 2026)

### company_os.tags
One row is: one tag label (part of a generic tagging system that was never adopted).
Bucket: master · Reference & rules
Tier: 3 support
Status: hold
Origin: never written in its lifetime.
Usage: none by humans; survived the 27 Aug cleanup, so code references likely exist — remove the code paths, then drop with `taggables`.
Evidence: rows 0 · reads 131 · inserts 0 (stamped 28 Aug 2026)

### company_os.taggables
One row is: one tag-to-record attachment (polymorphic).
Bucket: master · Reference & rules
Tier: 3 support
Status: hold
Origin: never written in its lifetime.
Usage: none; dies with `tags` after code-path removal.
Evidence: rows 0 · reads 130 · inserts 0 (stamped 28 Aug 2026)

### company_os.requisition_loop_steps
One row is: one step in a requisition's interview loop plan.
Bucket: master · Reference & rules
Tier: 3 support
Status: hold
Origin: created 13 Aug 2026 with the interview-loop feature; one insert, since deleted; its sibling `requisition_loop_interviewers` was dropped 27 Aug.
Usage: recruiting pages query it (508 reads). Re-verdict with the feature owner: finish the feature or drop the remnant. TODO(owner)
Evidence: rows 0 · reads 508 · inserts 1 (stamped 28 Aug 2026)

### Transactional · Revenue documents

### company_os.event_pnl_lines
One row is: one revenue or cost line on one event's P&L.
Bucket: transactional · Revenue documents
Tier: 3 support
Status: active
Origin: event finance entry.
Usage: per-event profitability views.
Evidence: rows 58 · reads 191 · inserts 60 (stamped 28 Aug 2026)

### company_os.token_purchases
One row is: one purchase of human tokens by a client (the token economy's revenue record).
Bucket: transactional · Revenue documents
Tier: 3 support
Status: waiting
Origin: will be written when token packs are sold directly.
Usage: none yet (332 reads against empty).
Evidence: rows 0 · reads 332 · inserts 0 (stamped 28 Aug 2026)

### company_os.affiliate_commissions
One row is: one commission earned by an affiliate on an attributed sale.
Bucket: transactional · Revenue documents
Tier: 3 support
Status: active
Origin: attribution flows on closed deals and orders.
Usage: affiliate statements.
Evidence: rows 3 · reads 226 · inserts 4 (stamped 28 Aug 2026)

### company_os.affiliate_payouts
One row is: one payout of accumulated commissions to an affiliate.
Bucket: transactional · Revenue documents
Tier: 3 support
Status: waiting
Origin: will be written when the first payout runs.
Usage: none yet.
Evidence: rows 0 · reads 130 · inserts 0 (stamped 28 Aug 2026)

### Transactional · Pipeline activity

### company_os.call_transcripts
One row is: one call or meeting transcript, linked to its meeting or deal context.
Bucket: transactional · Pipeline activity
Tier: 3 support
Status: active
Origin: call recording flows; the meeting_notes fold moved note transcripts here too.
Usage: call review and scorecards (835 reads).
Evidence: rows 38 · reads 835 · inserts 39 (stamped 28 Aug 2026)

### company_os.call_scorecards
One row is: one scored review of one call against the sales rubric.
Bucket: transactional · Pipeline activity
Tier: 3 support
Status: active
Origin: sales coaching flows.
Usage: call quality views (753 reads).
Evidence: rows 6 · reads 753 · inserts 6 (stamped 28 Aug 2026)

### Transactional · Marketing execution

### company_os.marketing_campaigns
One row is: one marketing campaign grouping content and email sends.
Bucket: transactional · Marketing & content execution
Tier: 3 support
Status: active
Origin: marketing planning.
Usage: campaign views (1,987 reads); content links via `marketing_content`.
Evidence: rows 10 · reads 1,987 · inserts 11 (stamped 28 Aug 2026)


### company_os.email_campaigns
One row is: one email campaign (broadcast) definition and send state.
Bucket: transactional · Marketing & content execution
Tier: 3 support
Status: active
Origin: email marketing flows.
Usage: campaign views (2,092 reads).
Evidence: rows 4 · reads 2,092 · inserts 8 (stamped 28 Aug 2026)

### company_os.email_campaign_recipients
One row is: one recipient of one email campaign send.
Bucket: transactional · Marketing & content execution
Tier: 3 support
Status: active
Origin: send runs (61 inserts historically; purged after processing).
Usage: send processing; empty between sends is normal.
Evidence: rows 0 · reads 223 · inserts 61 (stamped 28 Aug 2026)

### company_os.email_events
One row is: one email engagement event (delivery, open, click) from the send provider.
Bucket: other · Logs, audit & telemetry
Tier: 3 support
Status: active
Origin: provider webhooks (10 inserts historically; purged).
Usage: campaign engagement reporting.
Evidence: rows 0 · reads 661 · inserts 10 (stamped 28 Aug 2026)

### company_os.marketing_asset_images
One row is: one image in the marketing image library, keyed to a content entry (`entry_id`).
Bucket: transactional · Marketing & content execution
Tier: 3 support
Status: active
Origin: image generation and upload flows; 69 rows backfilled from single-pointer image_url columns on 28 Aug 2026.
Usage: content image pickers (`lib/admin/marketing-images.ts`).
Evidence: rows 126 · reads 397 · inserts 137 (stamped 28 Aug 2026)

### company_os.marketing_pillars
One row is: one marketing pillar for categorizing content.
Bucket: transactional · Marketing & content execution
Tier: 3 support
Status: hold
Origin: created 22 Aug 2026; one insert, since deleted; heavily queried (11,336 reads) — a feature mid-build.
Usage: marketing surfaces query it on most page views. Re-verdict with the feature owner in September. TODO(owner)
Evidence: rows 0 · reads 11,336 · inserts 1 (stamped 28 Aug 2026)

### Transactional · Delivery & work

### company_os.task_comments
One row is: one comment on one task.
Bucket: transactional · Client delivery & work
Tier: 3 support
Status: active
Origin: task detail UI — shipped and working; zero comments ever left (product adoption question, not a schema one).
Usage: task detail reads it on every view (5,032 reads).
Evidence: rows 0 · reads 5,032 · inserts 0 (stamped 28 Aug 2026)

### company_os.issues
One row is: one tracked issue or bug in internal work.
Bucket: transactional · Client delivery & work
Tier: 3 support
Status: active
Origin: work-management flows.
Usage: issue views (249 reads).
Evidence: rows 1 · reads 249 · inserts 5 (stamped 28 Aug 2026)

### company_os.meeting_participants
One row is: one person's participation in one meeting.
Bucket: transactional · Client delivery & work
Tier: 3 support
Status: active
Origin: calendar sync and meeting flows.
Usage: meeting detail views (543 reads).
Evidence: rows 16 · reads 543 · inserts 16 (stamped 28 Aug 2026)

### company_os.meeting_associations
One row is: one polymorphic link stating what a meeting is about — (meeting_id, entity_type, entity_id) to a deal, company, or project.
Bucket: transactional · Client delivery & work
Tier: 3 support
Status: active
Origin: meeting flows; renamed from `meeting_links` 28 Aug 2026 (per-meeting URLs live on `meetings` itself).
Usage: meeting context rendering.
Reuse: new meeting-to-entity relations are `entity_type` values here, not new join tables.
Evidence: rows 12 · reads 351 · inserts 12 (stamped 28 Aug 2026)

### company_os.meeting_action_items
One row is: one action item captured from a meeting.
Bucket: transactional · Client delivery & work
Tier: 3 support
Status: active
Origin: meeting note flows.
Usage: follow-up views (419 reads).
Evidence: rows 9 · reads 419 · inserts 9 (stamped 28 Aug 2026)

### company_os.bookings
One row is: one external booking made against an availability block.
Bucket: transactional · Client delivery & work
Tier: 3 support
Status: active
Origin: public booking flow.
Usage: scheduling surfaces (1,317 reads).
Evidence: rows 1 · reads 1,317 · inserts 5 (stamped 28 Aug 2026)

### Transactional · Spend

### company_os.expenses
One row is: one expense mirrored from QuickBooks — QuickBooks is the system of record.
Bucket: transactional · Spend
Tier: 3 support
Status: active
Origin: QBO sync (`source`, `external_id`, `lines` jsonb, `synced_at`).
Usage: spend views.
Do not: write expenses here; enter them in QuickBooks.
Evidence: rows 30 · reads 151 · inserts 61 (stamped 28 Aug 2026)

### company_os.contractor_payments
One row is: one monthly payment decision for a contractor (hours, amount, status).
Bucket: transactional · Spend
Tier: 3 support
Status: waiting
Origin: will be written by the contractor payment flow.
Usage: none yet.
Evidence: rows 0 · reads 159 · inserts 0 (stamped 28 Aug 2026)

### company_os.contractor_work_requests
One row is: one request for contractor work with scope and rate.
Bucket: transactional · Spend
Tier: 3 support
Status: active
Origin: contractor management flows.
Usage: contractor admin (703 reads).
Evidence: rows 3 · reads 703 · inserts 3 (stamped 28 Aug 2026)

### company_os.contractor_work_events
One row is: one event in a contractor work request's lifecycle.
Bucket: transactional · Spend
Tier: 3 support
Status: active
Origin: contractor management flows.
Usage: request timelines.
Evidence: rows 7 · reads 118 · inserts 7 (stamped 28 Aug 2026)

### company_os.equipment_assignments
One row is: one assignment of one asset to one person for a period.
Bucket: transactional · Spend
Tier: 3 support
Status: active
Origin: ops flows.
Usage: asset views (305 reads).
Evidence: rows 35 · reads 305 · inserts 44 (stamped 28 Aug 2026)

### company_os.equipment_requests
One row is: one request for equipment by a team member.
Bucket: transactional · Spend
Tier: 3 support
Status: active
Origin: team requests.
Usage: ops queue (289 reads).
Evidence: rows 2 · reads 289 · inserts 2 (stamped 28 Aug 2026)

### Transactional · People operations

### company_os.time_off
One row is: one leave request with type, dates, and approval state.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: team leave requests and HR entry.
Usage: leave views and balance math (8,605 reads).
Evidence: rows 309 · reads 8,605 · inserts 310 (stamped 28 Aug 2026)

### company_os.leave_adjustments
One row is: one manual adjustment to a person's leave balance.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: HR adjustments.
Usage: balance math (396 reads).
Evidence: rows 52 · reads 396 · inserts 60 (stamped 28 Aug 2026)

### company_os.applications
One row is: one candidate's application to one requisition, through the funnel.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: careers site applications and sourcing.
Usage: the ATS core (9,915 reads); stage moves log to `application_stage_log`.
Evidence: rows 319 · reads 9,915 · inserts 329 (stamped 28 Aug 2026)

### company_os.application_stages
One row is: one stage instance in one application's funnel.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: ATS stage moves.
Usage: funnel views (11,676 reads).
Evidence: rows 286 · reads 11,676 · inserts 286 (stamped 28 Aug 2026)

### company_os.job_requisitions
One row is: one open or closed hiring requisition.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: hiring flows.
Usage: 37,881 reads — the public careers site makes this the third-hottest table in the database.
Evidence: rows 57 · reads 37,881 · inserts 60 (stamped 28 Aug 2026)

### company_os.interviews
One row is: one scheduled interview for one application.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: ATS scheduling.
Usage: interview kits and calendars.
Evidence: rows 10 · reads 726 · inserts 17 (stamped 28 Aug 2026)

### company_os.interview_interviewers
One row is: one interviewer on one interview.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: ATS scheduling.
Usage: interview kits.
Evidence: rows 22 · reads 623 · inserts 35 (stamped 28 Aug 2026)

### company_os.interview_scorecards
One row is: one interviewer's scorecard for one interview.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: interviewer submissions.
Usage: hiring decisions (704 reads).
Evidence: rows 12 · reads 704 · inserts 15 (stamped 28 Aug 2026)

### company_os.scorecard_scores
One row is: one dimension score on one scorecard.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: interviewer submissions.
Usage: scorecard rendering.
Evidence: rows 48 · reads 294 · inserts 56 (stamped 28 Aug 2026)

### company_os.offers
One row is: one formal offer extended to a candidate.
Bucket: transactional · People operations
Tier: 3 support
Status: waiting
Origin: will be written by the offer flow; 319 applications processed without a recorded offer suggests offers happen off-system today. TODO(owner)
Usage: none yet.
Evidence: rows 0 · reads 153 · inserts 0 (stamped 28 Aug 2026)

### company_os.onboarding_plans
One row is: one onboarding plan for one new team member.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: HR onboarding flows.
Usage: onboarding views (949 reads).
Evidence: rows 11 · reads 949 · inserts 14 (stamped 28 Aug 2026)

### company_os.onboarding_tasks
One row is: one task inside one onboarding plan.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: plan templates and HR edits.
Usage: onboarding checklists.
Evidence: rows 52 · reads 508 · inserts 128 (stamped 28 Aug 2026)

### company_os.performance_reviews
One row is: one performance review record for one team member in one cycle.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: review cycles.
Usage: review views (753 reads).
Evidence: rows 47 · reads 753 · inserts 57 (stamped 28 Aug 2026)

### company_os.survey_responses
One row is: one person's response session to one survey.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: survey submissions.
Usage: pulse reporting (3,775 reads).
Evidence: rows 314 · reads 3,775 · inserts 318 (stamped 28 Aug 2026)

### company_os.survey_answers
One row is: one answer to one field within one response.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: survey submissions.
Usage: pulse reporting (2,433 reads).
Evidence: rows 1,115 · reads 2,433 · inserts 1,124 (stamped 28 Aug 2026)

### company_os.goals
One row is: one quarterly FAST goal for a team member, laddered to the Eight Edges tree, with member-authored measures.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: coaching flows; renamed from `coaching_goals` 28 Aug 2026 (the legacy empty `goals` table was dropped and this promoted to the name).
Usage: coaching workspace and goal reviews (985 reads).
Reuse: individual goals live here; company-level objectives are `objectives` + `key_results`.
Evidence: rows 15 · reads 985 · inserts 49 (stamped 28 Aug 2026)

### company_os.coaching_goal_comments
One row is: one comment on one FAST goal.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: coaching UI — shipped and working; zero comments ever left.
Usage: goal detail reads it (411 reads).
Evidence: rows 0 · reads 411 · inserts 0 (stamped 28 Aug 2026)

### company_os.coaching_checkins
One row is: one coaching check-in record.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: coaching flows.
Usage: coaching timeline (735 reads).
Evidence: rows 8 · reads 735 · inserts 8 (stamped 28 Aug 2026)

### company_os.coaching_commitments
One row is: one commitment made in coaching, tracked to completion.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: coaching one-on-ones.
Usage: commitment follow-up (946 reads).
Evidence: rows 51 · reads 946 · inserts 55 (stamped 28 Aug 2026)

### company_os.coaching_context
One row is: one standing context note for one person's coaching.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: coach entry.
Usage: coaching prep.
Evidence: rows 6 · reads 137 · inserts 6 (stamped 28 Aug 2026)

### company_os.coaching_one_on_ones
One row is: one coaching one-on-one session record.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: coaching flows (the legacy one_on_ones tables were dropped 27 Aug 2026).
Usage: coaching workspace (3,053 reads).
Evidence: rows 27 · reads 3,053 · inserts 27 (stamped 28 Aug 2026)

### company_os.coaching_priorities
One row is: one current priority for one person in coaching.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: coaching flows.
Usage: coaching prep (609 reads).
Evidence: rows 9 · reads 609 · inserts 9 (stamped 28 Aug 2026)

### company_os.coaching_talking_points
One row is: one talking point queued for one person's next one-on-one.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: coaching flows.
Usage: session prep.
Evidence: rows 1 · reads 174 · inserts 1 (stamped 28 Aug 2026)

### Other · Plans & designs

### company_os.strategies
One row is: one company strategy document record.
Bucket: other · Plans & designs
Tier: 3 support
Status: active
Origin: leadership planning.
Usage: strategy surfaces (187 reads).
Evidence: rows 1 · reads 187 · inserts 2 (stamped 28 Aug 2026)

### company_os.objectives
One row is: one company objective in the OKR tree.
Bucket: other · Plans & designs
Tier: 3 support
Status: active
Origin: OKR planning.
Usage: OKR views (890 reads); key results ladder to it.
Evidence: rows 4 · reads 890 · inserts 10 (stamped 28 Aug 2026)

### company_os.key_results
One row is: one measurable key result under one objective.
Bucket: other · Plans & designs
Tier: 3 support
Status: active
Origin: OKR planning; progress logs to `kr_logs`. The `metrics`/`metric_readings` tables were dropped 27 Aug 2026; measurement lives in KR values.
Usage: 6 tables reference it; OKR views (935 reads).
Evidence: rows 20 · reads 935 · inserts 35 (stamped 28 Aug 2026)

### company_os.client_roadmap_groups
One row is: one grouping on one client's roadmap.
Bucket: other · Plans & designs
Tier: 3 support
Status: active
Origin: delivery planning.
Usage: client roadmap rendering (956 reads).
Evidence: rows 7 · reads 956 · inserts 7 (stamped 28 Aug 2026)

### company_os.client_roadmap_overview
One row is: one client roadmap's overview block.
Bucket: other · Plans & designs
Tier: 3 support
Status: active
Origin: delivery planning.
Usage: client roadmap rendering.
Evidence: rows 2 · reads 385 · inserts 2 (stamped 28 Aug 2026)

### company_os.program_plans
One row is: one AI program's plan document record.
Bucket: other · Plans & designs
Tier: 3 support
Status: active
Origin: program setup.
Usage: program surfaces.
Evidence: rows 1 · reads 142 · inserts 1 (stamped 28 Aug 2026)

### htt.project_goals
One row is: one goal set for a tracked project in the token tracker.
Bucket: other · Plans & designs
Tier: 3 support
Status: active
Origin: tracker flows.
Usage: project summary generation.
Evidence: rows 49 · reads 15 · inserts 56 (stamped 28 Aug 2026)

### company_os.event_agenda_blocks
One row is: one agenda block within one event's schedule.
Bucket: other · Plans & designs
Tier: 3 support
Status: active
Origin: event planning.
Usage: agenda rendering (1,552 reads).
Evidence: rows 47 · reads 1,552 · inserts 61 (stamped 28 Aug 2026)

### company_os.event_agenda_staff
One row is: one staff assignment to one agenda block.
Bucket: other · Plans & designs
Tier: 3 support
Status: hold
Origin: created 1 Aug 2026; never written; event pages query it (693 reads). Finish the feature or remove the code path and drop. TODO(owner)
Usage: queried on event pages against empty.
Evidence: rows 0 · reads 693 · inserts 0 (stamped 28 Aug 2026)

### company_os.event_talks
One row is: one link between an event and a talk on its program.
Bucket: other · Plans & designs
Tier: 3 support
Status: active
Origin: event planning.
Usage: event program rendering.
Evidence: rows 12 · reads 136 · inserts 12 (stamped 28 Aug 2026)

### company_os.ideas
One row is: one captured idea in the R&D funnel.
Bucket: other · Plans & designs
Tier: 3 support
Status: active
Origin: team submissions.
Usage: idea review (903 reads).
Evidence: rows 12 · reads 903 · inserts 12 (stamped 28 Aug 2026)

### Other · Content & knowledge

### company_os.documents
One row is: one stored document reference (file metadata, not the file itself).
Bucket: other · Content & knowledge
Tier: 3 support
Status: active
Origin: document upload flows.
Usage: 4 tables reference it; document lists (1,081 reads).
Evidence: rows 288 · reads 1,081 · inserts 291 (stamped 28 Aug 2026)

### company_os.company_information
One row is: one general company reference fact (slug, title, category, body, tags) surfaced to the /team assistant.
Bucket: other · Content & knowledge
Tier: 3 support
Status: active
Origin: `scripts/sync-team-knowledge.ts` and admin edits; renamed from `team_knowledge` 28 Aug 2026.
Usage: the /team assistant queries it by name in literal SQL — rename coupling is real.
Evidence: rows 5 · reads 104 · inserts 5 (stamped 28 Aug 2026)

### company_os.books
One row is: one book in the publishing effort.
Bucket: other · Content & knowledge
Tier: 3 support
Status: active
Origin: publishing flows.
Usage: book tooling (176 reads).
Evidence: rows 4 · reads 176 · inserts 4 (stamped 28 Aug 2026)

### company_os.book_chapters
One row is: one chapter of one book.
Bucket: other · Content & knowledge
Tier: 3 support
Status: active
Origin: publishing flows.
Usage: book tooling.
Evidence: rows 71 · reads 36 · inserts 133 (stamped 28 Aug 2026)

### company_os.program_documents
One row is: one document attached to an AI program.
Bucket: other · Content & knowledge
Tier: 3 support
Status: active
Origin: program flows.
Usage: program surfaces (445 reads).
Evidence: rows 13 · reads 445 · inserts 13 (stamped 28 Aug 2026)

### company_os.gallery_photos
One row is: one photo in the company gallery.
Bucket: other · Content & knowledge
Tier: 3 support
Status: active
Origin: gallery uploads.
Usage: gallery surfaces (1,178 reads).
Evidence: rows 36 · reads 1,178 · inserts 37 (stamped 28 Aug 2026)

### company_os.gallery_photo_people
One row is: one person tagged in one gallery photo.
Bucket: other · Content & knowledge
Tier: 3 support
Status: active
Origin: gallery tagging.
Usage: gallery filtering.
Evidence: rows 1 · reads 162 · inserts 1 (stamped 28 Aug 2026)

### Other · Logs, audit & telemetry

### company_os.audit_log
One row is: one audited admin action (who did what to which record).
Bucket: other · Logs, audit & telemetry
Tier: 3 support
Status: active
Origin: written by admin mutations; append-only.
Usage: audit review (964 rows and counting).
Evidence: rows 964 · reads 269 · inserts 965 (stamped 28 Aug 2026)

### company_os.portal_assume_sessions
One row is: one assume-identity session by an admin in the portal.
Bucket: other · Logs, audit & telemetry
Tier: 3 support
Status: active
Origin: portal assume flows; append-only.
Usage: security review.
Evidence: rows 65 · reads 553 · inserts 65 (stamped 28 Aug 2026)

### company_os.application_stage_log
One row is: one logged stage transition of one application.
Bucket: other · Logs, audit & telemetry
Tier: 3 support
Status: active
Origin: ATS stage moves; append-only.
Usage: funnel analytics.
Evidence: rows 269 · reads 783 · inserts 270 (stamped 28 Aug 2026)

### company_os.task_stage_log
One row is: one logged stage move of one task.
Bucket: other · Logs, audit & telemetry
Tier: 3 support
Status: active
Origin: board moves; append-only.
Usage: cycle-time analytics (3,431 reads).
Evidence: rows 103 · reads 3,431 · inserts 103 (stamped 28 Aug 2026)

### company_os.lifecycle_transitions
One row is: one logged lifecycle change of a person (candidate to hire, active to alumni).
Bucket: other · Logs, audit & telemetry
Tier: 3 support
Status: active
Origin: people lifecycle flows; append-only.
Usage: people history (1,222 reads).
Evidence: rows 70 · reads 1,222 · inserts 104 (stamped 28 Aug 2026)

### company_os.kr_logs
One row is: one progress log entry on one key result.
Bucket: other · Logs, audit & telemetry
Tier: 3 support
Status: active
Origin: OKR check-ins; append-only.
Usage: KR history.
Evidence: rows 6 · reads 15 · inserts 6 (stamped 28 Aug 2026)

### htt.sync_runs
One row is: one run of the nightly GitHub sync with its outcome.
Bucket: other · Logs, audit & telemetry
Tier: 3 support
Status: active
Origin: the sync job; append-only.
Usage: sync health monitoring (613 runs).
Evidence: rows 613 · reads 623 · inserts 613 (stamped 28 Aug 2026)

### company_os.sync_packets
One row is: one integration sync packet record.
Bucket: other · Logs, audit & telemetry
Tier: 3 support
Status: active
Origin: integration jobs.
Usage: sync debugging. TODO(owner): confirm which integrations still write here.
Evidence: rows 3 · reads 117 · inserts 4 (stamped 28 Aug 2026)

### company_os.assistant_conversations
One row is: one conversation session with an in-app AI assistant.
Bucket: other · Logs, audit & telemetry
Tier: 3 support
Status: active
Origin: assistant runtime.
Usage: assistant history views.
Evidence: rows 30 · reads 370 · inserts 34 (stamped 28 Aug 2026)

### company_os.dayoff_snapshot
One row is: one snapshotted leave-balance state for one person on one date — derived, rebuildable.
Bucket: other · Logs, audit & telemetry
Tier: 3 support
Status: active
Origin: snapshot job over time_off, adjustments, and policies.
Usage: fast balance reads (861 reads).
Evidence: rows 1,405 · reads 861 · inserts 1,402 (stamped 28 Aug 2026)

### company_os.coaching_trends
One row is: one derived trend summary over coaching data — rebuildable.
Bucket: other · Logs, audit & telemetry
Tier: 3 support
Status: active
Origin: derivation job.
Usage: coaching dashboards.
Evidence: rows 5 · reads 250 · inserts 5 (stamped 28 Aug 2026)

### company_os.idea_trend_reports
One row is: one derived trend report over ideas — rebuildable.
Bucket: other · Logs, audit & telemetry
Tier: 3 support
Status: active
Origin: derivation job.
Usage: R&D review.
Evidence: rows 1 · reads 13 · inserts 1 (stamped 28 Aug 2026)

### htt.project_summaries
One row is: one generated summary of a tracked project — rebuildable.
Bucket: other · Logs, audit & telemetry
Tier: 3 support
Status: active
Origin: the regenerate-summary job.
Usage: tracker reporting.
Evidence: rows 38 · reads 56 · inserts 42 (stamped 28 Aug 2026)

### Other · System config & plumbing

### company_os.qbo_connection
One row is: one QuickBooks OAuth connection with live access and refresh tokens.
Bucket: other · System config & plumbing
Tier: 3 support
Status: active
Origin: QBO connect flow.
Usage: the QBO sync reads it. Holds live credentials — RLS lockdown is mandatory; never widen read access.
Evidence: rows 2 · reads 164 · inserts 2 (stamped 28 Aug 2026)

### company_os.integration_sources
One row is: one configured external integration source.
Bucket: other · System config & plumbing
Tier: 3 support
Status: active
Origin: integration setup.
Usage: sync jobs read their config here.
Evidence: rows 10 · reads 144 · inserts 10 (stamped 28 Aug 2026)

### company_os.admins
One row is: one admin user of the portal.
Bucket: other · System config & plumbing
Tier: 3 support
Status: active
Origin: admin management.
Usage: authorization checks (3,367 reads).
Evidence: rows 5 · reads 3,367 · inserts 7 (stamped 28 Aug 2026)

### company_os.portal_members
One row is: one person's membership and role in the portal.
Bucket: other · System config & plumbing
Tier: 3 support
Status: active
Origin: portal administration.
Usage: access control (977 reads).
Evidence: rows 15 · reads 977 · inserts 15 (stamped 28 Aug 2026)

### company_os.availability_blocks
One row is: one recurring availability window offered for external booking.
Bucket: other · System config & plumbing
Tier: 3 support
Status: active
Origin: scheduling admin.
Usage: the booking flow reads it.
Evidence: rows 3 · reads 384 · inserts 3 (stamped 28 Aug 2026)

---

## Dropped by design

### company_os.platform_identities
One row is: one mapping between a person or company here and their identity on an external platform.
Bucket: master · Customers & partners
Tier: 1 spine
Status: dead
Origin: DROPPED 27 Aug 2026 in the redundancy cleanup (zero code references at the time). The design intent stands: recreate this table when the AIO bridge is built, rather than adding external-id columns to spine tables.
Usage: none — does not exist.
Evidence: dropped (stamped 28 Aug 2026)

## Graveyard

Executed 27 Aug 2026 (`drop_redundant_tables_cleanup_20260827`, approved by Khoa; archives of non-empty tables in schema `graveyard_20260827`): the content system (6 tables + pillar_channels), one_on_ones + one_on_one_sessions, skills + person_skills + person_relationships, touchpoints, stage_templates + stage_template_stages, requisition_loop_interviewers, platform_identities, rate_limit_log, ai_screen_corrections, brand_contacts, metrics + metric_readings, six htt tables (goal_events, pr_attribution_overrides, roi_actuals, scenarios, survey_invitations, work_sessions), the entire agents schema, and the legacy public schema (19 tables, 5 views). The auth signup trigger `handle_new_user` went with it — new auth signups no longer auto-create an employees row.

Executed 28 Aug 2026 (pending deploy where noted): `marketing_calendar` → `marketing_content` (applied; compat view since dropped); `meeting_notes` dropped, folded into `meetings` as source='notes' rows; `meeting_links` → `meeting_associations`; `team_knowledge` → `company_information`; `compensation` → `compensation_sensitive`; legacy `goals` dropped and `coaching_goals` promoted to `goals`.

Executed 28 Aug 2026, applied directly (not in migration history): `campaigns` dropped (superseded by `marketing_campaigns`); the meeting_notes fold and meeting_links rename were also applied directly — their migration files no-op safely on deploy.

Superseded, still present because code references them — remove the code paths, then drop: `tags` + `taggables`.

On hold, re-verdict with owners: `marketing_pillars`, `requisition_loop_steps`, `event_agenda_staff`.
