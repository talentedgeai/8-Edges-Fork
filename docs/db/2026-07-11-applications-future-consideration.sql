-- Add "future_consideration" status to company_os.applications and run the
-- one-off data cleanup requested by Dave:
--   - all On Hold -> Future Consideration
--   - all Active -> Rejected, EXCEPT applications for a req with "engineer"
--     in the title, applied on/after 2026-06-01 (currently: 4 "AI Engineer"
--     applications), which stay Active.
-- Applied directly via Supabase MCP (apply_migration + execute_sql), not
-- through supabase/migrations. Recorded here per the docs/db/ convention.

alter table company_os.applications
  drop constraint applications_status_check;

alter table company_os.applications
  add constraint applications_status_check
  check (status = any (array['active','on_hold','passive','withdrawn','rejected','hired','future_consideration']));

begin;

update company_os.applications
set status = 'future_consideration'
where status = 'on_hold';

update company_os.applications a
set status = 'rejected'
where a.status = 'active'
  and not (
    a.job_requisition_id in (select id from company_os.job_requisitions where title ilike '%engineer%')
    and a.applied_at >= '2026-06-01'
  );

commit;
