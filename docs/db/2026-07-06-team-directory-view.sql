-- Applied 2026-07-06 to the "Edge8 Company Database" project (company_os schema)
-- via Supabase MCP migration `create_team_directory_view`. Additive, read-only.
--
-- company_os.team_directory: one row per team member, enriching the normalized
-- HR tables with the latest synced Dayoff facts (team, work schedule, and the
-- current-period leave balance) that are not modeled relationally. Powers the
-- Time Off -> People table and the Talent -> Team member detail page.
--
-- Identity/employment stay sourced from the owned tables; team/location/leave
-- policy fall back to the normalized value when the Dayoff snapshot is missing.
-- Balance uses the Dayoff "group=1" period, empirically the current entitlement
-- (validated against the Dayoff UI: e.g. 9/21, 7/10.15, 6.5/13.32).
--
-- The app reaches company_os via the service-role key; new objects in this
-- schema don't inherit grants, so an explicit grant is required.

create or replace view company_os.team_directory as
with emp as ( -- latest employees-snapshot row per Dayoff EmployeeID
  select distinct on ((r->>'EmployeeID')::int)
    (r->>'EmployeeID')::int as eid,
    nullif(btrim(r->>'TeamName'), '') as dayoff_team,
    nullif(btrim(r->>'LocationName'), '') as dayoff_location,
    nullif(btrim(r->>'LeavePolicyName'), '') as dayoff_leave_policy
  from company_os.dayoff_snapshot ds
  cross join lateral jsonb_array_elements(ds.payload->'Results') r
  where ds.endpoint = '/api/doc/employees'
  order by (r->>'EmployeeID')::int, ds.fetched_at desc
),
sched as ( -- latest work schedule per employee
  select distinct on ((params->>'employee')::int)
    (params->>'employee')::int as eid,
    nullif(btrim(payload->>'ScheduleName'), '') as work_schedule
  from company_os.dayoff_snapshot
  where endpoint = '/api/doc/employees/workSchedules'
  order by (params->>'employee')::int, fetched_at desc
),
bal_latest as ( -- latest group=1 balance snapshot per employee
  select distinct on ((params->>'employee')::int)
    (params->>'employee')::int as eid, payload
  from company_os.dayoff_snapshot
  where endpoint = '/api/doc/balances' and params->>'group' = '1'
  order by (params->>'employee')::int, fetched_at desc
),
bal as ( -- sum the balance entries within that snapshot
  select bl.eid,
    sum((b->>'UsedBalance')::numeric) as used_days,
    sum((b->>'TotalBalance')::numeric) as total_days
  from bal_latest bl
  cross join lateral jsonb_array_elements(bl.payload) b
  group by bl.eid
)
select
  t.id,
  t.person_id,
  p.full_name,
  p.email,
  p.auth_user_id,
  t.status,
  t.employee_number,
  t.employment_type,
  t.start_date,
  t.end_date,
  t.dayoff_employee_id,
  d.name  as department_name,
  pos.title as position_title,
  le.name as legal_entity_name,
  lp.name as leave_policy_name,
  mgr_p.full_name as manager_name,
  coalesce(emp.dayoff_team, d.name)              as team,
  coalesce(emp.dayoff_location, t.work_location) as location,
  coalesce(emp.dayoff_leave_policy, lp.name)     as leave_policy,
  sched.work_schedule,
  bal.used_days,
  bal.total_days
from company_os.team_members t
join company_os.people p on p.id = t.person_id
left join company_os.departments d    on d.id   = t.department_id
left join company_os.positions pos     on pos.id = t.position_id
left join company_os.legal_entities le on le.id  = t.legal_entity_id
left join company_os.leave_policies lp on lp.id  = t.leave_policy_id
left join company_os.team_members mgr  on mgr.id = t.manager_id
left join company_os.people mgr_p      on mgr_p.id = mgr.person_id
left join emp   on emp.eid   = t.dayoff_employee_id
left join sched on sched.eid = t.dayoff_employee_id
left join bal   on bal.eid   = t.dayoff_employee_id;

grant select on company_os.team_directory to service_role;
