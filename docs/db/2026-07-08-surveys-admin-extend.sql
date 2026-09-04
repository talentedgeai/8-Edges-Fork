-- Extend the pre-existing survey tables (surveys / survey_fields /
-- survey_responses / survey_answers) for the admin Surveys feature.
-- Applied via Supabase MCP on 2026-07-08 (migration: surveys_admin_extend).
--
-- Additive only: real response data exists (saigon-2026-06-20 cohort) and an
-- external writer produced it, so no renames, no status changes, no drops.
-- cohort_slug on survey_responses is left as-is and unused (retreat linking
-- deferred pending redesign).

alter table company_os.surveys add column is_anonymous boolean not null default false;
alter table company_os.surveys add column created_by text;
alter table company_os.surveys add column archived_at timestamptz;

-- 'team' when a signed-in team member/admin answered, 'external' otherwise.
-- Nullable: pre-existing rows predate the distinction (all were external).
alter table company_os.survey_responses add column respondent_kind text;

create index if not exists survey_fields_survey_idx on company_os.survey_fields(survey_id, position);
create index if not exists survey_responses_survey_idx on company_os.survey_responses(survey_id, submitted_at desc);
create index if not exists survey_answers_response_idx on company_os.survey_answers(response_id);

-- One answer per field per response (verified: no existing duplicates).
alter table company_os.survey_answers add constraint survey_answers_response_field_key unique (response_id, field_id);

-- service_role had select/insert/update but not delete (needed for question
-- delete and survey delete in the admin builder).
grant delete on company_os.surveys to service_role;
grant delete on company_os.survey_fields to service_role;
grant delete on company_os.survey_responses to service_role;
grant delete on company_os.survey_answers to service_role;
