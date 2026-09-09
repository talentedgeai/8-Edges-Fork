// Server-only. Static schema summary embedded in the assistant's system prompt.
// Hand-maintained: when a migration changes a table the assistant should know
// about, update the relevant lines here. This does not need to be exhaustive —
// the model can also introspect `information_schema.columns` (where
// table_schema = 'company_os') for any table not detailed below.

export const SCHEMA_SUMMARY = `
## Database schema (PostgreSQL, schema "company_os")

All tables live in the "company_os" schema. Schema-qualify them (company_os.people);
the connection's search_path is company_os, so unqualified names also resolve.
Timestamps are timestamptz. IDs are uuid. All money is stored in *_cents (bigint
minor units) with a sibling "currency" column; divide by 100 for a display amount.
Several tables have an archived_at column (soft delete) — treat archived_at IS NULL
as "active" unless the user asks about archived records.

### People, companies & relationships
- people — one row per human (leads, prospects, clients, candidates, staff).
  id, email (citext), full_name, first_name, last_name, preferred_name, phone,
  country, city, state_province, timezone, is_team_member (bool: staff),
  do_not_contact, persona (job_seeker|prospect|employee|client|null), source,
  owner_id -> people.id, linkedin_url, gender, notes, metadata (jsonb),
  archived_at, created_at.
- companies — id, name, website_url (citext), industry, industry_normalized, size_band,
  country, owner_id, priority, lifecycle_stage
  (none|lead|sql|opportunity|customer|evangelist), billing_address, notes,
  metadata, archived_at, created_at.
- person_companies — person <-> company links: person_id, company_id, role, title,
  is_primary (bool), ownership_pct, start_date, end_date.
- person_relationships — person <-> person links (empty currently).
- interactions — logged touchpoints/notes: kind, subject, body, occurred_at,
  owner_id, person_id, company_id, subject_type, subject_id, metadata.
- lifecycle_transitions — audit of a person's stage/status changes: person_id,
  from_stage, to_stage, from_status, to_status, reason, occurred_at, company_id.
- tags (slug, label, color, kind) + taggables (tag_id, entity_type, entity_id) —
  polymorphic tagging (both currently empty).

### CRM / sales pipeline
- lead — sales-lead state, one row per person: person_id, status
  (nurture|connected|open_deal|disqualified|...), source, owner_id, sla_due_at,
  attempt_count, disqualified_reason, pinned_at. "Leads" = rows here.
- pipelines (currently one: "Default sales", slug default-sales) +
  pipeline_stages — stages in order: 0 New, 1 Contacted, 2 Discovery, 3 Proposal,
  4 Contract Sent (awaiting payment, ~90% probability), 5 Won (is_won),
  6 Lost (is_lost). Join deals.stage_id -> pipeline_stages.id.
- deals — id, title, pipeline_id, stage_id, person_id, company_id,
  amount_cents + currency, amount_usd_cents + fx_rate (USD-normalized value),
  status (open|won|lost), probability, owner_id, service_line_id, source,
  expected_close_date, closed_at, lost_reason, next_step, next_step_date,
  handoff_status, proposal_url, contract_url, archived_at, created_at.
  Prefer amount_usd_cents when comparing/aggregating deal value across currencies.
- inquiries — inbound contact-form / partner messages: person_id, type, subject,
  message, source, source_site, status (new|read|...), deal_id, created_at.
- service_lines — business units / offerings: slug, name, business_unit,
  description (e.g. staffing, AI program). Referenced by deals.service_line_id
  and products.service_line_id.
- affiliates (code, person_id, program_type, rate) + affiliate_commissions /
  affiliate_payouts — referral program.

### Commerce & finance (all amounts in *_cents)
- products — sellable items/events/programs: type, slug, title, amount_cents +
  currency, amount_usd_cents, service_line_id, event_id, active, capacity, tier.
- orders — purchases: person_id, product_id, payment_method, amount_cents,
  amount_usd_cents, tax_cents, refunded_cents, currency, status, affiliate_id,
  stripe_* ids, created_at.
- subscriptions — recurring (currently empty).
- invoices — QuickBooks-synced customer invoices: company_id, customer_name,
  source (e.g. qbo), external_id, doc_number, txn_date, due_date, amount_cents,
  balance_cents, currency, status (paid|open|overdue|voided), memo,
  lines (jsonb line items), synced_at. Revenue-recognized invoices live here.
- expenses — costs: vendor_id, amount_cents, currency, category, txn_type,
  incurred_on, description, paid (bool), source (e.g. qbo), lines (jsonb).
- vendors — suppliers: name, type, status, price_range, primary_contact_*,
  rating, tax_id, archived_at. Referenced by expenses.vendor_id.
- fx_rates — currency, rate_to_usd, updated_at (used to derive *_usd_cents).

### Recruiting / ATS
- job_requisitions — open roles: title, client_company_id -> companies.id,
  department_id, position_id, headcount, employment_type, location, remote_policy,
  salary_min_cents / salary_max_cents + currency, hiring_manager_id, recruiter_id,
  status (open|closed|...), opened_at, closed_at, description, requirements,
  responsibilities, full_jd, slug, is_public (bool: shown on /careers).
- applications — one candidate's application to a requisition. THE canonical link
  is applications.person_id -> people.id (the candidates table is legacy/retired;
  prefer person_id). Columns: person_id, candidate_id (legacy), job_requisition_id,
  current_stage_id -> application_stages.id, source, referrer_person_id, status
  (active|rejected|hired|future_consideration), rejection_reason, rating (int),
  applied_at, decided_at, cover_letter, answers (jsonb), resume_document_id,
  ai_summary (jsonb), ai_rating (numeric 0-5), ai_screen_status, ai_screened_at,
  ai_model. AI screen fields are populated by the resume-screen feature.
- application_stages — per-requisition pipeline: job_requisition_id, name,
  stage_kind, position, is_terminal. application_stage_log — stage move history.
- candidates / candidate_profile — candidate detail (candidate_profile.do_not_hire,
  pool_status, headline). Legacy layer; join via person_id.

### People ops / HR
- team_members — employment record, one per staff person: person_id -> people.id,
  department_id, position_id, manager_id -> team_members.id, employee_number,
  employment_type, work_location, status (active|...), start_date, end_date,
  termination_reason, leave_policy_id, dayoff_employee_id.
- departments (name, slug, parent_department_id, head_team_member_id) +
  positions (title, level, department_id, employment_type, is_people_manager).
- staff_assignments — staffing: which team_member is placed at which client
  company_id, role_title, start_date, end_date, status. (Edge8 staffing clients.)
- time_off — leave requests/records: team_member_id, leave_type (e.g. vacation),
  status (approved|cancelled|...), start_date, end_date, days, hours, is_half_day,
  reason, approved_by, requested_at, external_source. 288 rows, mostly approved.
- leave_policies, leave_adjustments (delta_days balance changes), holidays,
  dayoff_snapshot (raw sync payloads from the Day Off provider — usually skip).
- performance_reviews, goals, one_on_ones, skills, person_skills — HR
  scaffolding, currently empty. (compensation_sensitive holds real pay data and is
  off-limits in both directions, same as people_sensitive.)

### Events, meetings, surveys, content
- events — id, slug, type, status, visibility, title, blurb, starts_at, ends_at,
  location, capacity, owner_person_id, feedback_survey_id, archived_at.
- event_registrations — event_id, person_id, order_id, product_id, status,
  guest_count, ticket_code, checked_in_at, waitlist_position.
- meetings — synced meeting records: title, meeting_type, summary (may be null if
  summary_encrypted is true, in which case the text is in summary_ciphertext and
  unreadable here), source, started_at, ended_at, duration_seconds, owner_id.
- surveys + survey_fields (question definitions) + survey_responses (survey_id,
  person_id, respondent_name/email, submitted_at) + survey_answers (response_id,
  field_id, value, value_json). To read answers, join responses -> answers ->
  fields on field labels.
- content_channels / content_pillars / content_items / content_ideas / etc. —
  content-calendar scaffolding, currently empty.

### System
- documents — file metadata (not contents): title, storage_path, mime_type,
  byte_size, entity_type, entity_id (polymorphic owner), uploaded_by.
- audit_log — change history: actor_person_id, actor_label, table_name, record_id,
  operation, old_data (jsonb), new_data (jsonb), changed_at.
- ideas — team idea backlog: kind ('build' = build idea with problem/roi +
  ai_plan product plan; 'learning' = shared learning with story/takeaway +
  ai_plan polished summary), person_id, title, office, ai_plan, status,
  created_at.
- company_profile — key/value company facts (label, content). admins — admin
  allowlist (email). integration_sources — external system registry.
`.trim();
