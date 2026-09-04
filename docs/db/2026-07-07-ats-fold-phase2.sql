-- Migration: ats_fold_phase2_apply_path (applied to company_os 2026-07-07)
--
-- Phase 2 of the ATS fold: the careers apply path writes applications straight
-- to a person, so it must be able to insert without a candidate row.
-- candidate_id stays in place (nullable) until Phase 5; application dedupe
-- moves from (candidate_id, job_requisition_id) to (person_id,
-- job_requisition_id) — verified unique across all existing rows before apply.

alter table company_os.applications alter column candidate_id drop not null;
create unique index if not exists applications_person_req_uniq
  on company_os.applications (person_id, job_requisition_id);
