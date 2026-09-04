-- Migration: ats_fold_phase1_additive (applied to company_os 2026-07-07)
--
-- Phase 1 of folding candidates into applications: the ATS collapses
-- application → candidate → person down to application → person. This phase is
-- ADDITIVE ONLY — new columns + backfill, no drops. The candidates table and
-- applications.candidate_id survive until Phase 5 (cleanup), after the app has
-- stopped reading them.
--
-- Model decisions (Dave, 2026-07-07):
-- - A "candidate" is just a person; LinkedIn/profile are person attributes.
-- - Resume + pasted cover letter + per-role Q&A live on the application.
-- - pool_status is dropped: placed→status=hired, active→status=active,
--   passive→new 'passive' application status, do_not_pursue→people.do_not_hire.
-- - do_not_hire is recruiting-scoped ("would we look at them again?") and is
--   deliberately SEPARATE from do_not_contact, which is an opt-out consent flag.
-- - job_requisitions gains slug/is_public/application_questions so the ATS can
--   drive /careers (Phase 4). Slug uniqueness is enforced in Phase 4.
--
-- Backfill verified after apply: 286/286 applications got person_id; 6 resumes
-- moved; 159 candidate linkedin_urls merged into people (never clobbering);
-- 128 do_not_pursue → do_not_hire; do_not_contact untouched (0); 52 reqs
-- slugged (5 duplicate slugs left for Phase 4 dedupe). Candidates' headline /
-- current_title were empty in source, so 0 backfilled is correct.

-- applications: link straight to a person + hold job-specific artifacts
alter table company_os.applications
  add column if not exists person_id            uuid references company_os.people(id),
  add column if not exists resume_document_id   uuid references company_os.documents(id),
  add column if not exists cover_letter         text,
  add column if not exists answers              jsonb not null default '[]'::jsonb;

-- allow 'passive' as an application status (absorbs the one useful pool_status value)
alter table company_os.applications drop constraint applications_status_check;
alter table company_os.applications add constraint applications_status_check
  check (status = any (array['active','on_hold','passive','withdrawn','rejected','hired']));

-- people: professional profile that used to live on candidates, plus a
-- recruiting-scoped flag (distinct from the do_not_contact consent flag)
alter table company_os.people
  add column if not exists headline           text,
  add column if not exists current_title      text,
  add column if not exists current_company_id uuid references company_os.companies(id),
  add column if not exists portfolio_url      text,
  add column if not exists do_not_hire        boolean not null default false;

-- job_requisitions: public posting controls
alter table company_os.job_requisitions
  add column if not exists slug                  text,
  add column if not exists is_public             boolean not null default false,
  add column if not exists application_questions jsonb not null default '[]'::jsonb;

-- ── Backfill ──────────────────────────────────────────────
-- 1) application → person (through the candidate we're retiring)
update company_os.applications a
   set person_id = c.person_id
  from company_os.candidates c
 where a.candidate_id = c.id and a.person_id is null;

-- 2) resume document onto the application
update company_os.applications a
   set resume_document_id = c.resume_document_id
  from company_os.candidates c
 where a.candidate_id = c.id and a.resume_document_id is null and c.resume_document_id is not null;

-- 3) professional profile + linkedin/notes onto the person (never clobber existing values)
update company_os.people p
   set headline           = coalesce(p.headline, c.headline),
       current_title      = coalesce(p.current_title, c.current_title),
       current_company_id = coalesce(p.current_company_id, c.current_company_id),
       portfolio_url      = coalesce(p.portfolio_url, c.portfolio_url),
       linkedin_url       = coalesce(p.linkedin_url, c.linkedin_url),
       notes              = coalesce(p.notes, c.notes)
  from company_os.candidates c
 where c.person_id = p.id;

-- 4) do_not_pursue → recruiting-scoped do_not_hire (NOT do_not_contact, which is consent)
update company_os.people p
   set do_not_hire = true
  from company_os.candidates c
 where c.person_id = p.id and c.pool_status = 'do_not_pursue';

-- 5) seed slugs from titles (uniqueness enforced in Phase 4, before we publish)
update company_os.job_requisitions
   set slug = trim(both '-' from regexp_replace(lower(title), '[^a-z0-9]+', '-', 'g'))
 where slug is null;
