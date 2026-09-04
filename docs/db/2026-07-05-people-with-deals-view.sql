-- Applied 2026-07-05 to the "Edge8 Company Database" project (company_os schema)
-- via Supabase MCP migration `create_people_with_deals_view`. Additive only.
-- Canonical schema lives in the company-os repo; this file is a local record.
--
-- Read-only reporting view for the admin contacts list: adds a per-person
-- deal value (open + won, USD) so the list can sort/filter by it without
-- shipping every deals row to the client. New views need an explicit
-- service_role grant (they don't inherit the base table's grants).

create or replace view company_os.people_with_deals as
select
  p.*,
  coalesce(d.deal_value_usd_cents, 0) as deal_value_usd_cents,
  coalesce(d.deal_count, 0) as deal_count
from company_os.people p
left join (
  select person_id,
         sum(amount_usd_cents) filter (where status in ('open', 'won')) as deal_value_usd_cents,
         count(*) as deal_count
  from company_os.deals
  where person_id is not null and archived_at is null
  group by person_id
) d on d.person_id = p.id;

grant select on company_os.people_with_deals to service_role;
