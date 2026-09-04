// Server-only. Schema summary embedded in the /team assistant's system prompt.
// Lists ONLY the tables staff may read (the team_chatbot_reader allow-list in
// 20260720160000_team_chatbot_reader_and_knowledge.sql). Hand-maintained: if the
// migration's allow-list changes, update this to match. The model can also
// introspect information_schema.columns for any allowed table's columns.

export const SCHEMA_SUMMARY = `
## Database schema (PostgreSQL, schema "company_os")

You can read the tables listed below and NOTHING else. All tables live in the
"company_os" schema; the connection's search_path is company_os, so unqualified
names resolve. Timestamps are timestamptz. IDs are uuid. Money is stored in
*_cents (bigint minor units) with a sibling "currency" column; divide by 100 for
a display amount, and prefer *_usd_cents columns when adding value across
currencies. Many tables have archived_at (soft delete) — treat archived_at IS
NULL as "active" unless asked about archived records.

### People, companies & relationships
- people — one row per human (leads, prospects, clients, candidates, staff).
  id, email, full_name, first_name, last_name, preferred_name, phone, country,
  city, timezone, is_team_member (bool: staff), persona
  (job_seeker|prospect|employee|client|null), owner_id -> people.id, linkedin_url,
  avatar_url (public profile photo URL, may be null), notes, metadata (jsonb),
  archived_at, created_at.
- companies — id, name, domain, industry, size_band, country, website, owner_id,
  priority, lifecycle_stage (none|lead|sql|opportunity|customer|evangelist),
  notes, metadata, archived_at, created_at. Clients are companies with won deals.
- person_companies — person <-> company links: person_id, company_id, role, title,
  is_primary, start_date, end_date.
- interactions — logged touchpoints/notes on people and companies: kind, subject,
  body, occurred_at, owner_id, person_id, company_id.
- lifecycle_transitions — audit of a person's stage/status changes.
- tags, taggables — polymorphic tagging.

### Sales pipeline
- lead — sales-lead state, one row per person: person_id, status, source,
  owner_id, attempt_count, pinned_at.
- pipelines + pipeline_stages — stages in order (0 New, 1 Contacted, 2 Discovery,
  3 Proposal, 4 Won [is_won], 5 Lost [is_lost]). Join deals.stage_id.
- deals — id, title, pipeline_id, stage_id, person_id, company_id, amount_cents +
  currency, amount_usd_cents + fx_rate, status (open|won|lost), probability,
  owner_id, service_line_id, expected_close_date, closed_at, archived_at.
  Prefer amount_usd_cents when comparing/aggregating deal value.
- inquiries — inbound contact-form / partner messages.
- service_lines — business units / offerings (e.g. staffing, AI program).
- affiliates + affiliate_commissions + affiliate_payouts — referral program.

### Commerce & finance (all amounts in *_cents)
- products — sellable items/events/programs.
- orders — purchases: person_id, product_id, amount_cents, amount_usd_cents,
  tax_cents, refunded_cents, currency, status, created_at.
- subscriptions — recurring (currently empty).
- invoices — QuickBooks-synced customer invoices: company_id, customer_name,
  doc_number, txn_date, due_date, amount_cents, balance_cents, currency, status
  (paid|open|overdue|voided), lines (jsonb). Recognized revenue lives here.
- expenses — costs: vendor_id, amount_cents, currency, category, txn_type,
  incurred_on, description, paid, lines (jsonb).
- vendors — suppliers. fx_rates — currency, rate_to_usd.

### People & org
- team_members — employment record, one per staff person: person_id -> people.id,
  department_id, position_id, manager_id -> team_members.id, employee_number,
  employment_type, work_location, status (active|on_leave|notice|pre_start|...),
  start_date, end_date, employment_stage, probation_ends_on. (Pay is NOT here.)
- departments (name, slug, parent_department_id) + positions (title, level,
  department_id, is_people_manager).
- staff_assignments — which team_member is placed at which client company_id,
  role_title, start_date, end_date, status (Edge8 staffing placements).
- time_off — leave: team_member_id, leave_type, status, start_date, end_date,
  days, hours, is_half_day, approved_by, requested_at. (The free-text reason and
  manager_note are NOT readable here.)
- leave_policies, leave_adjustments (delta_days balance changes), holidays.

### Events, content, ideas & knowledge
- events + event_registrations — events and who signed up.
- content_channels / content_pillars / content_items / content_ideas — content
  calendar (mostly empty).
- ideas — Ideas that Spark Solutions from /team: kind ('build' = What should we
  build, with problem/roi + ai_plan product plan; 'learning' = What have I
  learned, with story/takeaway + ai_plan polished summary), person_id, title,
  office, status, created_at.
- gallery_photos — the internal team photo gallery (public-bucket images).
  id, image_url (a public URL you can show inline), caption, taken_on (date),
  category (workshops|clients|team|null), created_at.
- gallery_photo_people — who is tagged in each gallery photo: photo_id ->
  gallery_photos, person_id -> people, created_at. Join this to find the gallery
  photos a person appears in. (A person's own avatar_url is a separate photo.)
- company_profile — key/value company facts (label, content).
- integration_sources — external system registry.
- company_information — the company handbook/FAQ knowledge base for this assistant:
  slug, title, category, body (markdown), tags (text[]), source, updated_at,
  archived_at. THIS is where policies, values, benefits, and how-we-work live.
  Search it for any "how do we..." / "what is our policy on..." question:
  select slug, title, category, body from company_information
  where archived_at is null
    and to_tsvector('english', title || ' ' || body) @@ plainto_tsquery('english', '<terms>')
  order by updated_at desc;
  If full-text finds nothing, fall back to ILIKE on title/body/tags, or list all
  non-archived slugs+titles to see what exists.

## Off-limits (not readable — do not attempt)
Payroll and compensation_sensitive, people_sensitive (bank/ID/DOB), performance_reviews,
one_on_ones, goals, recruiting & candidate data (applications, candidates,
candidate_profile, job_requisitions and their salary figures), survey responses,
meetings, document files, audit_log, and admin tables. A query touching these
returns a permission error — that is by design; explain you cannot see it and
answer from what you can.
`.trim();
