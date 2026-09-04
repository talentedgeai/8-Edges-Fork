-- Configurable per-client roadmap groups.
-- Before this, every client roadmap was forced into the hardcoded 5-step
-- template (foundation / reports / assist / automation / north). Groups are now
-- rows a client's roadmap owns: any number, any titles, any order. The old
-- layout survives in code as ROADMAP_TEMPLATE (lib/client-backlog.ts), an
-- optional seed.
--
-- Applied to Supabase project wwchefrgkkxmhlkntufm on 2026-08-15 via
-- scripts/crm/db.mjs (postgres role).

create table if not exists company_os.client_roadmap_groups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company_os.companies(id) on delete cascade,
  key text not null,
  step_label text,
  title text not null,
  intro text,
  sort_order integer not null default 0,
  archived_at timestamptz,
  archived_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, key)
);

create index if not exists client_roadmap_groups_company_idx
  on company_os.client_roadmap_groups (company_id, sort_order);

alter table company_os.client_roadmap_groups enable row level security;

-- Same access model as client_backlog_items: service-role only (RLS on, no
-- policies), read-only for the chatbot reader.
grant select, insert, update, delete on company_os.client_roadmap_groups to service_role;
grant select on company_os.client_roadmap_groups to chatbot_reader;
grant select, insert, update on company_os.client_roadmap_groups to chatbot_writer;

-- Items may now live in any group their company defines.
alter table company_os.client_backlog_items
  drop constraint if exists client_backlog_items_group_key_check;

-- Seed the template groups for every company that already has backlog items, so
-- existing roadmaps render exactly as before.
insert into company_os.client_roadmap_groups (company_id, key, step_label, title, intro, sort_order)
select c.company_id, t.key, t.step_label, t.title, t.intro, t.sort_order
from (select distinct company_id from company_os.client_backlog_items) c
cross join (
  values
    ('foundation', 'Step 1', 'Data Foundation: one-way syncs into the central database',
     'Read-only, masked-in-transit syncs from each source system into the central database. Every report and automation depends on one or more of these.', 10),
    ('reports', 'Step 1', 'Reports on demand: built once, refreshed from the database',
     'Each replaces a manual compile-and-email routine with a report that refreshes itself from the central database, plus AI-written commentary.', 20),
    ('assist', 'Anytime', 'AI assist: no data sync required',
     'Drafting and checking work AI can do today with good instructions. No integration dependencies, so these can start immediately.', 30),
    ('automation', 'Step 2', 'Cross-system automation: needs two-way sync',
     'These write back into source systems, so they follow Step 1 and per-system API research. Chosen together once the foundation is live.', 40),
    ('north', 'North Star', 'Bigger builds and open gaps',
     'Where this goes once the foundation is earning its keep, plus gaps in the current audit coverage that need client input.', 50)
) as t(key, step_label, title, intro, sort_order)
on conflict (company_id, key) do nothing;
